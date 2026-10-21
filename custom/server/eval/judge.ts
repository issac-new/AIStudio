// overlay[eval] Eval Studio · 四步判分管线（spec §4.2，对齐 WOWService）。
//
//   S0 确定性规则先行（零判定费）→ S1 并行二元判定（单请求多问句）→
//   冲突仲裁（S0×S1 相反 → 保守 unknown + conflict 进人工/Rubric Loop）→
//   聚合（aggregate.ts）。
//
// 反偏置纪律：S1 问句只含断言文本，绝不携带 expect（期望答案）——判定期不可
// 让裁判知道"我们希望答案是什么"，expect 只在聚合层比对。
// fail-open：判定端不可用/熔断 → S1 断言全部 unknown，管线不抛错（judgeOnline=false）。
import type {
  AttemptVerdict, EvalConfig, EvalTask, Evidence,
} from './types'
import { similarityVerdict } from './similarity'
import {
  Breaker, TtlCache, clefAsk, sha1Of,
  type ClefJudgeDeps, type EvalJudgeAnswers, type EvalJudgeRequest,
} from './clef'

export type AskFn = (request: EvalJudgeRequest, config: EvalConfig) => Promise<EvalJudgeAnswers>

export interface JudgeDeps {
  config: EvalConfig
  ask?: AskFn
  cache?: TtlCache<EvalJudgeAnswers>
  breaker?: Breaker
  now?: () => number
  fetchDeps?: ClefJudgeDeps
}

export interface JudgeAttemptOptions {
  /** S0 断言也送 S1 交叉验证（默认关：成本纪律；新集首轮可开）。 */
  crossValidate?: boolean
  /**
   * 参照答案锚定检验（默认关，成本翻倍）：移除 expected_behavior 再判一遍，
   * 结论翻转的断言置 unknown 并标记 unstable——判据应是证据本身，而不是
   * "和参考答案像不像"。对应文章的位置/冗长偏差治理里的 swap test 思路。
   */
  referenceLeakCheck?: boolean
}

// 模块级共享默认实例：不注入时跨 judgeAttempt 调用复用（缓存生效、熔断计数累积）。
// 首用锁定 TTL/阈值（env 变化后需重启生效；测试注入自己的实例）。
let sharedCache: TtlCache<EvalJudgeAnswers> | null = null
let sharedBreaker: Breaker | null = null

/** 测试隔离：清空共享缓存/熔断器（避免跨用例状态污染）。 */
export function _resetJudgeDefaultsForTests(): void {
  sharedCache = null
  sharedBreaker = null
}

export interface JudgeAttemptResult {
  verdicts: AttemptVerdict[]
  judgeMeta: {
    backend: string
    latencyMs: number | null
    cached: boolean
    online: boolean
    models?: string[]
    referenceLeak?: { checked: number; flips: number; ids: string[] }
  }
}

/** 截断到 maxStateChars：保头为主、尾留 1/4（关键结论常在文末交付段）。 */
export function truncateForState(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content
  const tail = Math.floor(maxChars / 4)
  const head = maxChars - tail - 1
  return `${content.slice(0, head)}\n…[eval 截断 ${content.length - maxChars} 字符]…\n${content.slice(-tail)}`
}

/** 构造判定 state（证据上下文）。导出供测试与缓存键一致性校验。 */
export function buildJudgeState(task: EvalTask, evidence: Evidence, config: EvalConfig): Record<string, unknown> {
  const state: Record<string, unknown> = {
    task_problem: task.problem,
    expected_behavior: task.expectedBehavior,
  }
  if (evidence.transcript) state.evidence_transcript = truncateForState(evidence.transcript, config.maxStateChars)
  if (evidence.outcomeDetail) state.outcome_detail = evidence.outcomeDetail
  if (evidence.efficiency) {
    const eff = evidence.efficiency
    state.efficiency = {
      ...(eff.tokens !== undefined ? { tokens: eff.tokens } : {}),
      ...(eff.steps !== undefined ? { steps: eff.steps } : {}),
      ...(eff.costUsd !== undefined ? { cost_usd: eff.costUsd } : {}),
      ...(eff.durationMs !== undefined ? { duration_ms: eff.durationMs } : {}),
    }
  }
  return state
}

/**
 * 判分问句的公共约束（OpenAI Evals 教科书 §3.2 偏差治理）：
 * 冗长偏好——写得更长不等于更对；锚点——给可观测判据而不是笼统表态。
 */
