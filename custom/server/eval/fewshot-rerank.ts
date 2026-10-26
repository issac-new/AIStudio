// overlay[eval] fewshot LLM 重排档（挂账清偿批二 C2，2026-10-27）。
//
// 范式来源：数据飞轮 few-shot 召回的语义增强——词面召回（ROUGE-L/bigram 余弦）
// 对同义不同词盲；LLM 重排对词面 top-K 候选按语义相关性重排序。通道复用
// eval/clef.ts（判定端），env FLYWHEEL_FEWSHOT_RERANK=1 选通（默认关）。
// 独立限时（默认 3s，env 可调）——派发链等不起 judgeTimeoutMs 的 12s；
// 任何失败（离线/超时/解析不出）回落词面序，fail-open 零阻断。
import { clefAskMixed, JudgeUnavailableError } from './clef'
import { loadEvalConfig } from './types'
import { recallFewshot, fewshotInjectLine, type FewshotRecall } from './fewshot'
import type { DistillLedgerEntry } from './flywheel'

const QUESTION_ID = 'rerank'

export function rerankEnabled(): boolean {
  return process.env.FLYWHEEL_FEWSHOT_RERANK?.trim() === '1'
}

function rerankTimeoutMs(): number {
  const raw = Number(process.env.FLYWHEEL_FEWSHOT_RERANK_TIMEOUT_MS)
  return Number.isFinite(raw) && raw > 0 && raw <= 10_000 ? raw : 3000
}

export interface RerankOutcome {
  /** 重排后的召回（recalled 顺序=LLM 判定的相关性序）；off/失败=词面序原样。 */
  recall: FewshotRecall
  /** llm=重排生效；off=开关关；fallback=失败回落词面序（reason 说明）。 */
  source: 'llm' | 'off' | 'fallback'
  reason?: string
}

/** 词面召回扩 K（重排需要比注入上限大的候选池——注入封顶 3，召回池取 5）。 */
const RERANK_POOL = 5

/** 解析 LLM 应答为候选序号序列（容忍围栏/逗号空格；非法序号丢弃）。 */
export function parseOrder(answer: string, poolSize: number): number[] {
  const text = String(answer ?? '')
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const arr = body.match(/\[[\s\S]*\]/)
  const source = arr ? arr[0] : body
  const out: number[] = []
  for (const m of source.matchAll(/\d+/g)) {
    const n = Number(m[0])
    if (n >= 1 && n <= poolSize && !out.includes(n)) out.push(n)
    if (out.length >= poolSize) break
  }
  return out
}

/** fewshot 召回 LLM 重排（fail-open；off 时零开销直通词面召回）。 */
export async function fewshotRerank(
  query: string,
  distills: DistillLedgerEntry[],
): Promise<RerankOutcome> {
  const base = recallFewshot(query, distills, { limit: RERANK_POOL })
  if (!rerankEnabled()) return { recall: base, source: 'off' }
  if (base.recalled.length < 2) return { recall: base, source: 'off', reason: '候选不足 2 条无需重排' }

  const config = loadEvalConfig()
  const lines = base.recalled.map((t, i) => `${i + 1}. ${t.trigger.slice(0, 160)}`)
  const request = {
    model: config.judgeModels.length > 0 ? config.judgeModels[0] : config.judgeModel,
    state: {},
    // choice 问句超出 clef 窄类型（synthesize/uioracle/module-suggest 同款 as never 过渡）
    questions: {
      [QUESTION_ID]: {
        type: 'choice',
        instructions: [
          '你是检索重排器。按与「新任务」的语义相关性从高到低排列下列历史教训候选。',
          `新任务：${query.slice(0, 400)}`,
          '候选：',
          ...lines,
          '只输出一个 JSON 数组（候选序号按相关性降序），不要解释：[2,1,3]',
        ].join('\n'),
      },
    } as never,
  }
  try {
    const answers = await Promise.race([
      clefAskMixed(request as never, config),
      new Promise<never>((_, reject) => setTimeout(() => reject(new JudgeUnavailableError(`重排限时 ${rerankTimeoutMs()}ms 超时`)), rerankTimeoutMs())),
    ])
    const answer = answers[QUESTION_ID]
    if (typeof answer !== 'string') throw new JudgeUnavailableError('重排应答缺席')
    const order = parseOrder(answer, base.recalled.length)
    if (order.length < 2) throw new JudgeUnavailableError('重排应答无可解析序')
    // 命中序号在前、未命中垫后（语义序+词面序的稳定合成）；相似度沿用词面值（读数参考）
    const reranked = [
      ...order.map((n) => base.recalled[n - 1]).filter(Boolean),
      ...base.recalled.filter((_, i) => !order.includes(i + 1)),
    ]
    const simOf = new Map(base.recalled.map((t) => [t.ledgerId, t.similarity]))
    const recall: FewshotRecall = { ...base, recalled: reranked.map((t) => ({ ...t, similarity: simOf.get(t.ledgerId) ?? 0 })) }
    return { recall, source: 'llm' }
  } catch (e) {
    const reason = e instanceof JudgeUnavailableError ? e.message : `重排失败：${e instanceof Error ? e.message : String(e)}`
    return { recall: base, source: 'fallback', reason: `${reason}——已回落词面序` }
  }
}

/** 重排结果的注入行（与词面召回行同形态；source 标注区分）。 */
export function rerankInjectLine(outcome: RerankOutcome): string | null {
  if (outcome.source === 'off') return null
  const line = fewshotInjectLine({ ...outcome.recall, recalled: outcome.recall.recalled.slice(0, 3) })
  if (!line) return null
  return outcome.source === 'llm' ? line.replace('历史教训（', '历史教训（LLM 重排，') : line
}
