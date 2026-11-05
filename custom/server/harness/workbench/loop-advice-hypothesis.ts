// 文件职责：假设相似度/重提抑制/停滞与剪枝信号（自 loop-advice.ts 纯移动，行为不变）。
import type { Proposal, RegularizationDerived, SurfaceKey } from './types'

// ---- 历史证据表（P2）：失败假设不复提 ----

/** 词面相似度：拉丁词（≥2 字符）+ CJK 字符 bigram 的 Jaccard。 */
export function hypothesisSimilarity(a: string, b: string): number {
  const ta = hypothesisTokens(a)
  const tb = hypothesisTokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter += 1
  const union = new Set([...ta, ...tb]).size
  return union === 0 ? 0 : inter / union
}

function hypothesisTokens(s: string): Set<string> {
  const norm = String(s ?? '').toLowerCase()
  const tokens = new Set<string>()
  for (const w of norm.split(/[^a-z0-9\u4e00-\u9fff]+/)) {
    if (/[a-z0-9]/.test(w) && w.length >= 2) tokens.add(w)
  }
  const cjkSegments = norm.match(/[\u4e00-\u9fff]+/g) ?? []
  for (const seg of cjkSegments) {
    for (let i = 0; i + 1 < seg.length; i += 1) tokens.add(seg.slice(i, i + 2))
  }
  return tokens
}

export const HYPOTHESIS_RETRY_THRESHOLD = 0.6

/** 同面历史失败假设（rejected/rolled_back）中与当前假设词面高度相似者。 */
export function hypothesisRetries(
  proposals: Proposal[],
  surfaceKey: SurfaceKey,
  currentProposalId: string,
  hypothesis: string,
  threshold: number = HYPOTHESIS_RETRY_THRESHOLD,
): RegularizationDerived['hypothesisRetry'] {
  return proposals
    .filter((p) => p.surfaceKey === surfaceKey && p.id !== currentProposalId
      && (p.status === 'rejected' || p.status === 'rolled_back'))
    .map((p) => ({ p, similarity: hypothesisSimilarity(hypothesis, p.hypothesis) }))
    .filter((x) => x.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5)
    .map((x) => ({ proposalId: x.p.id, title: x.p.title, status: x.p.status, similarity: Number(x.similarity.toFixed(2)) }))
}

// ---- 停滞探测（P3）与剪枝信号（S4） ----

/** 最近 stallWindow 个提案均未被采纳（promoted 且未回滚才算采纳）→ 停滞。 */
export function stallDetection(surfaceProposals: Proposal[], stallWindow: number): boolean {
  const sorted = surfaceProposals.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  if (sorted.length < stallWindow) return false
  const recent = sorted.slice(-stallWindow)
  return recent.every((p) => p.status !== 'promoted')
}

/** 最近 pruneN 个提案的全部已记录探测中，最大通过率增量 ≤0 → 该面建议做减法提案。 */
export function pruneSignal(surfaceProposals: Proposal[], pruneN: number): boolean {
  const sorted = surfaceProposals.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  const recent = sorted.slice(-pruneN)
  const deltas: number[] = []
  for (const p of recent) {
    for (const probe of p.probes) {
      if (probe.status === 'recorded' && probe.contrast?.passAt1Delta != null) {
        deltas.push(probe.contrast.passAt1Delta)
      }
    }
  }
  return deltas.length > 0 && Math.max(...deltas) <= 0
}