export const JUDGE_BIAS_GUARD = '证据篇幅长短、措辞气势不作为判断依据。'

/** 构造 S1 问句集。只含断言文本与行为锚点（反偏置：无 expect、无期望答案）。 */
export function buildQuestions(task: EvalTask, assertionIds: string[]): Record<string, { type: 'noul'; instructions: string }> {
  const questions: Record<string, { type: 'noul'; instructions: string }> = {}
  for (const id of assertionIds) {
    const assertion = task.rubric.find((a) => a.id === id)
    if (!assertion) continue
    const anchor = assertion.anchor
      ? `成立的标准：${assertion.anchor.yes}；不成立的标准：${assertion.anchor.no}。`
      : ''
    questions[id] = {
      type: 'noul',
      instructions: `根据证据判断以下断言是否成立（只依据给定证据，证据不足以判断时不猜测）：${assertion.text}${anchor}${JUDGE_BIAS_GUARD}`,
    }
  }
  return questions
}

// ---------- S0 确定性规则 ----------

interface RuleOutcome {
  value: 'yes' | 'no' | 'unknown'
  /** 审计理由（百度范式 §3：判断本身可追问）。 */
  reason: string
}

function applyRegexRule(rule: { pattern: string; flags?: string }, evidence: Evidence): RuleOutcome {
  const text = evidence.transcript
  // 无证据 ≠ 未命中：对 expect=no 的红线断言，'no' 会被当成「确认坏事没发生」。
  if (typeof text !== 'string' || text.trim() === '') {
    return { value: 'unknown', reason: `S0 regex 证据缺席 /${rule.pattern}/${rule.flags ?? ''}` }
  }
  const matched = new RegExp(rule.pattern, rule.flags ?? '').test(text)
  return {
    value: matched ? 'yes' : 'no',
    reason: `S0 regex ${matched ? '命中' : '未命中'} /${rule.pattern}/${rule.flags ?? ''}`,
  }
}

function applyThresholdRule(
  rule: { metric: 'tokens' | 'steps' | 'costUsd' | 'durationMs'; op: '<' | '<=' | '>' | '>='; value: number },
  evidence: Evidence,
): RuleOutcome {
  const value = evidence.efficiency?.[rule.metric]
  const head = `S0 threshold ${rule.metric}${rule.op}${rule.value}`
  if (value === undefined || !Number.isFinite(value)) return { value: 'unknown', reason: `${head}：实测值缺席` }
  let result: 'yes' | 'no'
  switch (rule.op) {
    case '<': result = value < rule.value ? 'yes' : 'no'; break
    case '<=': result = value <= rule.value ? 'yes' : 'no'; break
    case '>': result = value > rule.value ? 'yes' : 'no'; break
    default: result = value >= rule.value ? 'yes' : 'no'
  }
  return { value: result, reason: `${head}（实测 ${value}）` }
}

// S0 相似度规则（百度轮 B2）：ROUGE-L F1 ≥ minScore，停用词清洁默认开。
function applySimilarityRule(
  task: EvalTask,
  rule: { minScore: number; stopwords?: string[] },
  evidence: Evidence,
): RuleOutcome {
  const value = similarityVerdict(task, evidence, rule)
  return {
    value,
    reason: value === 'unknown'
      ? `S0 similarity 证据缺席（minScore=${rule.minScore}）`
      : `S0 similarity ${value === 'yes' ? '达阈' : '未达阈'}（ROUGE-L F1 ≥ ${rule.minScore}）`,
  }
}

// ---------- S0 轨迹规则（文章轨迹评估三维的确定性部分） ----------

/** 动作签名：工具名 + 参数指纹（无参数指纹时退化为工具名）。 */
export function actionSignature(call: { name: string; argsSig?: string }): string {
  return call.argsSig ? `${call.name}|${call.argsSig}` : call.name
}

/** 连续相同签名的最大长度。 */
function maxConsecutiveRun(signatures: string[]): number {
  let max = 1
  let run = 1
  for (let i = 1; i < signatures.length; i += 1) {
    run = signatures[i] === signatures[i - 1] ? run + 1 : 1
    if (run > max) max = run
  }
  return signatures.length === 0 ? 0 : max
}

