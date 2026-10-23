// overlay[eval] 合成探针生成器（2026-10-23 HarnessPro 挂账清偿 G1）。
//
// 来源（arXiv 2610.26770 四 Agent 之 Test Synthesizer）：无标签环境下让 LLM 当裁判
// 有严重盲目乐观（失败案例召回仅 41.7%），HarnessPro 改为按任务描述合成固定可执行
// 单元测试，召回升到 83.3%。本仓承接（诚实边界）：不生成可执行代码——判定端为
// 考卷任务**提案 S0 确定性规则**（六种既有白名单 kind），产物是草稿，人工经既有
// rubric 修订端点采纳后才进考卷（评测集是资产的纪律，LLM 只提案不改卷）。
// 采纳后的校准读数由 evaluators.judgeCalibration（失败召回）承接，不重复建。
//
// fail-open 纪律（judge.ts 同款）：判定端不可用/超时/响应不可解析 → ok:false 如实
// 返回，不造数不阻塞。反偏置延续：合成问句只带断言文本，不带 expect。
import { clefAskMixed, JudgeUnavailableError, type MixedJudgeAnswers } from './clef'
import type { EvalConfig, EvalTask, S0Rule } from './types'

/** 一条合成提案：绑定既有断言的 S0 规则草稿 + 提案理由。 */
export interface SynthRuleProposal {
  assertionId: string
  rule: S0Rule
  rationale: string
}

export interface SynthesizeResult {
  ok: boolean
  /** 判定端是否在线（离线=纯 fail-open，无提案）。 */
  online: boolean
  /** 离线/失败原因（ok:false 时给）。 */
  reason?: string
  proposals: SynthRuleProposal[]
  /** 被校验拒绝的原始条目（留痕，不静默丢弃）。 */
  rejected: Array<{ assertionId: string; reason: string }>
  note: string
}

export type SynthAskFn = (request: unknown, config: EvalConfig) => Promise<MixedJudgeAnswers>

export const SYNTH_NOTE = '合成产物是 S0 规则草稿，不自动进考卷：人工核对后经 POST /sets/:id/tasks/:taskId/rubric 修订采纳（改版留痕）。规则只应从任务自身契约推导，不得逐字编码答案文本。'

const SYNTH_QUESTION_ID = 'rules'
const MAX_REGEX_CHARS = 512

/** 构造合成问句（choice 通道承载结构化 JSON；只带断言文本不带 expect——反偏置）。 */
export function buildSynthesizeQuestions(task: EvalTask): Record<string, { type: 'choice'; instructions: string }> {
  const assertions = task.rubric
    .map((a) => `- ${a.id}: ${a.text}`)
    .join('\n')
  const instructions = [
    '你是测试合成器。为下列评测任务的断言各提案至多一条机器可验证的 S0 规则（不确定就不提，宁缺毋滥）。',
    '',
    `任务问题：${task.problem}`,
    `期望行为：${task.expectedBehavior}`,
    '断言（只有文本，没有期望答案）：',
    assertions,
    '',
    '可选规则 JSON（kind 白名单六种）：',
    '{"kind":"regex","pattern":"...","flags":"i"}            —— 对证据全文的正则（判坏特征或判必备标记）',
    '{"kind":"threshold","metric":"tokens|steps|costUsd|durationMs","op":"<|<=|>|>=","value":1} —— 对效率指标的门',
    '{"kind":"similarity","minScore":0.6}                     —— 证据 vs 期望行为的 ROUGE-L F1',
    '{"kind":"required_tools","tools":["name"]}               —— 必须全部出现的工具',
    '{"kind":"no_loop","allowedConsecutive":1}                —— 连续相同动作上限',
    '{"kind":"redundant_ratio","max":0.5}                     —— 重复动作占比上限',
    '',
    '只输出一个 JSON 数组，不要解释：[{"assertionId":"...","rule":{...},"rationale":"一句话依据任务契约的理由"}]',
  ].join('\n')
  return { [SYNTH_QUESTION_ID]: { type: 'choice' as const, instructions } }
}

