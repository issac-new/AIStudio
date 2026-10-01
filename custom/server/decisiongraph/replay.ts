/**
 * 双时态状态回放（丁9，2026-09-30 调研落地）——"决策发生那一刻系统状态是什么样"。
 *
 * 形态：studio KG 定期快照（record 成功后节流 5min 触发，bridge snapshot 拷贝，
 * 保留最近 SNAP_MAX 份）；回放查询=找 ≤at 的最近快照在其上跑 list——服务 G5 误判
 * 类事后复盘（"当时图谱里有什么决策"）。如实边界：快照粒度=节流间隔，at 与快照
 * 时点之间的增量不可见（返回 snapshotTs 供判断精度）。
 */
import { existsSync, readdirSync, renameSync, mkdirSync, copyFileSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { listDecisions, semanticaPython, studioKgPath } from './semantica-client'
import { spawn } from 'node:child_process'
import { bridgeScript } from './semantica-client'

export const SNAP_MAX = 50
const SNAPSHOT_THROTTLE_MS = 5 * 60 * 1000

export function snapshotsDir(): string {
  const env = process.env.SEMANTICA_SNAPSHOT_DIR?.trim()
  if (env) return resolve(env.replace(/^~/, homedir()))
  return join(studioKgPath(), '..', 'snapshots')
}

let lastSnapshotAt = 0

/** record 成功后调用：节流快照（fail-soft；测试可用 force 绕过节流）。 */
export function maybeSnapshot(opts: { force?: boolean } = {}): void {
  const now = Date.now()
  if (!opts.force && now - lastSnapshotAt < SNAPSHOT_THROTTLE_MS) return
  lastSnapshotAt = now
  void snapshotNow()
}

async function snapshotNow(): Promise<string | null> {
  const kg = studioKgPath()
  if (!existsSync(kg) || !semanticaPython()) return null
  const dir = snapshotsDir()
  try {
    mkdirSync(dir, { recursive: true })
    // kg 写入是 tmp+rename 原子（bridge save_atomic），直接 copy 读到的一定是完整文件
    const out = join(dir, `kg-${Date.now()}.json`)
    const tmp = `${out}.tmp`
    copyFileSync(kg, tmp)
    renameSync(tmp, out)
    pruneSnapshots()
    return out
  } catch {
    return null
  }
}

/** 快照列表（文件名时间序，旧→新）。 */
export function listSnapshots(): Array<{ file: string; ts: number }> {
  const dir = snapshotsDir()
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir)
      .filter((f) => /^kg-\d+\.json$/.test(f))
      .map((f) => ({ file: join(dir, f), ts: Number(f.slice(3, -5)) }))
      .sort((a, b) => a.ts - b.ts)
  } catch {
    return []
  }
}

/** 快照裁剪（保留最新 SNAP_MAX 份；导出供守门测试直接驱动——曾只经 snapshotNow
 *  内部调用，测试无法触达=裁剪逻辑零覆盖）。 */
export function pruneSnapshots(): void {
  const snaps = listSnapshots()
  for (const s of snaps.slice(0, Math.max(0, snaps.length - SNAP_MAX))) {
    try { rmSync(s.file) } catch { /* 删失败留待下轮 */ }
  }
}

export interface ReplayResult {
  at: number
  snapshotTs: number | null
  /** 快照时点与查询时点的偏差（ms）——精度提示，快照缺席为 null。 */
  lagMs: number | null
  decisions: Array<{ id: string; category: string | null; scenario: string | null; outcome: string | null; confidence: number | null }>
}

/** 回放：≤at 最近快照上的决策清单（bridge list 跑在快照文件上）。 */
export async function replayDecisions(atMs: number): Promise<ReplayResult> {
  const snaps = listSnapshots().filter((s) => s.ts <= atMs)
  const latest = snaps[snaps.length - 1]
  if (!latest) return { at: atMs, snapshotTs: null, lagMs: null, decisions: [] }
  const python = semanticaPython()
  if (!python) return { at: atMs, snapshotTs: latest.ts, lagMs: atMs - latest.ts, decisions: [] }
  const decisions = await new Promise<ReplayResult['decisions']>((res) => {
    const child = spawn(python, [bridgeScript(), 'list', '--kg', latest.file, '--limit', '200'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), 15000)
    child.stdout.on('data', (d: Buffer) => { out += d.toString() })
    // stderr 必须消费：python 警告撑满管道缓冲会让子进程阻塞到超时被杀，回放恒空
    child.stderr.on('data', () => {})
    child.on('error', () => { clearTimeout(timer); res([]) })
    child.on('close', () => {
      clearTimeout(timer)
      const lines = out.split('\n').filter((l) => l.trim().startsWith('{'))
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(lines[i]) as { ok?: boolean; decisions?: ReplayResult['decisions'] }
          if (parsed.ok !== false && Array.isArray(parsed.decisions)) { res(parsed.decisions); return }
        } catch { /* 找下一行 */ }
      }
      res([])
    })
    child.stdin.on('error', () => {})
    child.stdin.end()
  })
  return { at: atMs, snapshotTs: latest.ts, lagMs: atMs - latest.ts, decisions }
}

/** 快照体积（守门/巡检用）。 */
export function snapshotStats(): { count: number; totalBytes: number } {
  const snaps = listSnapshots()
  let totalBytes = 0
  for (const s of snaps) {
    try { totalBytes += statSync(s.file).size } catch { /* 单文件失败忽略 */ }
  }
  return { count: snaps.length, totalBytes }
}

export { listDecisions }
