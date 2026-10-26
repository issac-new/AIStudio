// overlay[impact] LLM 需求拆模块（JoyAI 挂账清偿批 B1，2026-10-26）。
//
// 范式来源：京东 JoyAI ONE「输入主 PRD 系统自动推演关联业务领域」+ 导演台北极星
// 注释自认「模块仍人工输入，完整版接 LLM」（simulation-graph-template.ts）。
// 通道复用 eval/clef.ts（judge 同源判定端，env EVAL_JUDGE_BASE_URL，本地无服务
// 默认离线 fail-open）——不新建第二 LLM 客户端（toolresultguard 复制粘贴是反例）。
// 离线/解析失败回落 inferModules 词表（单一事实源导出，与导演台预览同源），
// 如实标注 modulesSource=llm|fallback 不装成功（spec D1）。
import { clefAskMixed, JudgeUnavailableError } from '../eval/clef'
import { loadEvalConfig } from '../eval/types'
import { extractJsonArray } from '../eval/synthesize'
import { inferModules } from '../graph/simulation-graph-template'

const QUESTION_ID = 'modules'
/** 模块 id 词面约束（与导演台 GraphSpec 节点 id 同约束：字母数字._- 连字符）。 */
const MODULE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,30}$/
const MAX_MODULES = 12

export interface ModuleSuggestion {
  modules: string[]
  /** 每模块一句话职责（LLM 档才有；词表档空）。 */
  rationales: string[]
  /** 模块来源：llm=判定端拆解；fallback=词表推导（离线/失败回落）。 */
  modulesSource: 'llm' | 'fallback'
  online: boolean
  /** offline/fallback 的原因（如实呈现）。 */
  reason?: string
}

function buildQuestions(title: string, description: string): Record<string, { type: 'choice'; instructions: string }> {
  const instructions = [
    '你是研发架构师。把下列需求拆成 2-8 个可并行交付的模块（粒度=一人一周到一月）。',
    '',
    `需求标题：${title}`,
    `需求描述：${description}`,
    '',
    '约束：模块 id 用小写字母/数字/连字符（如 pay-core、channel-wechat）；职责边界清晰不重叠；',
    '不确定的模块不要编（宁少勿滥）。',
    '',
    '只输出一个 JSON 数组，不要解释：[{"id":"模块id","rationale":"一句话职责"}]',
  ].join('\n')
  return { [QUESTION_ID]: { type: 'choice' as const, instructions } }
}

function parseModules(answer: string): Array<{ id: string; rationale: string }> {
  const out: Array<{ id: string; rationale: string }> = []
  for (const raw of extractJsonArray(answer)) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id.trim() : ''
    if (!MODULE_ID_RE.test(id)) continue
    out.push({ id, rationale: typeof r.rationale === 'string' ? r.rationale.slice(0, 120) : '' })
    if (out.length >= MAX_MODULES) break
  }
  return out
}

function fallbackSuggestion(description: string, reason: string): ModuleSuggestion {
  return {
    modules: inferModules(description),
    rationales: [],
    modulesSource: 'fallback',
    online: false,
    reason,
  }
}

/** 需求 → 模块拆解建议（fail-open：判定端不可用/应答不可解析 → 词表回落）。 */
export async function suggestModules(title: string, description: string): Promise<ModuleSuggestion> {
  const config = loadEvalConfig()
  const request = {
    model: config.judgeModels.length > 0 ? config.judgeModels[0] : config.judgeModel,
    state: {},
    // choice 问句超出 clef.ts 窄类型（EvalJudgeQuestion 只声明 noul）——synthesize/uioracle 同款 as never 过渡
    questions: buildQuestions(title, description) as never,
  }
  let answer: string | undefined
  try {
    const answers = await clefAskMixed(request as never, config)
    const raw = answers[QUESTION_ID]
    if (typeof raw === 'string') answer = raw
  } catch (error) {
    const reason = error instanceof JudgeUnavailableError
      ? `判定端不可用（${error.message}）——已回落词表推导`
      : `判定端调用失败：${error instanceof Error ? error.message : String(error)}——已回落词表推导`
    return fallbackSuggestion(description, reason)
  }
  if (answer === undefined) {
    return fallbackSuggestion(description, '判定端未返回模块拆解（choice 应答缺席）——已回落词表推导')
  }
  const parsed = parseModules(answer)
  if (!parsed.length) {
    return fallbackSuggestion(description, '判定端应答无可解析模块——已回落词表推导')
  }
  return {
    modules: parsed.map((p) => p.id),
    rationales: parsed.map((p) => p.rationale),
    modulesSource: 'llm',
    online: true,
  }
}
