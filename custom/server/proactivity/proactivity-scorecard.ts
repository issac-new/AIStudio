// overlay/proactivity 域：主动性三层计分卡（2026-11-03 主动式 AI 综述吸收轮）。
//
// 综述第 4 命题把评估分三层：任务层（主动帮助有没有改善结果、收益能否抵消成本）、
// 机制层（有没有理解上下文/预判需求/选对时机/采取恰当行动）、用户层（人的负担、控制感、
// 信任是否与可靠性匹配）。前两层仓内已有评测体系承载；本文件补的是**用户层**，
// 并把三层投影到同一张卡上，供治理面板与巡检读数直接消费。
//
// 口径声明：全部指标度量「系统行为」（打扰/接受/忽略/撤回），不是真人满意度——
// 没有真人实验时不声称满意度。
import type { GovernorReasonCode, InterventionAudience, InterventionDecision } from './intervention-governor'

export interface ScorecardInput {
  entries: Array<{
    id: string
    surface: string
    severity: string
    audience: InterventionAudience
    decision: InterventionDecision
    reasonCode: GovernorReasonCode
    score: number
    decidedAtMs: number
    /** 话题键（漏助/去重统计用）；缺省按 id 归并。 */
    topicKey?: string
  }>
  outcomes: Array<{ interventionId: string; outcome: string; at: number }>
  /** 关联结果（任务层）：被采纳建议里，后续确实产生了动作的条数（缺省 0，不猜）。 */
  acceptedWithEffect?: number
}

export interface ProactivityScorecard {
  task: {
    /** 被采纳的介入条数。 */
    accepted: number
    /** 采纳后确有动作的条数（外部标注；无来源就 0，不猜）。 */
    acceptedWithEffect: number
    /** 采纳转化率（accepted / delivered）。 */
    acceptanceRate: number | null
    /** 适当依赖的可判定子集（p47 四象限）：有外部真值时才分段，否则 unknown 全量。 */
    reliance: { acceptedWithEffect: number; acceptedWithoutEffect: number; rejected: number; unknown: number }
  }
  mechanism: {
    decisions: Record<InterventionDecision, number>
    /** 命中冷却/退避/阈值而被抑制的条数。 */
    suppressed: number
    deferred: number
    batched: number
    escalated: number
    /** 因安静时段延后。 */
    quietHoursDefers: number
    /** 因预算延后。 */
    budgetDefers: number
    /** 反复延后升级。 */
    deferralAging: number
    /** 先澄清（置信不足）。 */
    clarifications: number
    /** 优雅不动（不可逆+对外）。 */
    holds: number
    /** 介入精确率 = 被接受 / 已投递（p42 的 operational interruption-cost 口径）。 */
    interventionPrecision: number | null
    /** 误介入率 = 被拒 / 已投递。 */
    falseInterventionRate: number | null
    /** 漏助（近似）：延后过但同话题从未投递的条数。 */
    missedAssistance: number
  }
  user: {
    /** 真正占用人注意力的条数（deliver + escalate；agent 面不计）。 */
    interruptions: number
    accepted: number
    rejected: number
    ignored: number
    modified: number
    takeover: number
    snoozed: number
    acceptanceRate: number | null
    ignoreRate: number | null
    /** 撤回/接管占比（后续被纠正的比例）。 */
    retractionRate: number | null
    /** 信任校准度：接受率高但同时纠正率也高=「接受了但随后改掉」，说明可靠性被高估。 */
    trustGap: number | null
    /** 安静时段拦截数。 */
    quietHoursBlocked: number
    /** 预算触顶数。 */
    budgetCapped: number
  }
  note: string
}

function ratio(n: number, d: number): number | null {
  return d > 0 ? Number((n / d).toFixed(4)) : null
}

