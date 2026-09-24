// §49 缓存与增量执行（v0.1 §49）：cache key 基于 gate/executor/input/config/env hash，
// 避免重复运行。诚实语义：缓存只在 input 与 config 均未变时命中；命中返回上一轮证据
// （execution 标记 'cached'——不是 exercised，因此不会因缓存虚报 PASS，决策层照旧判定）。
//
// 缓存位与 evidence 生命周期纪律一致（v0.1 §48）：输入一变（gate 版本 / executor 版本 /
// 配置 hash / 变更路径）即失效。

import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Evidence, ExecutorSpec, GateSpec } from './types.js'

export interface CacheContext {
  qgateDir: string
  workspace: string
  commit?: string
  treeHash?: string
  changedPaths: readonly string[]
}

export interface CacheKeyParts {
  gateVersion: string
  executorId: string
  input: string
  config: string
  env: string
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 20)
}

/** 计算门的 cache key（§49 五要素：gate 版本 / executor 面 / 输入锚 / 门配置 / 环境）。
 *  证据按整门缓存（一次 run 的证据列表为一条缓存），输入或配置任一变化即 key 漂移。 */
export function cacheKeyFor(
  spec: GateSpec,
  executors: readonly ExecutorSpec[],
  ctx: CacheContext,
): string {
  const parts: CacheKeyParts = {
    gateVersion: `${spec.metadata.id}@${spec.metadata.version}`,
    executorId: executors.map((e) => `${e.type}:${e.id}`).sort().join(','),
    input: JSON.stringify({ commit: ctx.commit ?? '', treeHash: ctx.treeHash ?? '', changed: [...ctx.changedPaths].sort() }),
    config: JSON.stringify({ policy: spec.spec.policy, evidence: spec.spec.evidence, executors }),
    env: JSON.stringify({ node: process.version, cwd: ctx.workspace }),
  }
  return sha256(parts.gateVersion + '|' + parts.executorId + '|' + parts.input + '|' + parts.config + '|' + parts.env)
}

function cacheDir(qgateDir: string): string {
  return join(qgateDir, 'cache', 'evidence')
}

export interface CachedEntry {
  key: string
  at: number
  evidence: Evidence[]
}

/** 命中缓存：key 存在且未过期（maxAgeHours 内；默认 24h，policy maxAgeHours 可覆盖）。 */
export function cacheGet(qgateDir: string, key: string, maxAgeHours = 24): CachedEntry | null {
  const file = join(cacheDir(qgateDir), `${key}.json`)
  if (!existsSync(file)) return null
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as CachedEntry
    const ageH = (Date.now() - raw.at) / 3_600_000
    if (ageH > maxAgeHours) return null
    return raw
  } catch {
    return null
  }
}

/** 写入缓存。 */
export function cachePut(qgateDir: string, key: string, evidence: readonly Evidence[]): void {
  const dir = cacheDir(qgateDir)
  mkdirSync(dir, { recursive: true })
  // 同一 run 的 evidence 共享 key（一次 run 对应一次缓存条目）
  writeFileSync(join(dir, `${key}.json`), JSON.stringify({
    key, at: Date.now(), evidence: evidence as Evidence[],
  } as CachedEntry))
}

/** 把缓存命中证据标记为 cached execution（不是 exercised——诚实语义，决策层照旧判定）。 */
export function markCached(evidence: readonly Evidence[], key: string): Evidence[] {
  return evidence.map((e) => ({
    ...e,
    id: `${e.id}-cached-${key.slice(0, 6)}`,
    execution: 'cached' as const,
    summary: `${e.summary ?? ''} [cached at ${new Date().toISOString()}]`,
  }))
}

/** 清理过期缓存（§49 生命周期纪律）。 */
export function cacheGc(qgateDir: string, maxAgeHours = 24): number {
  const dir = cacheDir(qgateDir)
  if (!existsSync(dir)) return 0
  let removed = 0
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    const file = join(dir, name)
    try {
      const ageH = (Date.now() - statSync(file).mtimeMs) / 3_600_000
      if (ageH > maxAgeHours) { unlinkSync(file); removed++ }
    } catch { /* skip */ }
  }
  return removed
}

/** 触发一次新的 cache key（内容变化时会生成新 key，不命中旧缓存）。 */
export function freshRunId(): string {
  return `run-${Date.now()}-${randomUUID().slice(0, 6)}`
}
