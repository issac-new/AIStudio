/**
 * 板级 KG 版本快照+回滚（A4，2026-10-02 动态本体三部曲调研落地）。
 *
 * 形态照抄 decisiongraph/replay.ts 的快照模式（copyFileSync tmp+rename 原子落盘、
 * 保留上限 prune、文件名时间序即版本序）：
 *   - snapshotBoardKg：syncBoardGraph 成功且 ingested>0 后自动快照（接线在成功路径）；
 *   - listBoardSnapshots：ts 降序 + 每份大小/节点数；
 *   - rollbackBoardKg：回滚前先把当前文件另存 pre-rollback-<epoch>.json（可再回滚），
 *     再用快照 tmp+rename 覆盖当前 KG。
 *
 * 语义边界（如实登记）：**marker 不动**——实体摄取 marker（已见任务集合）与图状态
 * 是两层：回滚只还原图文件，marker 若被一并回滚会把已摄取任务再次入批（重复冲突
 * 上报）；marker 保持现状意味着"回滚后已摄取任务不会自动重放"，需要重放时清 marker
 * 手动触发同步。
 *
 * 存储约定：版本目录 env KG_VERSION_DIR > ~/.hermes/semantica/board-snapshots，
 * 每板一个子目录 board-<slug>/；保留 KG_SNAPSHOT_MAX（默认 50，SNAP_MAX）份，
 * kg-* 与 pre-rollback-* 各自按上限裁剪。全部 fail-soft 不抛。
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { boardKgPath } from './board-graph'

export const SNAP_MAX = 50

function versionRoot(): string {
  const env = process.env.KG_VERSION_DIR?.trim()
  if (env) return resolve(env.replace(/^~/, homedir()))
  return join(homedir(), '.hermes', 'semantica', 'board-snapshots')
}

function snapMax(): number {
  const raw = Number(process.env.KG_SNAPSHOT_MAX)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : SNAP_MAX
}

export function boardKgVersionDir(slug: string): string {
  const safe = slug.replace(/[^A-Za-z0-9._-]/g, '_') || 'main'
  return join(versionRoot(), `board-${safe}`)
}

/** 单板快照：当前 KG 文件 → <dir>/kg-<epoch-ms>.json（tmp+rename）；缺席返回 null。 */
export type SnapshotLabel = 'auto-pre' | 'auto-post' | 'rollback' | 'manual'

export function snapshotBoardKg(slug: string, now = Date.now(), label: SnapshotLabel = 'manual'): string | null {
  const kg = boardKgPath(slug)
  if (!existsSync(kg)) return null
  try {
    const dir = boardKgVersionDir(slug)
    mkdirSync(dir, { recursive: true })
    // KG 写入是 tmp+rename 原子（bridge save_atomic），copy 读到的一定是完整文件
    const out = join(dir, `kg-${now}.json`)
    const tmp = `${out}.tmp-${process.pid}`
    copyFileSync(kg, tmp)
    renameSync(tmp, out)
    // 元数据边车（A4 校准 2026-10-03，源文③：快照带 label/原因可审计）；
    // 写失败不阻塞快照本身（缺边车=列表显示 auto 缺省）
    try {
      writeFileSync(join(dir, `kg-${now}.meta.json`), JSON.stringify({ ts: now, label }))
    } catch { /* 边车缺省可接受 */ }
    pruneBoardSnapshots(slug)
    return out
  } catch {
    return null
  }
}

/** 快照列表（ts 降序=新→旧；含每份大小与节点数，坏文件节点数记 0）。 */
export function listBoardSnapshots(slug: string): Array<{ ts: number; file: string; bytes: number; nodes: number; label: string }> {
  const dir = boardKgVersionDir(slug)
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir)
      .filter((f) => /^kg-\d+\.json$/.test(f))
      .map((f) => {
        const file = join(dir, f)
        let bytes = 0
        let nodes = 0
        try {
          bytes = statSync(file).size
          const j = JSON.parse(readFileSync(file, 'utf8')) as { nodes?: unknown[] }
          if (Array.isArray(j.nodes)) nodes = j.nodes.length
        } catch { /* 单份坏文件如实记 0，不拖垮整列 */ }
        let label = 'auto'
        try {
          const meta = JSON.parse(readFileSync(join(dir, f.replace(/\.json$/, '.meta.json')), 'utf8')) as { label?: string }
          if (typeof meta.label === 'string' && meta.label) label = meta.label
        } catch { /* 旧档无边车：label=auto */ }
        return { ts: Number(f.slice(3, -5)), file, bytes, nodes, label }
      })
      .sort((a, b) => b.ts - a.ts)
  } catch {
    return []
  }
}

/** 裁剪（kg-* 与 pre-rollback-* 各自保留最新 snapMax 份；导出供守门测试驱动）。 */
export function pruneBoardSnapshots(slug: string): void {
  const dir = boardKgVersionDir(slug)
  if (!existsSync(dir)) return
  const max = snapMax()
  for (const pattern of [/^kg-(\d+)\.json$/, /^pre-rollback-(\d+)\.json$/]) {
    try {
      const files = readdirSync(dir)
        .filter((f) => pattern.test(f))
        .map((f) => ({ f, ts: Number(f.replace(pattern, '$1')) }))
        .sort((a, b) => b.ts - a.ts)
      for (const { f } of files.slice(max)) {
        try { rmSync(join(dir, f)) } catch { /* 删失败留待下轮 */ }
        // 伴随清理同名 .meta.json 边车（孤儿边车无消费方，留着只积灰）
        try { rmSync(join(dir, f.replace(/\.json$/, '.meta.json'))) } catch { /* 同上 */ }
      }
    } catch { /* 读目录失败放弃本轮裁剪 */ }
  }
}

export interface RollbackResult {
  ok: boolean
  /** 回滚所用快照。 */
  snapshot?: string
  /** 回滚前当前状态的另存文件（可再回滚回去）。 */
  preRollback?: string
  error?: string
}

/**
 * 回滚：当前 KG 先另存 pre-rollback-<epoch>.json，再用快照 tmp+rename 覆盖。
 * marker 不动（语义边界见文件头注释）。
 */
export function rollbackBoardKg(slug: string, ts: number, now = Date.now()): RollbackResult {
  const hit = listBoardSnapshots(slug).find((s) => s.ts === ts)
  if (!hit) return { ok: false, error: `快照不存在：kg-${ts}.json` }
  const kg = boardKgPath(slug)
  if (!existsSync(kg)) return { ok: false, error: '当前 KG 文件缺席（无可回滚前态）' }
  try {
    const dir = boardKgVersionDir(slug)
    mkdirSync(dir, { recursive: true })
    const pre = join(dir, `pre-rollback-${now}.json`)
    const preTmp = `${pre}.tmp-${process.pid}`
    copyFileSync(kg, preTmp)
    renameSync(preTmp, pre)
    try { writeFileSync(join(dir, `pre-rollback-${now}.meta.json`), JSON.stringify({ ts: now, label: 'rollback' })) } catch { /* 缺省可接受 */ }
    const tmp = `${kg}.tmp-${process.pid}`
    copyFileSync(hit.file, tmp)
    renameSync(tmp, kg)
    pruneBoardSnapshots(slug)
    return { ok: true, snapshot: hit.file, preRollback: pre }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
