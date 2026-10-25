// overlay[eval] 坏例五要素自动提炼（2026-10-25 数据飞轮吸收轮，件一）。
//
// 范式来源：《AI Agent 数据飞轮》资产一——一个 Bad Case 自动长成回归用例，
// 五要素缺一不可：纯净 Query / 环境快照 / 失败轨迹 / 禁忌动作 / 二值通过判定。
// 本仓映射（spec D2）：Query=原题面原样；环境快照=origin 引用（只存引用不存
// 原文，既有纪律）；失败轨迹=判词+工具序列摘要（进飞轮台账，不进题面）；
// 禁忌动作=继承原断言 + 新增一条机器可执行的禁忌断言（可带 S0 规则）；
// 通过判定=二值断言集——已通过样本与全 unknown 判词结构性拒绝（模糊判定
// 不进仓库）。
//
// 提炼器零 LLM（spec D1）：根因分类只消费既有判词与工具序列（S0 哲学：
// 能跑规则的绝不叫裁判）；归因给裁判模型挂账下轮。
import { createHash } from 'node:crypto'
import { attemptPassed } from './aggregate'
import { originKeyOf } from './origin'
import type { EvalRun, EvalSet, EvalTask, RubricAssertion, ToolCallRecord } from './types'

/** 根因分类（spec D4 优先序，先命中先归）。 */
export type BadCaseRootCause =
  | 'risk_violation' // 红线断言命中（expect=no 实测 yes）
  | 'action_loop' // 同动作签名连续重复 ≥2（死循环）
  | 'budget_exhausted' // steps/tokens 阈值断言失败
  | 'outcome_mismatch' // 环境终态校验失败
  | 'trajectory_defect' // 轨迹层断言失败（缺步骤/多余步骤）
  | 'result_defect' // 结果层断言失败（兜底档）

export const ROOT_CAUSE_LABELS: Record<BadCaseRootCause, string> = {
  risk_violation: '红线命中',
  action_loop: '动作死循环',
  budget_exhausted: '预算超限',
  outcome_mismatch: '终态未达成',
  trajectory_defect: '轨迹缺陷',
  result_defect: '结果缺陷',
}

export interface FailureDigest {
  /** 失败断言摘要（id + 一句话），台账审计用。 */
  failedAssertions: Array<{ id: string; kind: RubricAssertion['kind']; text: string }>
  /** 工具序列（名字+成败，含参数指纹时用于循环判定）。 */
  toolCalls: ToolCallRecord[]
  /** 是否检出同签名连续重复（≥2）。 */
  loopDetected: boolean
  outcomeDetail?: string
}

export interface DistilledCase {
  /** 可直接 appendTasksToSet 的回归任务（幂等 id：bd-{来源键哈希}）。 */
  task: EvalTask
  rootCause: BadCaseRootCause
  /** 禁忌动作清单（人读；机器可执行面在 task.rubric 的禁忌断言里）。 */
  tabooActions: string[]
  failedSteps: number | null
  /** 步数红线=失败步数+2（源文口径；失败步数缺席时 null 不造数）。 */
  stepRedline: number | null
  digest: FailureDigest
}

export type DistillErrorCode =
  | 'invalid_input'
  | 'task_not_found'
  | 'attempt_not_found'
  | 'sample_passed'
  | 'undecidable'

export type DistillResult =
  | { ok: true; distilled: DistilledCase }
  | { ok: false; code: DistillErrorCode; problems: string[] }

/** 同动作签名（工具名+参数指纹）连续重复出现即死循环（S0 no_loop 同口径）。 */
function detectLoop(toolCalls: ToolCallRecord[]): boolean {
  let streak = 1
  for (let i = 1; i < toolCalls.length; i += 1) {
    const prev = toolCalls[i - 1]
    const cur = toolCalls[i]
    const same = prev.name === cur.name
      && (prev.argsSig ?? '') === (cur.argsSig ?? '')
    streak = same ? streak + 1 : 1
    if (streak >= 2) return true
  }
  return false
}

/** 根因分类（spec D4）：纯确定性，只看判词/工具序列/终态。 */
export function classifyRootCause(set: EvalSet, run: EvalRun, taskId: string, sampleIdx: number): { rootCause: BadCaseRootCause; digest: FailureDigest } | { undecidable: true; digest: FailureDigest } {
  const task = set.tasks.find((t) => t.id === taskId)!
  const attempt = run.attempts.find((a) => a.taskId === taskId && a.sampleIdx === sampleIdx)!
  const byId = new Map(attempt.verdicts.map((v) => [v.assertionId, v]))
  const failedAssertions: FailureDigest['failedAssertions'] = []
  let hasDecided = false
  for (const assertion of task.rubric) {
    const verdict = byId.get(assertion.id)
    if (!verdict || verdict.value === 'unknown') continue
    hasDecided = true
    if (verdict.value !== assertion.expect) {
      failedAssertions.push({ id: assertion.id, kind: assertion.kind, text: assertion.text })
    }
  }
  const toolCalls = attempt.toolCalls ?? []
  const loopDetected = detectLoop(toolCalls)
  const digest: FailureDigest = {
    failedAssertions,
    toolCalls,
    loopDetected,
    ...(attempt.outcome && !attempt.outcome.ok ? { outcomeDetail: attempt.outcome.detail ?? 'outcome 校验未通过' } : {}),
  }

  // 全 unknown（判定端离线）或零判词：无已决失败面，不可二值化
  if (!hasDecided) return { undecidable: true, digest }

  const budgetFailed = failedAssertions.some((f) => {
    const assertion = task.rubric.find((a) => a.id === f.id)
    return assertion?.s0?.kind === 'threshold'
  })
  const firstRisk = failedAssertions.find((f) => f.kind === 'risk')
  const rootCause: BadCaseRootCause =
    firstRisk ? 'risk_violation'
      : loopDetected ? 'action_loop'
        : budgetFailed ? 'budget_exhausted'
          : attempt.outcome && !attempt.outcome.ok ? 'outcome_mismatch'
            : failedAssertions.some((f) => f.kind === 'trajectory') ? 'trajectory_defect'
              : failedAssertions.length > 0 ? 'result_defect'
                // 有已决判词但全部通过、终态却失败（attemptPassed=false 的唯一残余路径）
                : 'outcome_mismatch'
  return { rootCause, digest }
}

