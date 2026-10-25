// overlay[eval] Few-shot 记忆按相似度召回（2026-10-25 数据飞轮 round 2，挂账 1）。
//
// 范式来源：《AI Agent 数据飞轮》资产二——动态 Few-shot 记忆库：把每个 Bad Case
// 打包成「触发场景 / 错误做法示范（带失败动作签名）/ 正确做法示范」三元组，新
// 请求到来时按相似度召回最相关的几条教训注入上下文；没有相关历史时一个字不加。
//
// v1 口径（spec D12）：仓内无 embedding 基建，相似度用 ROUGE-L F1 词面口径
// （复用 eval/similarity.ts，与文章 0.85 向量余弦分度不同，阈值默认 0.45，
// env FLYWHEEL_FEWSHOT_MIN_SIM 可调）；三元组来源=飞轮台账提炼记录（源集非
// 密封才带文本快照，旧记录无快照 fail-soft 跳过）。封顶 3 条（与经验注入同额）。
import { similarityScore } from './similarity'
import type { DistillLedgerEntry } from './flywheel'

/** 召回上限：与 expcandidates 经验注入同额（防简报膨胀）。 */
export const FEWSHOT_RECALL_LIMIT = 3

/** 词面相似度阈值（D12）：实测平衡点——同题改述可召回、异题不误召回。 */
export function fewshotMinSim(): number {
  const raw = Number(process.env.FLYWHEEL_FEWSHOT_MIN_SIM)
  return Number.isFinite(raw) && raw > 0 && raw < 1 ? raw : 0.45
}

/** 三元组：触发场景（坏例题面）/ 错误示范（根因+禁忌，失败动作签名）/ 正确示范。 */
export interface FewshotTriple {
  /** 提炼台账 id（溯源键）。 */
  ledgerId: string
  trigger: string
  wrongDemo: string
  rightDemo: string
  rootCause: string
}

/** 台账提炼记录 → 三元组（无文本快照的旧记录跳过——D16 fail-soft 不造数）。 */
export function triplesOfLedger(distills: DistillLedgerEntry[]): FewshotTriple[] {
  const triples: FewshotTriple[] = []
  for (const d of distills) {
    if (!d.problem || !d.expectedBehavior) continue
    triples.push({
      ledgerId: d.id,
      trigger: d.problem,
      wrongDemo: `${d.rootCause}：${d.tabooActions.join('；')}`,
      rightDemo: d.expectedBehavior,
      rootCause: d.rootCause,
    })
  }
  return triples
}

export interface FewshotRecall {
  /** 查询词。 */
  query: string
  /** 相似度阈值（本次生效值）。 */
  minSim: number
  /** 按相似度降序的召回条目；无超阈值历史=空（Prompt 保持干净）。 */
  recalled: Array<FewshotTriple & { similarity: number }>
  /** 候选三元组总数（含未召回——读数面呈现漏斗用）。 */
  candidates: number
}

/** 新查询 → 召回最相关教训（纯函数；同输入同输出）。 */
export function recallFewshot(
  query: string,
  distills: DistillLedgerEntry[],
  opts: { limit?: number; minSim?: number } = {},
): FewshotRecall {
  const trimmed = query?.trim() ?? ''
  const minSim = opts.minSim ?? fewshotMinSim()
  const limit = opts.limit ?? FEWSHOT_RECALL_LIMIT
  const triples = triplesOfLedger(distills)
  if (!trimmed || triples.length === 0) {
    return { query: trimmed, minSim, recalled: [], candidates: triples.length }
  }
  const scored = triples
    .map((t) => ({ ...t, similarity: similarityScore({ transcript: trimmed, reference: t.trigger, stopwords: [] }) }))
    .filter((t) => t.similarity >= minSim)
    .sort((a, b) => b.similarity - a.similarity || a.ledgerId.localeCompare(b.ledgerId))
    .slice(0, limit)
  return { query: trimmed, minSim, recalled: scored, candidates: triples.length }
}

/** 注入行（expcandidates 消费）：凭据形态改写——只以「历史教训」形态呈现。 */
export function fewshotInjectLine(recall: FewshotRecall): string | null {
  if (recall.recalled.length === 0) return null
  const items = recall.recalled.map((t, i) =>
    `${i + 1}. 相似场景曾翻车（相似度 ${t.similarity.toFixed(2)}）：${t.wrongDemo}；正确做法：${t.rightDemo}`)
  return `历史教训（飞轮台账，已提炼，非本轮实测凭据）：${items.join('；')}`
}
