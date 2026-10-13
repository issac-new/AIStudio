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
  judgeMeta: { backend: string; latencyMs: number | null; cached: boolean; online: boolean }
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

/** 构造 S1 问句集。只含断言文本（反偏置：无 expect）。 */
export function buildQuestions(task: EvalTask, assertionIds: string[]): Record<string, { type: 'noul'; instructions: string }> {
  const questions: Record<string, { type: 'noul'; instructions: string }> = {}
  for (const id of assertionIds) {
    const assertion = task.rubric.find((a) => a.id === id)
    if (!assertion) continue
    questions[id] = {
      type: 'noul',
      instructions: `根据证据判断以下断言是否成立（只依据给定证据，证据不足以判断时不猜测）：${assertion.text}`,
    }
  }
  return questions
}

// ---------- S0 确定性规则 ----------

function applyRegexRule(rule: { pattern: string; flags?: string }, evidence: Evidence): 'yes' | 'no' {
  const text = evidence.transcript ?? ''
  const matched = new RegExp(rule.pattern, rule.flags ?? '').test(text)
  return matched ? 'yes' : 'no'
}

function applyThresholdRule(
  rule: { metric: 'tokens' | 'steps' | 'costUsd' | 'durationMs'; op: '<' | '<=' | '>' | '>='; value: number },
  evidence: Evidence,
): 'yes' | 'no' | 'unknown' {
  const value = evidence.efficiency?.[rule.metric]
  if (value === undefined || !Number.isFinite(value)) return 'unknown'
  switch (rule.op) {
    case '<': return value < rule.value ? 'yes' : 'no'
    case '<=': return value <= rule.value ? 'yes' : 'no'
    case '>': return value > rule.value ? 'yes' : 'no'
    default: return value >= rule.value ? 'yes' : 'no'
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
    if (assertion.s0.kind === 'regex') {
      verdicts.push({ assertionId: assertion.id, value: applyRegexRule(assertion.s0, evidence), source: 's0' })
    } else {
      verdicts.push({ assertionId: assertion.id, value: applyThresholdRule(assertion.s0, evidence), source: 's0' })
    }
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

  if (s1Needed.length > 0) {
    const breaker = deps.breaker ?? (sharedBreaker ??= new Breaker(config.breakerThreshold, config.breakerCooldownMs))
    const cache = deps.cache ?? (sharedCache ??= new TtlCache<EvalJudgeAnswers>(config.cacheTtlMs))
    const state = buildJudgeState(task, evidence, config)
    const questions = buildQuestions(task, s1Needed)
    const ask = deps.ask ?? ((req, cfg) => clefAsk(req, cfg, deps.fetchDeps))
    const models = config.judgeModels.length > 0 ? config.judgeModels : [config.judgeModel]
    // 模型 → 断言 id → p（缺席=该模型未答该题）
    const perModel = new Map<string, Map<string, number>>()

    if (breaker.isOpen(now())) {
      online = false
    } else {
      const started = now()
      let anyCacheMiss = false
      for (const model of models) {
        const cacheKey = sha1Of(JSON.stringify({ state, questions, model }))
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
            const answers = await ask({ model, state, questions }, config)
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
      latencyMs = now() - started
      cached = !anyCacheMiss
      online = perModel.size > 0

      // 多数决：各模型 p 按 τ 三段映射计票，严格过半才裁决（平票/灰区多数 → unknown）；
      // 合并 p=已答模型均值（留痕供校准）。单模型退化为既有 τ 三段语义。
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
        const mean = ps.reduce((a, b) => a + b, 0) / ps.length
        s1Values.set(id, mean)
        if (yes > majority) s1Decided.set(id, 'yes')
        else if (no > majority) s1Decided.set(id, 'no')
      }
    }
  }

  // τ 三段映射（多裁判时已由多数决定值，此处仅单模型/未过半路径）+ 冲突仲裁 + 组装
  const s0ById = new Map(verdicts.map((v) => [v.assertionId, v]))
  const s1Set = new Set(s1Needed)
  const finalVerdicts: AttemptVerdict[] = []
  for (const assertion of task.rubric) {
    const s0Verdict = s0ById.get(assertion.id)
    const p = s1Values.get(assertion.id)
    if (s1Set.has(assertion.id)) {
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
        finalVerdicts.push({ assertionId: assertion.id, value: s1Value, source: 's1', ...(p !== undefined ? { p } : {}) })
        continue
      }
      // crossValidate 双源：结论相反 → 保守 unknown 进仲裁；一致/单侧 unknown → 取已判侧
      if (s1Value !== 'unknown' && s0Verdict.value !== 'unknown' && s0Verdict.value !== s1Value) {
        finalVerdicts.push({ assertionId: assertion.id, value: 'unknown', source: 's0+s1', conflict: true, ...(p !== undefined ? { p } : {}) })
        continue
      }
      const value = s1Value !== 'unknown' ? s1Value : s0Verdict.value
      finalVerdicts.push({ assertionId: assertion.id, value, source: 's0+s1', ...(p !== undefined ? { p } : {}) })
      continue
    }
    if (s0Verdict) {
      finalVerdicts.push(s0Verdict)
      continue
    }
    // 无 s0 且 S1 未覆盖（判定端离线时 s1Needed 内全部落在上面分支）——不会到这里，防御性兜底。
    finalVerdicts.push({ assertionId: assertion.id, value: 'unknown', source: 's1' })
  }

  return {
    verdicts: finalVerdicts,
    judgeMeta: {
      backend: config.judgeBaseUrl,
      latencyMs,
      cached,
      online,
      ...(config.judgeModels.length > 1 ? { models: config.judgeModels } : {}),
    },
  }
}
