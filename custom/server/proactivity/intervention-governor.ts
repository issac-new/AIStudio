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

export const INTERVENTION_DECISIONS = ['deliver', 'defer', 'batch', 'suppress', 'escalate', 'clarify', 'hold'] as const
export type InterventionDecision = (typeof INTERVENTION_DECISIONS)[number]

export type GovernorReasonCode =
  | 'critical_bypass'
  | 'clarify_first'
  | 'irreversible_hold'
  | 'blast_radius_confirm'
  | 'breakpoint_wait'
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

/** 成本性质（p26）：建议/提醒花用户注意力，环境动作花资源与风险——两类不共用一把预算尺。 */
export const INTERVENTION_KINDS = ['attention', 'resource'] as const
export type InterventionKind = (typeof INTERVENTION_KINDS)[number]

/** 可逆性（p27-28）：可逆 / 代价可逆 / 不可逆。 */
export const REVERSIBILITY_LEVELS = ['reversible', 'costly', 'irreversible'] as const
export type Reversibility = (typeof REVERSIBILITY_LEVELS)[number]

export type BlastRadius = 'self' | 'team' | 'external'

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
  /** 置信下限（p24 第一门）：低于此值先澄清，不直接行动。 */
  minConfidence: number
}

export const DEFAULT_ATTENTION_PREFS: AttentionPrefs = {
  quietHours: { startHour: 22, endHour: 8 },
  dailyBudget: 8,
  hourlyBudget: 3,
  cooldownMinutes: 30,
  rejectionBackoffHours: 12,
  minScore: 0.2,
  minConfidence: 0.5,
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
  /** 成本性质（p26）：缺省 attention。resource 类不受注意力预算约束。 */
  kind?: InterventionKind
  /** 置信（0-1，p24 第一门）：低于 minConfidence 先澄清。缺省=不参与（保持旧行为）。 */
  confidence?: number | null
  /** 可逆性（p27-28 第四门）：不可逆 + 对外影响 → hold；代价可逆 → 需确认升级。 */
  reversibility?: Reversibility | null
  blastRadius?: BlastRadius | null
  /** 当前是否处在任务断点（p27「骑现成断点」）；调用方声明。 */
  atBreakpoint?: boolean
  /** 下一个断点时刻（可延后到断点再投递）。 */
  nextBreakpointAtMs?: number | null
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
    minConfidence: num(input.minConfidence, d.minConfidence, 0, 1),
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
  const urgency = c.urgency ?? 'normal'
  const topic = topicOf(c)
  const defaults = SEVERITY_DEFAULTS[c.severity]
  const benefit = typeof c.expectedBenefit === 'number' ? c.expectedBenefit : defaults.benefit
  const cost = typeof c.attentionCost === 'number' ? c.attentionCost : defaults.cost
  const isHuman = c.audience === 'human'
  const kind: InterventionKind = c.kind ?? 'attention'

  const delivered = history.filter((h) => h.decision === 'deliver' || h.decision === 'escalate')
  const humanDelivers24h = delivered.filter((h) => h.audience === 'human' && now - h.decidedAtMs < 24 * HOUR_MS)
  const humanDelivers1h = delivered.filter((h) => h.audience === 'human' && now - h.decidedAtMs < HOUR_MS)
  const sameTopic = history.filter((h) => (h.topicKey ?? `${h.surface}:${h.id}`) === topic)
  const sameTopicDelivers = sameTopic.filter((h) => h.decision === 'deliver' || h.decision === 'escalate')
  const sameTopicRejected = sameTopic.filter((h) => h.outcome === 'rejected')
  const sameTopicDefers = sameTopic.filter((h) => h.decision === 'defer')
  const pendingDefersSameSurface = history.filter(
    (h) => h.decision === 'defer' && h.audience === 'human' && h.surface === c.surface && now - h.decidedAtMs < 2 * HOUR_MS,
  )

  // 未来接受度折现（p26 cry-wolf）：近期人面投递里被忽略/拒绝的比例越高，此刻的「愿意听」越低。
  const recentHumanDeliverIds = new Set(humanDelivers24h.map((h) => h.id))
  const recentOutcomes = history.filter((h) => recentHumanDeliverIds.has(h.id) && h.outcome != null)
  const negative = recentOutcomes.filter((h) => h.outcome === 'ignored' || h.outcome === 'rejected').length
  const receptivity = recentOutcomes.length >= 3 ? negative / recentOutcomes.length : 0

  // 近期打扰密度惩罚：每小时每多一条，分数下调 0.05（上限 0.2）
  const densityPenalty = Math.min(0.2, 0.05 * humanDelivers1h.length)
  const receptivityPenalty = Number((0.3 * receptivity).toFixed(4))
  const score = Number((benefit - cost - densityPenalty - receptivityPenalty).toFixed(4))
  const baseReasons = [
    `收益 ${benefit.toFixed(2)} − 成本 ${cost.toFixed(2)} − 密度惩罚 ${densityPenalty.toFixed(2)} − 接受度折现 ${receptivityPenalty.toFixed(2)} = ${score.toFixed(2)}`,
  ]

  // ── 门 0：安全必达（本仓对安全告警通道的显式豁免，见 spec D6）──
  if (urgency === 'critical') {
    return {
      decision: 'deliver',
      reasonCode: 'critical_bypass',
      reasons: ['critical 级介入必达：安全/不可逆风险优先于安静时段与预算'],
      score,
    }
  }

  // ── 门 1：置信（p24）——把握不够时先问，不是先压 ──
  if (typeof c.confidence === 'number' && c.severity !== 'action_required' && c.confidence < prefs.minConfidence) {
    return {
      decision: 'clarify',
      reasonCode: 'clarify_first',
      reasons: [`置信 ${c.confidence.toFixed(2)} 低于下限 ${prefs.minConfidence}：先把不确定处问清，再决定要不要行动（混 Initiative 的经典解：有把握才直接做，没把握就对话）`],
      score,
    }
  }

  // ── 门 2：价值 vs 成本（p26）——含同类冷却、拒绝退避、收益阈值 ──
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
  if (c.severity !== 'action_required' && score < prefs.minScore) {
    return { decision: 'suppress', reasonCode: 'below_threshold', reasons: [...baseReasons, `低于阈值 ${prefs.minScore}，不值得占用注意力`], score }
  }

  // ── 门 3：时机（p26-27）——安静时段、断点、预算 ──
  if (isHuman && prefs.quietHours && c.severity !== 'action_required' && inQuietHours(localHour(now), prefs.quietHours)) {
    return {
      decision: 'defer',
      reasonCode: 'quiet_hours',
      reasons: [`落在安静时段 ${prefs.quietHours.startHour}:00-${prefs.quietHours.endHour}:00，非必须项延后到窗口结束`],
      score,
      nextWindowAtMs: quietWindowEndMs(now, prefs.quietHours),
    }
  }
  // 断点：注意力型 info 若不在断点且调用方给了下一断点，延后到断点（骑现成断点，p27）
  if (isHuman && kind === 'attention' && c.severity === 'info' && c.atBreakpoint === false && typeof c.nextBreakpointAtMs === 'number' && c.nextBreakpointAtMs > now) {
    return {
      decision: 'defer',
      reasonCode: 'breakpoint_wait',
      reasons: ['当前不在任务断点：注意到信息型干预延后到下一个断点，避免打断思路'],
      score,
      nextWindowAtMs: c.nextBreakpointAtMs,
    }
  }
  // 预算只约束注意力性质的人面干预；资源型（环境动作）不占注意力额度
  if (isHuman && kind === 'attention' && humanDelivers24h.length >= prefs.dailyBudget) {
    const oldest = humanDelivers24h.reduce((m, h) => Math.min(m, h.decidedAtMs), now)
    return {
      decision: 'defer',
      reasonCode: 'daily_budget',
      reasons: [`今日已主动打扰 ${humanDelivers24h.length} 次（上限 ${prefs.dailyBudget}），延后到额度滚动`],
      score,
      nextWindowAtMs: oldest + 24 * HOUR_MS,
    }
  }
  if (isHuman && kind === 'attention' && humanDelivers1h.length >= prefs.hourlyBudget) {
    const oldest = humanDelivers1h.reduce((m, h) => Math.min(m, h.decidedAtMs), now)
    return {
      decision: 'defer',
      reasonCode: 'hourly_budget',
      reasons: [`本小时已打扰 ${humanDelivers1h.length} 次（上限 ${prefs.hourlyBudget}），延后到下一小时`],
      score,
      nextWindowAtMs: oldest + HOUR_MS,
    }
  }
  if (pendingDefersSameSurface.length >= 2) {
    return {
      decision: 'batch',
      reasonCode: 'batch_backlog',
      reasons: [`同面另有 ${pendingDefersSameSurface.length} 条延后项，合并递送以减少打扰次数`],
      score,
    }
  }
  if (sameTopicDefers.length >= 3 && sameTopicDelivers.length === 0 && c.severity !== 'info') {
    return {
      decision: 'escalate',
      reasonCode: 'deferral_aging',
      reasons: [`同话题已延后 ${sameTopicDefers.length} 次仍未投递——升级投递，避免静默丢弃`],
      score,
    }
  }

  // ── 门 4：风险与可逆（p27-28）──
  if (c.reversibility === 'irreversible' && c.blastRadius === 'external' && c.severity !== 'action_required') {
    return {
      decision: 'hold',
      reasonCode: 'irreversible_hold',
      reasons: ['不可逆且对外影响：等待便宜时优雅不动本身就是校准结论（intelligent disobedience）——需人工硬门放行'],
      score,
    }
  }
  if (c.reversibility === 'costly' || c.blastRadius === 'team') {
    return {
      decision: 'escalate',
      reasonCode: 'blast_radius_confirm',
      reasons: ['代价可逆或影响团队：权限随后果强度成比例——要求显式确认后再执行'],
      score,
    }
  }

  return { decision: 'deliver', reasonCode: 'budget_ok', reasons: [...baseReasons, '预算、冷却与风险门均有余量'], score }
}
