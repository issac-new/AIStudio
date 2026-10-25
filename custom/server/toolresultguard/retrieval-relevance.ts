// overlay[toolresultguard] 检索生成后相关性断言（2026-10-25 数据飞轮 round 2，挂账 4）。
//
// 范式来源：《AI Agent 数据飞轮》捕获网卡点②——RAG 捞完外部文档之后断言
// 「捞回来的内容与问题是否相关」，防噪声注入污染幻觉底座。
//
// 仓内落法（spec D15）：确定性词面覆盖规则（查询词在结果文本的命中占比），
// 低于下限标记 CONFIRM 形态（留痕+计数，不改写不阻断——软信号与注入围栏的
// BLOCK/REWRITE 硬路径区分）；FLYWHEEL_RETRIEVAL_GUARD=1 选通默认关；
// 无查询参数/无结果文本不适用跳过（fail-soft）。纯判定面无副作用，留痕走 audit。
import { sha1Of } from './client'
import { appendAudit } from './audit'

/** 检索类工具名模式（可配：FLYWHEEL_RETRIEVAL_TOOL_PATTERN 覆盖）。 */
export function retrievalToolPattern(): RegExp {
  const raw = process.env.FLYWHEEL_RETRIEVAL_TOOL_PATTERN?.trim()
  if (raw) {
    try { return new RegExp(raw, 'i') } catch { /* 坏表达式回落默认，不炸主流程 */ }
  }
  return /search|retriev|knowledge|lookup|fts|rag|fetch_url|web/i
}

/** 覆盖率下限（默认 0.15：检索结果通常较长，相关结果覆盖大半查询词；过低=疑似噪声）。 */
export function retrievalMinCoverage(): number {
  const raw = Number(process.env.FLYWHEEL_RETRIEVAL_MIN_COVERAGE)
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : 0.15
}

export function retrievalGuardEnabled(): boolean {
  return process.env.FLYWHEEL_RETRIEVAL_GUARD?.trim() === '1'
}

/** 查询词提取：工具入参的首个字符串查询字段（query/q/question/keywords/text/search）。 */
export function queryOfInput(input: Record<string, unknown> | undefined): string | null {
  if (!input) return null
  for (const key of ['query', 'q', 'question', 'keywords', 'search', 'text']) {
    const v = input[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

/** 分词：ASCII 词 + CJK 二元组（短查询对长结果的覆盖判定）。 */
export function tokenize(text: string): string[] {
  const tokens: string[] = []
  const lowered = text.toLowerCase()
  const ascii = lowered.match(/[a-z0-9_]{2,}/g) ?? []
  tokens.push(...ascii)
  const cjkRuns = lowered.match(/[\u4e00-\u9fff]+/g) ?? []
  for (const run of cjkRuns) {
    if (run.length === 1) tokens.push(run)
    else for (let i = 0; i + 2 <= run.length; i += 1) tokens.push(run.slice(i, i + 2))
  }
  return tokens
}

export interface RetrievalRelevanceCheck {
  applicable: boolean
  coverage: number | null
  flagged: boolean
  reason: string
}

/** 相关性判定（纯函数）：查询词 tokens 在结果文本（分词后集合）的命中占比。 */
export function retrievalRelevanceCheck(
  toolName: string,
  input: Record<string, unknown> | undefined,
  resultText: string | undefined,
): RetrievalRelevanceCheck {
  if (!retrievalToolPattern().test(toolName)) {
    return { applicable: false, coverage: null, flagged: false, reason: '非检索类工具' }
  }
  const query = queryOfInput(input)
  if (!query) return { applicable: false, coverage: null, flagged: false, reason: '检索类工具但入参无查询字段' }
  const text = typeof resultText === 'string' ? resultText : ''
  if (!text.trim()) return { applicable: false, coverage: null, flagged: false, reason: '结果文本缺席' }
  const tokens = tokenize(query)
  if (tokens.length === 0) return { applicable: false, coverage: null, flagged: false, reason: '查询分词为空' }
  const haystack = new Set(tokenize(text))
  const hit = tokens.filter((t) => haystack.has(t)).length
  const coverage = hit / tokens.length
  const min = retrievalMinCoverage()
  return {
    applicable: true,
    coverage,
    flagged: coverage < min,
    reason: coverage < min
      ? `查询词覆盖率 ${coverage.toFixed(2)} < ${min}（疑似噪声注入，CONFIRM 标记不阻断）`
      : `查询词覆盖率 ${coverage.toFixed(2)} ≥ ${min}`,
  }
}

/** 命中计数（进程内，读数面消费；重启归零如实呈现）。 */
const flagCounts = { checked: 0, flagged: 0 }
export function retrievalFlagCounts(): { checked: number; flagged: number } {
  return { ...flagCounts }
}

/**
 * ekko 工具瀑布钩子（postExecute）：检索类工具结果过相关性断言。
 * 只观测留痕（audit CONFIRM + 计数），不动结果内容；默认关，选通才生效。
 */
export function retrievalRelevanceHook() {
  return {
    async postExecute<T extends { ok?: boolean; content?: unknown }>(
      name: string,
      input: Record<string, unknown>,
      result: T,
    ): Promise<T | undefined> {
      if (!retrievalGuardEnabled()) return undefined
      if (result?.ok === false) return undefined
      const content = typeof result?.content === 'string' ? result.content : undefined
      const check = retrievalRelevanceCheck(name, input, content)
      if (!check.applicable) return undefined
      flagCounts.checked += 1
      if (!check.flagged) return undefined
      flagCounts.flagged += 1
      appendAudit({
        stage: 'tool_result',
        verdict: 'CONFIRM',
        via: 'retrieval-relevance',
        score0: 0,
        attackP: null,
        category: 'retrieval_noise',
        severity: null,
        rewrittenContent: null,
        warningLine: `[toolresultguard] 检索相关性断言：${check.reason}`,
        reason: check.reason,
        latencyMs: null,
        contentSha: sha1Of(content ?? ''),
        ts: Date.now(),
        tool: name,
        source: 'ekko_tool',
      })
      return undefined
    },
  }
}