/** 从 choice 应答字符串提取 JSON 数组（容忍 ```json 围栏）。 */
export function extractJsonArray(answer: string): unknown[] {
  const text = String(answer ?? '').trim()
  if (!text) return []
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('[')
  const end = body.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return []
  try {
    const parsed = JSON.parse(body.slice(start, end + 1))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function validateRule(raw: unknown): { rule: S0Rule } | { reason: string } {
  if (!raw || typeof raw !== 'object') return { reason: 'rule 非对象' }
  const r = raw as Record<string, unknown>
  switch (r.kind) {
    case 'regex': {
      const pattern = typeof r.pattern === 'string' ? r.pattern : ''
      if (!pattern || pattern.length > MAX_REGEX_CHARS) return { reason: `regex pattern 须为 1-${MAX_REGEX_CHARS} 字符` }
      try {
        void new RegExp(pattern, typeof r.flags === 'string' ? r.flags : '')
      } catch (e) {
        return { reason: `regex 不可编译：${e instanceof Error ? e.message : String(e)}` }
      }
      return { rule: { kind: 'regex', pattern, ...(typeof r.flags === 'string' && r.flags ? { flags: r.flags } : {}) } }
    }
    case 'threshold': {
      const metrics = ['tokens', 'steps', 'costUsd', 'durationMs']
      const ops = ['<', '<=', '>', '>=']
      if (!metrics.includes(String(r.metric))) return { reason: `threshold metric 须为 ${metrics.join('|')}` }
      if (!ops.includes(String(r.op))) return { reason: `threshold op 须为 ${ops.join('|')}` }
      if (typeof r.value !== 'number' || !Number.isFinite(r.value) || r.value < 0) return { reason: 'threshold value 须为非负有限数' }
      return { rule: { kind: 'threshold', metric: r.metric as 'tokens', op: r.op as '<', value: r.value } }
    }
    case 'similarity': {
      if (typeof r.minScore !== 'number' || !(r.minScore > 0 && r.minScore <= 1)) return { reason: 'similarity minScore 须为 (0,1]' }
      return { rule: { kind: 'similarity', minScore: r.minScore } }
    }
    case 'required_tools': {
      if (!Array.isArray(r.tools) || r.tools.length === 0 || !r.tools.every((t) => typeof t === 'string' && t.trim())) {
        return { reason: 'required_tools tools 须为非空字符串数组' }
      }
      return { rule: { kind: 'required_tools', tools: r.tools as string[] } }
    }
    case 'no_loop': {
      const allowed = typeof r.allowedConsecutive === 'number' && Number.isInteger(r.allowedConsecutive) && r.allowedConsecutive >= 1
        ? r.allowedConsecutive : undefined
      return { rule: { kind: 'no_loop', ...(allowed ? { allowedConsecutive: allowed } : {}) } }
    }
    case 'redundant_ratio': {
      if (typeof r.max !== 'number' || !(r.max > 0 && r.max <= 1)) return { reason: 'redundant_ratio max 须为 (0,1]' }
      return { rule: { kind: 'redundant_ratio', max: r.max } }
    }
    default:
      return { reason: `未知规则 kind：${String(r.kind)}` }
  }
}

/** 校验合成条目：断言必须在考卷内、规则过白名单校验。 */
export function parseRuleProposals(answer: string, task: EvalTask): { proposals: SynthRuleProposal[]; rejected: SynthesizeResult['rejected'] } {
  const proposals: SynthRuleProposal[] = []
  const rejected: SynthesizeResult['rejected'] = []
  const knownIds = new Set(task.rubric.map((a) => a.id))
  for (const item of extractJsonArray(answer)) {
    if (!item || typeof item !== 'object') {
      rejected.push({ assertionId: '(unparsed)', reason: '条目非对象' })
      continue
    }
    const e = item as Record<string, unknown>
    const assertionId = String(e.assertionId ?? '')
    if (!knownIds.has(assertionId)) {
      rejected.push({ assertionId: assertionId || '(missing)', reason: '断言不在本任务考卷内' })
      continue
    }
    const verdict = validateRule(e.rule)
    if ('reason' in verdict) {
      rejected.push({ assertionId, reason: verdict.reason })
      continue
    }
    // 该断言已有 S0 规则的跳过（不重复提案；无 S0 的断言才是合成的目标面）
    const existing = task.rubric.find((a) => a.id === assertionId)?.s0
    if (existing) {
      rejected.push({ assertionId, reason: '断言已有 S0 规则，无需合成' })
      continue
    }
    proposals.push({
      assertionId,
      rule: verdict.rule,
      rationale: typeof e.rationale === 'string' ? e.rationale.slice(0, 300) : '',
    })
  }
  return { proposals, rejected }
}

export interface SynthesizeDeps {
  config: EvalConfig
  ask?: SynthAskFn
}

/** 为单个任务合成 S0 规则提案（fail-open：判定端不可用 → ok:false, online:false）。 */
export async function synthesizeProbesForTask(task: EvalTask, deps: SynthesizeDeps): Promise<SynthesizeResult> {
  // choice 问句超出 clef.ts 的窄类型（其 EvalJudgeQuestion 只有 noul）——uioracle 同款 as never 过渡
  const ask = deps.ask ?? ((req, config) => clefAskMixed(req as never, config))
  const request = {
    model: deps.config.judgeModels.length > 0 ? deps.config.judgeModels[0] : deps.config.judgeModel,
    state: {},
    questions: buildSynthesizeQuestions(task),
  }
  let answer: string | undefined
  try {
    const answers = await ask(request, deps.config)
    const raw = answers[SYNTH_QUESTION_ID]
    if (typeof raw === 'string') answer = raw
  } catch (error) {
    const reason = error instanceof JudgeUnavailableError
      ? error.message
      : `判定端调用失败：${error instanceof Error ? error.message : String(error)}`
    return { ok: false, online: false, reason, proposals: [], rejected: [], note: SYNTH_NOTE }
  }
  if (answer === undefined) {
    return { ok: false, online: false, reason: '判定端未返回合成结果（choice 应答缺席）', proposals: [], rejected: [], note: SYNTH_NOTE }
  }
  const { proposals, rejected } = parseRuleProposals(answer, task)
  return { ok: true, online: true, proposals, rejected, note: SYNTH_NOTE }
}
