// overlay/obssignals 域：四层上下文读取计量（2026-10-30 HelixHarness 吸收轮）。
//
// 源问题：框架宣称 knowledge / harness / specs / hooks 四层上下文，但没有任何读数回答
// 「一次任务里各层到底被读了多少」——制度在，使用面不可见（其 telemetry_collector.py
// 的 context_reads 指标正是补这一格）。
//
// 数据来源：custom/qgate/plugin/hooks/post-tool-read.mjs 在 Read 工具边界追加的
// <repo>/.qgate/reads.jsonl（运行态，不入库）。本模块只做纯函数解析与聚合，不碰 IO 逻辑
// 之外的东西，fail-soft：目录/文件/坏行缺席一律如实记 notes，不造数。
//
// 分层表单一事实源：.qgate/context-layers.json（与钩子共用；见该文件 _comment）。
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { repoRoot } from '../lib/upstream'

export const LAYERS = ['knowledge', 'harness', 'specs', 'hooks'] as const
export type ContextLayer = (typeof LAYERS)[number]
export type ContextBucket = ContextLayer | 'other'

export interface LayerConfig {
  layers: Record<ContextLayer, string[]>
}

/** 内置默认（仅当 .qgate/context-layers.json 缺席/坏格式时使用；与钩子 DEFAULT_LAYERS 同构）。 */
export const DEFAULT_LAYERS: LayerConfig = {
  layers: {
    knowledge: ['custom/server/knowledge/', '.swarm-yuan/project-knowledge.md', '.swarm-yuan/notes/', 'skills/swarm-yuan/references/', '.claude/skills/', 'docs/reports/'],
    harness: ['AGENTS.md', 'vendor/VENDOR.md', 'config/', 'registries/', 'scripts/', 'patches/', 'zcode-patches/', 'runtime/', 'skills/swarm-yuan/assets/', 'package.json', 'custom/'],
    specs: ['docs/superpowers/specs/'],
    hooks: ['.swarm-yuan/hooks/', '.qgate/', 'custom/qgate/', '.github/workflows/'],
  },
}

/** 最长前缀胜出：宽前缀（custom/）不得吃掉窄前缀（custom/server/knowledge/）。 */
export function classifyPath(rel: string, cfg: LayerConfig = DEFAULT_LAYERS): ContextBucket {
  const p = rel.split('\\').join('/')
  if (!p || p.startsWith('../') || p.startsWith('/')) return 'other'
  let best: ContextBucket = 'other'
  let bestLen = -1
  for (const layer of LAYERS) {
    for (const prefix of cfg.layers[layer] ?? []) {
      const q = prefix.split('\\').join('/')
      const hit = q.endsWith('/') ? p.startsWith(q) : p === q || p.startsWith(`${q}/`)
      if (hit && q.length > bestLen) {
        bestLen = q.length
        best = layer
      }
    }
  }
  return best
}

export interface ContextReadRow {
  ts: string
  path: string
  layer: ContextBucket
}

export interface ContextReadsDay {
  day: string
  total: number
  knowledge: number
  harness: number
  specs: number
  hooks: number
  other: number
}

export interface ContextReadsReport {
  available: boolean
  days: number
  total: number
  byLayer: Record<ContextBucket, number>
  byDay: ContextReadsDay[]
  topPaths: Array<{ path: string; layer: ContextBucket; count: number }>
  notes: string[]
}

/**
 * 默认账本路径：检出根 .qgate/reads.jsonl，可用 HERMES_CONTEXT_READS_FILE 覆盖（测试/多仓）。
 * 必须走 repoRoot() 而非 process.cwd()：服务进程以 vendor/hermes-studio 为 cwd 启动
 * （serve-server.mjs spawn cwd=upstream），cwd 基准会把账本解析到上游树里永远读不到
 * （2026-10-30 活体验证轮预判修复，与 K17 同族 cwd 陷阱）。
 */
export function readsFile(): string {
  const env = process.env.HERMES_CONTEXT_READS_FILE?.trim()
  if (env) return resolve(env.replace(/^~/, process.env.HOME ?? '~'))
  return join(repoRoot(), '.qgate', 'reads.jsonl')
}

