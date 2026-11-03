// overlay/proactivity 域：介入治理者（注意力轴，2026-11-03 主动式 AI 综述吸收轮）。
//
// 分工（与 proactivity-model.ts 正交）：
//   proactivity-model 管**权限轴**——L1-L5 问题定义权 × 五档动作，决定「最多能做到哪一步」；
//   本文件管**注意力轴**——同一动作在什么时机、以什么形态递给**人**，决定「现在该不该出现」。
//
// 综述《Proactive AI for Superintelligent Agents》第 3 命题：主动性最难的是「这次先别帮」。
// 失败不是做错，而是事情做得对、用户不希望它发生（反复推送/偏好已变/把拒绝当解释不够）。
// 因此本层显式建模：安静时段、打扰预算、同类冷却、拒绝退避、积压合并、反复延后升级。
//
// 纯函数：不读盘不读 env；service/控制器提供 prefs 与历史。

export const INTERVENTION_SURFACES = ['suggestion', 'brief', 'alert', 'approval', 'nudge'] as const
export type InterventionSurface = (typeof INTERVENTION_SURFACES)[number]

export const INTERVENTION_SEVERITIES = ['info', 'attention', 'action_required'] as const
export type InterventionSeverity = (typeof INTERVENTION_SEVERITIES)[number]

/** 受众：human=消费人的注意力（受全部规则约束）；agent=协作编排面（只受冷却与频控约束）。 */
export const INTERVENTION_AUDIENCES = ['human', 'agent'] as const
export type InterventionAudience = (typeof INTERVENTION_AUDIENCES)[number]

export const INTERVENTION_URGENCIES = ['low', 'normal', 'critical'] as const
export type InterventionUrgency = (typeof INTERVENTION_URGENCIES)[number]

export const INTERVENTION_OUTCOMES = ['accepted', 'rejected', 'ignored', 'modified', 'takeover', 'snoozed'] as const
export type InterventionOutcome = (typeof INTERVENTION_OUTCOMES)[number]

export const INTERVENTION_DECISIONS = ['deliver', 'defer', 'batch', 'suppress', 'escalate'] as const
export type InterventionDecision = (typeof INTERVENTION_DECISIONS)[number]

export type GovernorReasonCode =
  | 'critical_bypass'
  | 'cooldown'
  | 'rejection_backoff'
  | 'quiet_hours'
  | 'daily_budget'
  | 'hourly_budget'
  | 'batch_backlog'
  | 'deferral_aging'
  | 'below_threshold'
  | 'budget_ok'

export interface QuietHours {
  /** 本地时区小时（0-23）；[startHour, endHour)，start>end 表示跨夜。 */
  startHour: number
  endHour: number
}

export interface AttentionPrefs {
  quietHours: QuietHours | null
  /** 人面每 24h 最多主动打扰条数（不含 critical/安全告警）。 */
  dailyBudget: number
  /** 人面每小时上限。 */
  hourlyBudget: number
  /** 同话题冷却（分钟）：冷却期内的重复项不重复打扰。 */
  cooldownMinutes: number
  /** 同话题被拒后的退避（小时）：拒绝≠再劝。 */
  rejectionBackoffHours: number
  /** 收益成本分下限：低于此值不打扰（仅约束 info/attention）。 */
  minScore: number
}

export const DEFAULT_ATTENTION_PREFS: AttentionPrefs = {
  quietHours: { startHour: 22, endHour: 8 },
  dailyBudget: 8,
  hourlyBudget: 3,
  cooldownMinutes: 30,
  rejectionBackoffHours: 12,
  minScore: 0.2,
}

export interface InterventionCandidate {
  id: string
  surface: InterventionSurface
  severity: InterventionSeverity
  audience: InterventionAudience
  urgency?: InterventionUrgency
  /** 去重/冷却键（如 `unblock-blocked:<cardId>`）；缺省按 surface+id。 */
  topicKey?: string | null
  /** 预期收益（0-1）；缺省按 severity 取保守值。 */
  expectedBenefit?: number | null
  /** 打断成本（0-1）；缺省按 severity 取保守值。 */
  attentionCost?: number | null
}