const TABOO_TEXTS: Record<BadCaseRootCause, (ctx: { firstFailedText: string }) => string> = {
  risk_violation: ({ firstFailedText }) => `禁止触线重犯：${firstFailedText}`,
  action_loop: () => '禁止同一动作（同工具同参数）连续重复执行——第二次起即死循环',
  budget_exhausted: () => '禁止超预算重试：步数超出红线仍未收敛须提前止损',
  outcome_mismatch: () => '禁止在系统终态未达成时宣告任务完成',
  trajectory_defect: ({ firstFailedText }) => `禁止偏离必需轨迹：${firstFailedText}`,
  result_defect: ({ firstFailedText }) => `禁止重复本次失败结果：${firstFailedText}`,
}

/** 失败 attempt → 五要素回归任务。纯函数：不写库（落库与台账由 controller 编排）。 */
export function distillBadCase(
  set: EvalSet,
  run: EvalRun,
  taskId: string,
  sampleIdx: number,
): DistillResult {
  if (!taskId || !Number.isInteger(sampleIdx) || sampleIdx < 1) {
    return { ok: false, code: 'invalid_input', problems: ['taskId 与 sampleIdx（≥1 整数）必填'] }
  }
  const task = set.tasks.find((t) => t.id === taskId)
  if (!task) return { ok: false, code: 'task_not_found', problems: [`任务不存在：${taskId}`] }
  const attempt = run.attempts.find((a) => a.taskId === taskId && a.sampleIdx === sampleIdx)
  if (!attempt) {
    return { ok: false, code: 'attempt_not_found', problems: [`样本不存在：${taskId}#${sampleIdx}`] }
  }
  // 已通过样本不提炼（处置单同款纪律：回流/立案只对真实失败开放）
  if (attemptPassed(task, attempt)) {
    return { ok: false, code: 'sample_passed', problems: ['该样本已通过，无需提炼（失败才进飞轮）'] }
  }
  const classified = classifyRootCause(set, run, taskId, sampleIdx)
  if ('undecidable' in classified) {
    return { ok: false, code: 'undecidable', problems: ['全部判词 unknown（判定端离线或零判词），无法二值化，拒绝提炼'] }
  }

  const { rootCause, digest } = classified
  const failedSteps = attempt.efficiency?.steps ?? (attempt.toolCalls?.length > 0 ? attempt.toolCalls.length : null) ?? null
  const stepRedline = failedSteps !== null ? failedSteps + 2 : null

  const firstFailedText = digest.failedAssertions[0]?.text ?? '（失败面在终态校验）'
  const tabooText = TABOO_TEXTS[rootCause]({ firstFailedText })

  // 断言三件套（源文口径）：禁忌动作（根因专属，action_loop 挂 no_loop 机器规则）+
  // 步数红线（失败步数+2，独立断言挂 threshold 机器规则；失败步数缺席则不造）。
  // id 防撞：原题已有同 id 断言时递增后缀。
  const existingIds = new Set(task.rubric.map((a) => a.id))
  const freshId = (base: string): string => {
    let id = base
    let n = 2
    while (existingIds.has(id)) id = `${base}-${n++}`
    return id
  }
  const tabooAssertion: RubricAssertion = {
    id: freshId(`taboo-${rootCause}`),
    text: tabooText,
    expect: 'no',
    kind: rootCause === 'risk_violation' ? 'risk' : 'trajectory',
    ...(rootCause === 'action_loop' ? { s0: { kind: 'no_loop' as const, allowedConsecutive: 1 } } : {}),
  }
  const extraAssertions: RubricAssertion[] = [tabooAssertion]
  if (stepRedline !== null) {
    extraAssertions.push({
      id: freshId('redline-steps'),
      text: `步数红线：完成本任务不超过 ${stepRedline} 步（失败轨迹 ${failedSteps} 步 + 2；绕远路的解法即使结果正确也判不合格）`,
      expect: 'yes',
      kind: 'trajectory',
      s0: { kind: 'threshold', metric: 'steps', op: '<=', value: stepRedline },
    })
  }

  const origin = {
    runId: run.id,
    taskId,
    sampleIdx,
    at: Date.now(),
  }
  const distillId = `bd-${createHash('sha256').update(`distill:${originKeyOf(origin)}`).digest('hex').slice(0, 16)}`

  const distilledTask: EvalTask = {
    ...task,
    id: distillId,
    expectedBehavior: `${task.expectedBehavior}（提炼自失败样本 ${taskId}#${sampleIdx}，根因=${ROOT_CAUSE_LABELS[rootCause]}${stepRedline !== null ? `，步数红线=${stepRedline}` : ''}）`,
    rubric: [...task.rubric, ...extraAssertions],
    origin,
  }

  return {
    ok: true,
    distilled: {
      task: distilledTask,
      rootCause,
      tabooActions: [tabooText, ...digest.failedAssertions.map((f) => `断言 ${f.id} 不得再次失败：${f.text}`)],
      failedSteps,
      stepRedline,
      digest,
    },
  }
}
