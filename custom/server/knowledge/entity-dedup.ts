/**
 * 相似度三档去重（A2，2026-10-02 动态本体三部曲调研落地）。
 *
 * 候选实体与同 type 已有实体比**名称相似度**，三档动作：
 *   ≥ autoAliasThreshold（默认 0.85，env KG_DEDUP_AUTO）  → 自动别名：仍写入，props 加
 *     aliasOf=<已有实体 id>，且不计入治理分级的新增计数；
 *   reviewThreshold（默认 0.6，env KG_DEDUP_REVIEW）～ auto → 转人工：进收件箱
 *     kind:'merge-review' 条目（带 similarity 与双方名称），不写入；
 *   < reviewThreshold                                    → 正常新实体。
 *
 * 相似度=token Jaccard 与 Levenshtein 比率取加权 0.5/0.5（比对前 normalize：小写/
 * 去标点/压缩空白）。文章警示的形状坑：props 字段形状不一致（名称非非空字符串等）
 * 一律剔除不比——宁可漏报不误并。
 *
 * 默认只对 type='agent' 去重（task id 天然唯一，标题相同也是不同任务）；env
 * KG_DEDUP_TASKS=1 可开 task 档（按 title 比）。纯函数：env 读取在调用侧。
 */
import type { GovEntity } from './merge-governance'

/** 已有实体（板 KG JSON 的 node 投影，字段缺省即形状不兼容）。 */
export interface ExistingEntity {
  id: string
  type: string
  name: unknown
}

export interface DedupOptions {
  autoAliasThreshold?: number
  reviewThreshold?: number
  /** 参与去重的实体 type 集合（默认 ['agent']）。 */
  dedupTypes?: string[]
}

export interface DedupAlias {
  entity: GovEntity
  aliasOf: string
  similarity: number
}

export interface DedupReview {
  entity: GovEntity
  matchId: string
  similarity: number
  candidateName: string
  existingName: string
}

export interface DedupResult {
  /** 自动别名档：原实体（调用侧负责补 props.aliasOf 后写入）。 */
  alias: DedupAlias[]
  /** 转人工档：不写入，进 merge-review 收件箱。 */
  review: DedupReview[]
  /** 正常新实体档。 */
  fresh: GovEntity[]
  /** 形状/类型不符跳过比对的候选（原样透传到 fresh 之后的调用侧处置）。 */
  skipped: GovEntity[]
}

export const DEFAULT_AUTO_ALIAS_THRESHOLD = 0.85
export const DEFAULT_REVIEW_THRESHOLD = 0.6

/** 归一化：小写、去标点、压缩空白。 */
export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

function tokenJaccard(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter(Boolean))
  const tb = new Set(b.split(' ').filter(Boolean))
  if (!ta.size || !tb.size) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter += 1
  return inter / (ta.size + tb.size - inter)
}

/** Levenshtein 距离（小串足够，板级实体名长度有限）。 */
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]
}

function levenshteinRatio(a: string, b: string): number {
  if (!a.length && !b.length) return 1
  const d = levenshtein(a, b)
  return 1 - d / Math.max(a.length, b.length)
}

/** 综合相似度：Jaccard 与 Levenshtein 比率加权 0.5/0.5（导出供守门测试直接断言）。 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return 0
  return 0.5 * tokenJaccard(na, nb) + 0.5 * levenshteinRatio(na, nb)
}

/**
 * 三档去重。candidates 为本批新实体（调用侧应已剔除图中同 id 者）；existing 为
 * 板 KG JSON 读出的既有实体投影。取每个候选在同 type 既有实体中的最高相似度定档。
 */
export function threeTierDedup(candidates: GovEntity[], existing: ExistingEntity[], opts: DedupOptions = {}): DedupResult {
  const auto = opts.autoAliasThreshold ?? DEFAULT_AUTO_ALIAS_THRESHOLD
  const review = opts.reviewThreshold ?? DEFAULT_REVIEW_THRESHOLD
  const types = new Set(opts.dedupTypes ?? ['agent'])

  // 既有实体按 type 分桶，且只留"名称形状可比"者（非空 string）——形状坑剔除
  const byType = new Map<string, Array<{ id: string; name: string }>>()
  for (const e of existing) {
    if (typeof e.name !== 'string' || !e.name.trim()) continue
    const bucket = byType.get(e.type) ?? []
    bucket.push({ id: e.id, name: e.name })
    byType.set(e.type, bucket)
  }

  const res: DedupResult = { alias: [], review: [], fresh: [], skipped: [] }
  for (const c of candidates) {
    if (!types.has(c.type)) { res.skipped.push(c); continue }
    // 候选名：agent=props.name，task=props.title；形状不可比→跳过（不比不误并）
    const cname = c.type === 'task' ? c.props.title : c.props.name
    if (typeof cname !== 'string' || !cname.trim()) { res.skipped.push(c); continue }
    const pool = byType.get(c.type) ?? []
    let best: { id: string; name: string; sim: number } | null = null
    for (const e of pool) {
      if (e.id === c.id) continue  // 同 id 不自比（调用侧已剔除，防御）
      const sim = nameSimilarity(cname, e.name)
      if (!best || sim > best.sim) best = { id: e.id, name: e.name, sim }
    }
    if (best && best.sim >= auto) {
      res.alias.push({ entity: c, aliasOf: best.id, similarity: best.sim })
    } else if (best && best.sim >= review) {
      res.review.push({ entity: c, matchId: best.id, similarity: best.sim, candidateName: cname, existingName: best.name })
    } else {
      res.fresh.push(c)
    }
  }
  return res
}

/** 读 env 去重档位（守门：非法值回落默认，review 必须小于 auto 才生效）。 */
export function dedupOptsFromEnv(): DedupOptions {
  const a = Number(process.env.KG_DEDUP_AUTO)
  const r = Number(process.env.KG_DEDUP_REVIEW)
  const opts: DedupOptions = {
    autoAliasThreshold: Number.isFinite(a) && a > 0 && a <= 1 ? a : DEFAULT_AUTO_ALIAS_THRESHOLD,
    reviewThreshold: Number.isFinite(r) && r > 0 && r <= 1 ? r : DEFAULT_REVIEW_THRESHOLD,
  }
  if ((opts.reviewThreshold as number) >= (opts.autoAliasThreshold as number)) {
    opts.autoAliasThreshold = DEFAULT_AUTO_ALIAS_THRESHOLD
    opts.reviewThreshold = DEFAULT_REVIEW_THRESHOLD
  }
  if (process.env.KG_DEDUP_TASKS === '1') opts.dedupTypes = ['agent', 'task']
  return opts
}
