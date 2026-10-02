// 输入快照（v0.3 §3.2，上游 inputSnapshot/inputsStable 本地方言）：
// 门声明输入面（appliesWhen glob 命中的工作区文件）的 sha256 索引。
// 用途二：run 执行前后各取一次 → inputsStable（门没有改写自己的输入）；
// status --fresh 时重算并与 run 存档比对 → 证据是否仍新鲜的确定性判定。
// 限界：深度 ≤8、跳过 node_modules/.git、快照 ≤200 项（超出截断并标记）。

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { globMatch } from './impact.js'

export const SNAPSHOT_LIMIT = 200
/** 快照截断标记键（非真实路径形态，不与 glob 命中的相对路径冲突）。 */
export const SNAPSHOT_TRUNCATED_KEY = '__qgate_snapshot_truncated__'

/** 工作区相对路径文件清单（深度 ≤8，跳过 node_modules/.git，总数 ≤fileLimit）。 */
export function listWorkspaceFiles(workspace: string, fileLimit = 5000): string[] {
  const out: string[] = []
  const visit = (dir: string, depth: number): void => {
    if (depth > 8 || out.length >= fileLimit) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (name === 'node_modules' || name === '.git') continue
      if (out.length >= fileLimit) return
      const full = join(dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) visit(full, depth + 1)
      else out.push(relative(workspace, full))
    }
  }
  visit(workspace, 0)
  return out.sort()
}

/** 命中任一 glob 的文件 → sha256 索引（键排序保证确定性）。files 可复用外部清单避免重复走树。 */
export function snapshotForGlobs(
  workspace: string,
  globs: readonly string[],
  files?: readonly string[],
  limit = SNAPSHOT_LIMIT,
): Record<string, string> {
  if (globs.length === 0) return {}
  const universe = files ?? listWorkspaceFiles(workspace)
  const matched = universe.filter((rel) => globs.some((g) => globMatch(g, rel)))
  const out: Record<string, string> = {}
  if (matched.length > limit) {
    // 截断必须留痕（2026-10-02 审查批）：两轮同样截断的快照逐键相等，会让第 limit+1 个
    // 输入的变更逃过新鲜度比对（陈旧证据被误判 fresh）——isFresh 见此标记即判不新鲜
    // （fail-closed：宁可重跑门，不放过截断面外的变更）。
    out[SNAPSHOT_TRUNCATED_KEY] = String(matched.length)
  }
  for (const rel of matched.slice(0, limit)) {
    const full = join(workspace, rel)
    if (!existsSync(full)) continue
    try {
      out[rel] = createHash('sha256').update(readFileSync(full)).digest('hex')
    } catch {
      /* 读不了的文件不进快照（比对时缺席即不一致，fail-closed 方向） */
    }
  }
  return out
}

/** 门声明的输入 glob 面：appliesWhen.changed.any/all 合集。 */
export function inputGlobsOf(spec: { spec: { appliesWhen?: { changed: { any?: string[]; all?: string[] } } } }): string[] {
  const changed = spec.spec.appliesWhen?.changed
  return [...(changed?.any ?? []), ...(changed?.all ?? [])]
}

/** 快照逐项比对：两边都非空才有判定力；任一键缺失或哈希不符即不一致。 */
export function snapshotsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  if (keys.size === 0) return true
  for (const k of keys) {
    if (a[k] === undefined || b[k] === undefined || a[k] !== b[k]) return false
  }
  return true
}