export function buildScorecard(input: ScorecardInput): ProactivityScorecard {
  const latest = new Map<string, string>()
  for (const o of input.outcomes) latest.set(o.interventionId, o.outcome)
  const decisions: Record<InterventionDecision, number> = {
    deliver: 0,
    defer: 0,
    batch: 0,
    suppress: 0,
    escalate: 0,
    clarify: 0,
    hold: 0,
  }
  let quietHoursDefers = 0
  let budgetDefers = 0
  let deferralAging = 0
  let humanInterruptions = 0
  let clarifications = 0
  let holds = 0
  const deferredTopics = new Map<string, number>()
  const deliveredTopics = new Set<string>()
  for (const e of input.entries) {
    decisions[e.decision] += 1
    if (e.reasonCode === 'quiet_hours') quietHoursDefers += 1
    if (e.reasonCode === 'daily_budget' || e.reasonCode === 'hourly_budget') budgetDefers += 1
    if (e.reasonCode === 'deferral_aging') deferralAging += 1
    if (e.decision === 'clarify') clarifications += 1
    if (e.decision === 'hold') holds += 1
    const topic = e.topicKey ?? e.id
    if (e.decision === 'defer') deferredTopics.set(topic, (deferredTopics.get(topic) ?? 0) + 1)
    if (e.decision === 'deliver' || e.decision === 'escalate') deliveredTopics.add(topic)
    if (e.audience === 'human' && (e.decision === 'deliver' || e.decision === 'escalate')) humanInterruptions += 1
  }
  // 反馈只统计人面投递过的条目（agent 面没有「人接受」语义）
  const humanDelivered = new Set(
    input.entries
      .filter((e) => e.audience === 'human' && (e.decision === 'deliver' || e.decision === 'escalate'))
      .map((e) => e.id),
  )
  const outcomes = input.outcomes.filter((o) => humanDelivered.has(o.interventionId))
  const count = (name: string) => outcomes.filter((o) => o.outcome === name).length
  const accepted = count('accepted')
  const rejected = count('rejected')
  const ignored = count('ignored')
  const modified = count('modified')
  const takeover = count('takeover')
  const snoozed = count('snoozed')
  const withFeedback = outcomes.length
  const acceptanceRate = ratio(accepted, withFeedback)
  const retractionRate = ratio(modified + takeover, withFeedback)
  const missedAssistance = [...deferredTopics.keys()].filter((k) => !deliveredTopics.has(k)).length
  return {
    task: {
      accepted,
      acceptedWithEffect: Math.max(0, Math.min(accepted, input.acceptedWithEffect ?? 0)),
      acceptanceRate: ratio(accepted, Math.max(humanInterruptions, withFeedback)),
      reliance: {
        acceptedWithEffect: Math.max(0, Math.min(accepted, input.acceptedWithEffect ?? 0)),
        acceptedWithoutEffect: Math.max(0, accepted - Math.max(0, Math.min(accepted, input.acceptedWithEffect ?? 0))),
        rejected,
        unknown: Math.max(0, humanInterruptions - withFeedback),
      },
    },
    mechanism: {
      decisions,
      suppressed: decisions.suppress,
      deferred: decisions.defer,
      batched: decisions.batch,
      escalated: decisions.escalate,
      quietHoursDefers,
      budgetDefers,
      deferralAging,
      clarifications,
      holds,
      interventionPrecision: ratio(accepted, withFeedback),
      falseInterventionRate: ratio(rejected, withFeedback),
      missedAssistance,
    },
    user: {
      interruptions: humanInterruptions,
      accepted,
      rejected,
      ignored,
      modified,
      takeover,
      snoozed,
      acceptanceRate,
      ignoreRate: ratio(ignored, withFeedback),
      retractionRate,
      trustGap:
        acceptanceRate != null && retractionRate != null ? Number((acceptanceRate - retractionRate).toFixed(4)) : null,
      quietHoursBlocked: quietHoursDefers,
      budgetCapped: budgetDefers,
    },
    note:
      '指标度量系统行为（打扰/接受/忽略/撤回），不是真人满意度；无真人实验时不声称满意度。agent 面投递不计入注意力口径。',
  }
}