export interface InterventionHistoryItem {
  id: string
  surface: InterventionSurface
  severity: InterventionSeverity
  audience: InterventionAudience
  topicKey?: string | null
  decidedAtMs: number
  decision: InterventionDecision
  outcome?: InterventionOutcome | null
}

export interface GovernorInput {
  nowMs: number
  prefs?: Partial<AttentionPrefs> | null
  candidate: InterventionCandidate
  /** 近期（建议 ≥24h）干预史；调用方按自身保留量传入。 */
  history?: InterventionHistoryItem[]
}

export interface GovernorResult {
  decision: InterventionDecision
  reasonCode: GovernorReasonCode
  reasons: string[]
  /** 收益成本分（0-1 区间外也可能为负，负数即「不划算」）。 */
  score: number
  /** defer/suppress 时的建议下次可投递时刻（安静时段结束、预算窗口滚动等）。 */
  nextWindowAtMs?: number
}

const HOUR_MS = 60 * 60 * 1000

/** 严重度→缺省收益/打断成本（启发式，见 spec D5）。 */
const SEVERITY_DEFAULTS: Record<InterventionSeverity, { benefit: number; cost: number }> = {
  info: { benefit: 0.3, cost: 0.1 },
  attention: { benefit: 0.6, cost: 0.3 },
  action_required: { benefit: 0.8, cost: 0.6 },
}

/** 归一化偏好：缺项取缺省，非法值回落缺省（fail-soft，不猜）。 */
export function normalizePrefs(input?: Partial<AttentionPrefs> | null): AttentionPrefs {
  const d = DEFAULT_ATTENTION_PREFS
  if (!input) return { ...d }
  const num = (v: unknown, fallback: number, min: number, max: number): number => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback
    return Math.min(max, Math.max(min, n))
  }
  const q = input.quietHours
  const quietHours =
    q === null
      ? null
      : q && Number.isInteger(q.startHour) && Number.isInteger(q.endHour)
        ? { startHour: Math.min(23, Math.max(0, q.startHour)), endHour: Math.min(23, Math.max(0, q.endHour)) }
        : d.quietHours
  return {
    quietHours: quietHours && quietHours.startHour === quietHours.endHour ? null : quietHours,
    dailyBudget: Math.round(num(input.dailyBudget, d.dailyBudget, 0, 200)),
    hourlyBudget: Math.round(num(input.hourlyBudget, d.hourlyBudget, 0, 50)),
    cooldownMinutes: num(input.cooldownMinutes, d.cooldownMinutes, 0, 1440),
    rejectionBackoffHours: num(input.rejectionBackoffHours, d.rejectionBackoffHours, 0, 720),
    minScore: num(input.minScore, d.minScore, -1, 1),
  }
}

/** 本地小时（与 Date 的本地时区一致；测试可用固定时间构造）。 */
export function localHour(ms: number): number {
  return new Date(ms).getHours()
}

/** 是否落在安静时段（支持跨夜；start==end 视为无窗口，normalizePrefs 已归一为 null）。 */
export function inQuietHours(hour: number, q: QuietHours | null): boolean {
  if (!q) return false
  if (q.startHour === q.endHour) return false
  if (q.startHour < q.endHour) return hour >= q.startHour && hour < q.endHour
  return hour >= q.startHour || hour < q.endHour
}

/** 安静时段结束时刻（严格大于 nowMs）。 */
export function quietWindowEndMs(nowMs: number, q: QuietHours): number {
  const end = new Date(nowMs)
  const target = new Date(nowMs)
  target.setHours(q.endHour, 0, 0, 0)
  // 落在窗口内：结束在同一天（start<end）或次日（跨夜且当前小时 >= start）
  if (target.getTime() > nowMs) {
    const hour = end.getHours()
    const crossing = q.startHour > q.endHour && hour >= q.startHour
    if (!crossing) return target.getTime()
  }
  target.setDate(target.getDate() + 1)
  target.setHours(q.endHour, 0, 0, 0)
  return target.getTime()
}