/** JSONL 解析：坏行/坏时间戳跳过并计数，不炸聚合。 */
export function parseReads(text: string, cfg: LayerConfig = DEFAULT_LAYERS): { rows: ContextReadRow[]; skipped: number } {
  const rows: ContextReadRow[] = []
  let skipped = 0
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(t) as Record<string, unknown>
    } catch {
      skipped++
      continue
    }
    const ts = typeof obj.ts === 'string' ? obj.ts : ''
    const path = typeof obj.path === 'string' ? obj.path : ''
    if (!ts || !path) {
      skipped++
      continue
    }
    // 钩子里已分类；这里按当前配置重算（配置演进后旧行仍按新表解释，避免读数失真）。
    rows.push({ ts, path, layer: classifyPath(path, cfg) })
  }
  return { rows, skipped }
}

function dayKey(ts: string): string | null {
  const ms = Date.parse(ts)
  if (Number.isNaN(ms)) return null
  return new Date(ms).toISOString().slice(0, 10)
}

const TOP_N = 10

/** 纯聚合：窗口过滤 + 按日分桶 + 四层小计 + 读得最多的 10 个路径。 */
export function buildContextReads(
  rows: ContextReadRow[],
  opts: { days: number; now?: number; notes?: string[] },
): ContextReadsReport {
  const now = opts.now ?? Date.now()
  const cutoff = now - opts.days * 86_400_000
  const notes = [...(opts.notes ?? [])]
  const byDay = new Map<string, ContextReadsDay>()
  const byLayer: Record<ContextBucket, number> = { knowledge: 0, harness: 0, specs: 0, hooks: 0, other: 0 }
  const pathCount = new Map<string, { layer: ContextBucket; count: number }>()
  let total = 0
  let badTime = 0

  for (const row of rows) {
    const ms = Date.parse(row.ts)
    if (Number.isNaN(ms)) {
      badTime++
      continue
    }
    if (ms < cutoff || ms > now) continue
    const day = dayKey(row.ts)
    if (!day) {
      badTime++
      continue
    }
    const d = byDay.get(day) ?? { day, total: 0, knowledge: 0, harness: 0, specs: 0, hooks: 0, other: 0 }
    d.total++
    d[row.layer]++
    byDay.set(day, d)
    byLayer[row.layer]++
    total++
    const key = `${row.layer}\u0000${row.path}`
    const prev = pathCount.get(key)
    pathCount.set(key, { layer: row.layer, count: (prev?.count ?? 0) + 1 })
  }

  if (badTime > 0) notes.push(`跳过 ${badTime} 行时间戳不可解析的读取事件`)
  if (total === 0) notes.push('窗口内无读取事件（钩子未接入或近期无 Read 工具调用）')

  const topPaths = [...pathCount.entries()]
    .map(([k, v]) => ({ path: k.split('\u0000')[1] ?? k, layer: v.layer, count: v.count }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
    .slice(0, TOP_N)

  return {
    available: total > 0,
    days: opts.days,
    total,
    byLayer,
    byDay: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
    topPaths,
    notes,
  }
}

/** IO 适配：读账本 → 解析 → 聚合。文件缺席/不可读 fail-soft。 */
export function collectContextReads(
  days = 7,
  opts: { file?: string; now?: number; config?: string } = {},
): ContextReadsReport {
  const file = opts.file ?? readsFile()
  const notes: string[] = []
  let cfg = DEFAULT_LAYERS
  const cfgPath = opts.config ?? join(repoRoot(), '.qgate', 'context-layers.json')
  if (existsSync(cfgPath)) {
    try {
      const parsed = JSON.parse(readFileSync(cfgPath, 'utf8')) as { layers?: LayerConfig['layers'] }
      if (parsed.layers) cfg = { layers: { ...DEFAULT_LAYERS.layers, ...parsed.layers } }
    } catch {
      notes.push(`分层表解析失败，使用内置默认：${cfgPath}`)
    }
  }
  if (!existsSync(file)) {
    notes.push(`读取账本缺席：${file}`)
    return { available: false, days, total: 0, byLayer: { knowledge: 0, harness: 0, specs: 0, hooks: 0, other: 0 }, byDay: [], topPaths: [], notes }
  }
  let text = ''
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    notes.push(`读取账本不可读：${file}`)
    return { available: false, days, total: 0, byLayer: { knowledge: 0, harness: 0, specs: 0, hooks: 0, other: 0 }, byDay: [], topPaths: [], notes }
  }
  const { rows, skipped } = parseReads(text, cfg)
  if (skipped > 0) notes.push(`跳过 ${skipped} 行坏数据（JSON 解析失败或缺 ts/path）`)
  return buildContextReads(rows, { days, now: opts.now, notes })
}