function applyRequiredToolsRule(rule: { tools: string[] }, evidence: Evidence): RuleOutcome {
  if (!evidence.toolCalls) {
    // 无工具调用证据 ≠ 没调用：无法判断，交 unknown（不为缺证据判失败）。
    return { value: 'unknown', reason: 'S0 required_tools：工具调用证据缺席' }
  }
  const seen = new Set(evidence.toolCalls.map((c) => c.name))
  const missing = rule.tools.filter((t) => !seen.has(t))
  return {
    value: missing.length === 0 ? 'yes' : 'no',
    reason: missing.length === 0
      ? `S0 required_tools 全部命中（${rule.tools.join(',')}）`
      : `S0 required_tools 缺失：${missing.join(',')}`,
  }
}

function applyNoLoopRule(rule: { allowedConsecutive?: number }, evidence: Evidence): RuleOutcome {
  if (!evidence.toolCalls) return { value: 'unknown', reason: 'S0 no_loop：工具调用证据缺席' }
  const allowed = rule.allowedConsecutive ?? 1
  const sigs = evidence.toolCalls.map(actionSignature)
  const longest = maxConsecutiveRun(sigs)
  const looped = longest > allowed
  return {
    value: looped ? 'no' : 'yes',
    reason: looped
      ? `S0 no_loop 命中：连续相同动作 ${longest} 次（上限 ${allowed}）`
      : `S0 no_loop 未命中（最长连续 ${longest}，上限 ${allowed}）`,
  }
}

function applyRedundantRatioRule(rule: { max: number }, evidence: Evidence): RuleOutcome {
  if (!evidence.toolCalls) return { value: 'unknown', reason: 'S0 redundant_ratio：工具调用证据缺席' }
  const sigs = evidence.toolCalls.map(actionSignature)
  if (sigs.length === 0) return { value: 'unknown', reason: 'S0 redundant_ratio：零工具调用，无可算冗余' }
  const seen = new Set<string>()
  let redundant = 0
  for (const sig of sigs) {
    if (seen.has(sig)) redundant += 1
    else seen.add(sig)
  }
  const ratio = redundant / sigs.length
  return {
    value: ratio <= rule.max ? 'yes' : 'no',
    reason: `S0 redundant_ratio 冗余 ${redundant}/${sigs.length}=${ratio.toFixed(2)}（上限 ${rule.max}）`,
  }
}

/** S0 规则分派（正则/阈值/相似度/轨迹三规则）。 */
function applyRule(task: EvalTask, s0: NonNullable<EvalTask['rubric'][number]['s0']>, evidence: Evidence): RuleOutcome {
  switch (s0.kind) {
    case 'regex': return applyRegexRule(s0, evidence)
    case 'threshold': return applyThresholdRule(s0, evidence)
    case 'similarity': return applySimilarityRule(task, s0, evidence)
    case 'required_tools': return applyRequiredToolsRule(s0, evidence)
    case 'no_loop': return applyNoLoopRule(s0, evidence)
    case 'redundant_ratio': return applyRedundantRatioRule(s0, evidence)
    default: return { value: 'unknown', reason: 'S0 未知规则' }
  }
}

// ---------- 主入口 ----------

/**
 * 判定一个 attempt（task × sample）的全部断言。
 * 冲突语义：S0 与 S1（crossValidate 时）结论相反 → value='unknown'、source='s0+s1'、
 * conflict=true——保守不放行不毙杀，路由到人工仲裁与 Rubric Loop。
 */