function topicOf(c: InterventionCandidate): string {
  return (c.topicKey ?? `${c.surface}:${c.id}`).trim()
}

/**
 * 介入裁决（纯函数）。规则顺序即优先级，命中即返回：
 *  critical 必达 → 同类冷却 → 拒绝退避 → 安静时段 → 日预算 → 时预算 →
 *  积压合并 → 反复延后升级 → 收益成本阈值 → 放行。
 */
export function govern(input: GovernorInput): GovernorResult {
  const prefs = normalizePrefs(input.prefs)
  const c = input.candidate
  const history = input.history ?? []
  const now = input.nowMs
  const urgency = c.urgency ?? (c.severity === 'action_required' ? 'normal' : 'normal')
  const topic = topicOf(c)
  const defaults = SEVERITY_DEFAULTS[c.severity]
  const benefit = typeof c.expectedBenefit === 'number' ? c.expectedBenefit : defaults.benefit
  const cost = typeof c.attentionCost === 'number' ? c.attentionCost : defaults.cost
  const isHuman = c.audience === 'human'

  const recentDeliver = history.filter(
    (h) => h.decision === 'deliver' || h.decision === 'escalate',
  )
  const humanDelivers24h = recentDeliver.filter((h) => h.audience === 'human' && now - h.decidedAtMs < 24 * HOUR_MS)
  const humanDelivers1h = recentDeliver.filter((h) => h.audience === 'human' && now - h.decidedAtMs < HOUR_MS)
  const sameTopic = history.filter((h) => (h.topicKey ?? `${h.surface}:${h.id}`) === topic)
  const sameTopicDelivers = sameTopic.filter((h) => h.decision === 'deliver' || h.decision === 'escalate')
  const sameTopicRejected = sameTopic.filter((h) => h.outcome === 'rejected')
  const sameTopicDefers = sameTopic.filter((h) => h.decision === 'defer')
  const pendingDefersSameSurface = history.filter(
    (h) => h.decision === 'defer' && h.audience === 'human' && h.surface === c.surface && now - h.decidedAtMs < 2 * HOUR_MS,
  )

  // 近期打扰密度惩罚：每小时每多一条，分数下调 0.05（上限 0.2）
  const penalty = Math.min(0.2, 0.05 * humanDelivers1h.length)
  const score = Number((benefit - cost - penalty).toFixed(4))

  // ① critical 必达：安全与不可逆风险优先于一切节流（安全告警另有独立通道，此处只兜底）
  if (urgency === 'critical') {
    return {
      decision: 'deliver',
      reasonCode: 'critical_bypass',
      reasons: ['critical 级介入必达：安全/不可逆风险优先于安静时段与预算（综述：某些情况必须打断）'],
      score,
    }
  }

  // ② 同类冷却：同一话题刚打扰过，不重复（人面与 agent 面都适用）
  const lastDeliver = sameTopicDelivers.sort((a, b) => b.decidedAtMs - a.decidedAtMs)[0]
  if (lastDeliver && now - lastDeliver.decidedAtMs < prefs.cooldownMinutes * 60_000) {
    return {
      decision: 'suppress',
      reasonCode: 'cooldown',
      reasons: [`同类话题 ${Math.round((now - lastDeliver.decidedAtMs) / 60_000)} 分钟前刚提过（冷却 ${prefs.cooldownMinutes} 分钟）`],
      score,
      nextWindowAtMs: lastDeliver.decidedAtMs + prefs.cooldownMinutes * 60_000,
    }
  }

  // ③ 拒绝退避：拒绝≠再劝（综述点名的失败模式）
  const lastRejected = sameTopicRejected.sort((a, b) => b.decidedAtMs - a.decidedAtMs)[0]
  if (lastRejected && now - lastRejected.decidedAtMs < prefs.rejectionBackoffHours * HOUR_MS) {
    return {
      decision: 'suppress',
      reasonCode: 'rejection_backoff',
      reasons: [
        `同类话题被拒后 ${Math.round((now - lastRejected.decidedAtMs) / HOUR_MS)} 小时（退避 ${prefs.rejectionBackoffHours} 小时）——拒绝意味着这次不需要，不是解释不够`,
      ],
      score,
      nextWindowAtMs: lastRejected.decidedAtMs + prefs.rejectionBackoffHours * HOUR_MS,
    }
  }

  // ④ 安静时段：只压 info/attention；action_required 视为必须让人知道
  if (isHuman && prefs.quietHours && c.severity !== 'action_required' && inQuietHours(localHour(now), prefs.quietHours)) {
    return {
      decision: 'defer',
      reasonCode: 'quiet_hours',
      reasons: [`落在安静时段 ${prefs.quietHours.startHour}:00-${prefs.quietHours.endHour}:00，非必须项延后到窗口结束`],
      score,
      nextWindowAtMs: quietWindowEndMs(now, prefs.quietHours),
    }
  }

  // ⑤ 预算（人面）：日/时上限触顶即延后，不静默丢弃
  if (isHuman && humanDelivers24h.length >= prefs.dailyBudget) {
    const oldest = humanDelivers24h.reduce((m, h) => Math.min(m, h.decidedAtMs), now)
    return {
      decision: 'defer',
      reasonCode: 'daily_budget',
      reasons: [`今日已主动打扰 ${humanDelivers24h.length} 次（上限 ${prefs.dailyBudget}），延后到额度滚动`],
      score,
      nextWindowAtMs: oldest + 24 * HOUR_MS,
    }
  }
  if (isHuman && humanDelivers1h.length >= prefs.hourlyBudget) {
    const oldest = humanDelivers1h.reduce((m, h) => Math.min(m, h.decidedAtMs), now)
    return {
      decision: 'defer',
      reasonCode: 'hourly_budget',
      reasons: [`本小时已打扰 ${humanDelivers1h.length} 次（上限 ${prefs.hourlyBudget}），延后到下一小时`],
      score,
      nextWindowAtMs: oldest + HOUR_MS,
    }
  }

  // ⑥ 积压合并：同面已有 ≥2 条待议，合并成一条发（多而杂不如少而清）
  if (pendingDefersSameSurface.length >= 2) {
    return {
      decision: 'batch',
      reasonCode: 'batch_backlog',
      reasons: [`同面另有 ${pendingDefersSameSurface.length} 条延后项，合并递送以减少打扰次数`],
      score,
    }
  }

  // ⑦ 反复延后升级：同话题延后 ≥3 次且从未投递——静默丢失比吵闹更糟
  if (sameTopicDefers.length >= 3 && sameTopicDelivers.length === 0 && c.severity !== 'info') {
    return {
      decision: 'escalate',
      reasonCode: 'deferral_aging',
      reasons: [`同话题已延后 ${sameTopicDefers.length} 次仍未投递——升级投递，避免静默丢弃`],
      score,
    }
  }

  // ⑧ 收益成本阈值：不划算就不打扰（action_required 不受此限）
  if (c.severity !== 'action_required' && score < prefs.minScore) {
    return {
      decision: 'suppress',
      reasonCode: 'below_threshold',
      reasons: [`收益 ${benefit.toFixed(2)} − 成本 ${cost.toFixed(2)} − 密度惩罚 ${penalty.toFixed(2)} = ${score.toFixed(2)} 低于阈值 ${prefs.minScore}，不值得占用注意力`],
      score,
    }
  }

  return {
    decision: 'deliver',
    reasonCode: 'budget_ok',
    reasons: [`收益 ${benefit.toFixed(2)} − 成本 ${cost.toFixed(2)} − 密度惩罚 ${penalty.toFixed(2)} = ${score.toFixed(2)}；预算与冷却均有余量`],
    score,
  }
}