export async function judgeAttempt(
  task: EvalTask,
  evidence: Evidence,
  deps: JudgeDeps,
  options: JudgeAttemptOptions = {},
): Promise<JudgeAttemptResult> {
  const { config } = deps
  const now = deps.now ?? Date.now
  const verdicts: AttemptVerdict[] = []
  const s1Needed: string[] = []

  // 第 1 步：S0 规则先行
  for (const assertion of task.rubric) {
    if (!assertion.s0) {
      s1Needed.push(assertion.id)
      continue
    }
    const outcome = applyRule(task, assertion.s0, evidence)
    verdicts.push({ assertionId: assertion.id, value: outcome.value, source: 's0', reason: outcome.reason })
    if (options.crossValidate) s1Needed.push(assertion.id)
  }

  // 第 2 步：S1 判定（多裁判：逐模型请求 → 多数决；单模型=既有行为）。
  // 缓存键按模型隔离（同题不同裁判不串答案）；单模型失败 fail-soft 由其余承接，
  // 全部失败才判离线（online=false）。成本随模型数线性放大——默认单模型。
  let latencyMs: number | null = null
  let cached = false
  let online = true
  const s1Values = new Map<string, number>()
  /** 多数决已裁断言（value 定 yes/no；缺席=未过半 → unknown）。 */
  const s1Decided = new Map<string, 'yes' | 'no'>()
  /** 参照答案锚定检验判为不稳定的断言（结论随 expected_behavior 移除而翻转）。 */
  const unstableIds = new Set<string>()
  let referenceLeak: { checked: number; flips: number; ids: string[] } | undefined

  if (s1Needed.length > 0) {
    const breaker = deps.breaker ?? (sharedBreaker ??= new Breaker(config.breakerThreshold, config.breakerCooldownMs))
    const cache = deps.cache ?? (sharedCache ??= new TtlCache<EvalJudgeAnswers>(config.cacheTtlMs))
    const state = buildJudgeState(task, evidence, config)
    const questions = buildQuestions(task, s1Needed)
    const ask = deps.ask ?? ((req, cfg) => clefAsk(req, cfg, deps.fetchDeps))
    const models = config.judgeModels.length > 0 ? config.judgeModels : [config.judgeModel]

    /** 跑一轮判定：模型 → 断言 id → p。熔断打开直接返回 offline。 */
    const runPass = async (passState: Record<string, unknown>): Promise<{
      perModel: Map<string, Map<string, number>>
      anyCacheMiss: boolean
      latency: number
      online: boolean
    }> => {
      const perModel = new Map<string, Map<string, number>>()
      if (breaker.isOpen(now())) return { perModel, anyCacheMiss: false, latency: 0, online: false }
      const started = now()
      let anyCacheMiss = false
      for (const model of models) {
        const cacheKey = sha1Of(JSON.stringify({ state: passState, questions, model }))
        const collected = new Map<string, number>()
        const cachedAnswers = cache.get(cacheKey, now())
        if (cachedAnswers !== undefined) {
          for (const id of s1Needed) {
            const p = cachedAnswers[id]
            if (p !== undefined) collected.set(id, p)
          }
        } else {
          anyCacheMiss = true
          try {
            const answers = await ask({ model, state: passState, questions }, config)
            breaker.recordSuccess()
            cache.set(cacheKey, answers, now())
            for (const id of s1Needed) {
              const p = answers[id]
              if (p !== undefined) collected.set(id, p)
            }
          } catch {
            // 单模型失败不毙整批：其余模型继续判（fail-soft）；全败在循环外统一判离线
            breaker.recordFailure(now())
          }
        }
        if (collected.size > 0) perModel.set(model, collected)
      }
      return { perModel, anyCacheMiss, latency: now() - started, online: perModel.size > 0 }
    }

    /** 多数决：各模型 p 按 τ 三段映射计票，严格过半才裁决（平票/灰区 → unknown）。 */
    const decideFrom = (perModel: Map<string, Map<string, number>>) => {
      const decided = new Map<string, 'yes' | 'no'>()
      const means = new Map<string, number>()
      const majority = perModel.size / 2
      for (const id of s1Needed) {
        const ps: number[] = []
        let yes = 0
        let no = 0
        for (const answers of perModel.values()) {
          const p = answers.get(id)
          if (p === undefined) continue
          ps.push(p)
          if (p >= config.tauYes) yes += 1
          else if (p <= config.tauNo) no += 1
        }
        if (ps.length === 0) continue
        means.set(id, ps.reduce((a, b) => a + b, 0) / ps.length)
        if (yes > majority) decided.set(id, 'yes')
        else if (no > majority) decided.set(id, 'no')
      }
      return { decided, means }
    }

    const first = await runPass(state)
    latencyMs = first.latency
    cached = !first.anyCacheMiss
    online = first.online
    const firstResult = decideFrom(first.perModel)
    for (const [id, p] of firstResult.means) s1Values.set(id, p)
    for (const [id, value] of firstResult.decided) s1Decided.set(id, value)

    // 参照答案锚定检验：去掉 expected_behavior 再判一遍，翻转即不可靠。
    if (options.referenceLeakCheck && first.online) {
      const stateNoRef = { ...state }
      delete stateNoRef.expected_behavior
      const second = await runPass(stateNoRef)
      const secondResult = decideFrom(second.perModel)
      const flipped: string[] = []
      let checked = 0
      for (const [id, value] of firstResult.decided) {
        const again = secondResult.decided.get(id)
        if (again === undefined) continue
        checked += 1
        if (again !== value) {
          unstableIds.add(id)
          flipped.push(id)
        }
      }
      if (checked > 0) referenceLeak = { checked, flips: flipped.length, ids: flipped }
    }
  }

  // τ 三段映射（多裁判时已由多数决定值，此处仅单模型/未过半路径）+ 冲突仲裁 + 组装
  const s0ById = new Map(verdicts.map((v) => [v.assertionId, v]))
  const s1Set = new Set(s1Needed)
  const judgeLabel = config.judgeModels.length > 1 ? config.judgeModels.join(',') : config.judgeModel
  const s1Reason = (value: 'yes' | 'no' | 'unknown', p?: number): string =>
    `S1 ${value}${p !== undefined ? ` p=${p.toFixed(2)}` : ''}（τyes=${config.tauYes}, τno=${config.tauNo}, model=${judgeLabel}）`
  const finalVerdicts: AttemptVerdict[] = []
  for (const assertion of task.rubric) {
    const s0Verdict = s0ById.get(assertion.id)
    const p = s1Values.get(assertion.id)
    if (s1Set.has(assertion.id)) {
      // 偏差检验优先：结论不稳的断言不做通过/不通过结论，保守置 unknown 进人工。
      if (unstableIds.has(assertion.id)) {
        finalVerdicts.push({
          assertionId: assertion.id,
          value: 'unknown',
          source: s0Verdict ? 's0+s1' : 's1',
          unstable: true,
          instability: 'reference_leak',
          reason: `S1 结论随参照答案移除而翻转 → unknown（判据锚在参考答案而非证据）${p !== undefined ? ` p=${p.toFixed(2)}` : ''}`,
          ...(p !== undefined ? { p } : {}),
        })
        continue
      }
      let s1Value: 'yes' | 'no' | 'unknown' = 'unknown'
      const decided = s1Decided.get(assertion.id)
      if (decided) {
        s1Value = decided
      } else if (p !== undefined && config.judgeModels.length <= 1) {
        // 单裁判：均值走 τ 三段（多数决退化路径，与既有语义一致）
        if (p >= config.tauYes) s1Value = 'yes'
        else if (p <= config.tauNo) s1Value = 'no'
      }
      // 多裁判未过半：s1Value 保持 unknown（均值已留痕在 p）
      if (!s0Verdict) {
        finalVerdicts.push({
          assertionId: assertion.id,
          value: s1Value,
          source: 's1',
          reason: s1Reason(s1Value, p),
          ...(p !== undefined ? { p } : {}),
        })
        continue
      }
      // crossValidate 双源：结论相反 → 保守 unknown 进仲裁；一致/单侧 unknown → 取已判侧
      if (s1Value !== 'unknown' && s0Verdict.value !== 'unknown' && s0Verdict.value !== s1Value) {
        finalVerdicts.push({
          assertionId: assertion.id,
          value: 'unknown',
          source: 's0+s1',
          conflict: true,
          reason: `S0 ${s0Verdict.value} / S1 ${s1Value} 相反 → unknown（进人工仲裁）`,
          ...(p !== undefined ? { p } : {}),
        })
        continue
      }
      const value = s1Value !== 'unknown' ? s1Value : s0Verdict.value
      finalVerdicts.push({
        assertionId: assertion.id,
        value,
        source: 's0+s1',
        reason: s1Value === 'unknown'
          ? `S1 unknown（${p !== undefined ? `p=${p.toFixed(2)}` : '未答题'}），取 S0 ${s0Verdict.value}`
          : `S0 ${s0Verdict.value} / S1 ${s1Value} 一致`,
        ...(p !== undefined ? { p } : {}),
      })
      continue
    }
    if (s0Verdict) {
      finalVerdicts.push(s0Verdict)
      continue
    }
    // 无 s0 且 S1 未覆盖（判定端离线时 s1Needed 内全部落在上面分支）——不会到这里，防御性兜底。
    finalVerdicts.push({
      assertionId: assertion.id,
      value: 'unknown',
      source: 's1',
      reason: 'S1 判定端离线或未接线 → unknown',
    })
  }

  return {
    verdicts: finalVerdicts,
    judgeMeta: {
      backend: config.judgeBaseUrl,
      latencyMs,
      cached,
      online,
      ...(config.judgeModels.length > 1 ? { models: config.judgeModels } : {}),
      ...(referenceLeak ? { referenceLeak } : {}),
    },
  }
}
