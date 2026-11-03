// 介入治理者（注意力轴）纯函数测试：规则优先级逐条打点。
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_ATTENTION_PREFS,
  govern,
  inQuietHours,
  normalizePrefs,
  quietWindowEndMs,
  type InterventionCandidate,
  type InterventionHistoryItem,
} from '../intervention-governor'

const HOUR = 3_600_000
/** 固定本地时间：2026-11-03 10:00（白天）。 */
const DAY = new Date(2026, 10, 3, 10, 0, 0, 0).getTime()
/** 固定本地时间：2026-11-03 23:30（安静时段内）。 */
const NIGHT = new Date(2026, 10, 3, 23, 30, 0, 0).getTime()

const baseCandidate = (patch: Partial<InterventionCandidate> = {}): InterventionCandidate => ({
  id: 'iv-1',
  surface: 'suggestion',
  severity: 'attention',
  audience: 'human',
  urgency: 'normal',
  topicKey: 'unblock-blocked:c1',
  expectedBenefit: 0.7,
  attentionCost: 0.2,
  ...patch,
})

const hist = (patch: Partial<InterventionHistoryItem> = {}): InterventionHistoryItem => ({
  id: 'h1',
  surface: 'suggestion',
  severity: 'attention',
  audience: 'human',
  topicKey: 'unblock-blocked:c1',
  decidedAtMs: DAY - HOUR,
  decision: 'deliver',
  outcome: null,
  ...patch,
})

describe('注意力偏好归一', () => {
  it('缺省值完整；非法值回落；start==end 视为关闭安静时段', () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_ATTENTION_PREFS)
    const p = normalizePrefs({ dailyBudget: -5, hourlyBudget: 999, cooldownMinutes: Number.NaN, quietHours: { startHour: 9, endHour: 9 } })
    expect(p.dailyBudget).toBe(0)
    expect(p.hourlyBudget).toBe(50)
    expect(p.cooldownMinutes).toBe(DEFAULT_ATTENTION_PREFS.cooldownMinutes)
    expect(p.quietHours).toBeNull()
  })
})

describe('安静时段窗口', () => {
  it('同日夜窗与跨夜窗判定', () => {
    expect(inQuietHours(12, { startHour: 9, endHour: 18 })).toBe(true)
    expect(inQuietHours(8, { startHour: 9, endHour: 18 })).toBe(false)
    expect(inQuietHours(23, { startHour: 22, endHour: 8 })).toBe(true)
    expect(inQuietHours(3, { startHour: 22, endHour: 8 })).toBe(true)
    expect(inQuietHours(9, { startHour: 22, endHour: 8 })).toBe(false)
  })

  it('窗口结束时刻：夜内取次日、夜外取当天或次日', () => {
    const end = quietWindowEndMs(NIGHT, { startHour: 22, endHour: 8 })
    expect(new Date(end).getHours()).toBe(8)
    expect(end).toBeGreaterThan(NIGHT)
    const dayEnd = quietWindowEndMs(new Date(2026, 10, 3, 9, 0, 0, 0).getTime(), { startHour: 9, endHour: 18 })
    expect(new Date(dayEnd).getHours()).toBe(18)
  })
})

describe('治理规则优先级', () => {
  it('① critical 必达：安静时段＋预算耗尽也放行', () => {
    const r = govern({
      nowMs: NIGHT,
      prefs: { ...DEFAULT_ATTENTION_PREFS, dailyBudget: 0, hourlyBudget: 0 },
      candidate: baseCandidate({ urgency: 'critical', severity: 'action_required' }),
      history: [],
    })
    expect(r.decision).toBe('deliver')
    expect(r.reasonCode).toBe('critical_bypass')
  })

  it('② 同类冷却：30 分钟内重复项被抑制并给出下次窗口', () => {
    const r = govern({ nowMs: DAY, candidate: baseCandidate(), history: [hist({ decidedAtMs: DAY - 10 * 60_000 })] })
    expect(r.decision).toBe('suppress')
    expect(r.reasonCode).toBe('cooldown')
    expect(r.nextWindowAtMs).toBe(DAY - 10 * 60_000 + 30 * 60_000)
  })

  it('③ 拒绝退避：被拒后 12h 内不再劝（拒绝≠解释不够）', () => {
    const r = govern({
      nowMs: DAY,
      candidate: baseCandidate(),
      history: [hist({ decidedAtMs: DAY - 2 * HOUR, outcome: 'rejected' })],
    })
    expect(r.decision).toBe('suppress')
    expect(r.reasonCode).toBe('rejection_backoff')
    expect(r.reasons.join()).toContain('拒绝意味着这次不需要')
  })

  it('④ 安静时段：attention 延后到窗口结束；action_required 不受影响', () => {
    const defer = govern({ nowMs: NIGHT, candidate: baseCandidate(), history: [] })
    expect(defer.decision).toBe('defer')
    expect(defer.reasonCode).toBe('quiet_hours')
    expect(defer.nextWindowAtMs).toBeGreaterThan(NIGHT)
    const act = govern({ nowMs: NIGHT, candidate: baseCandidate({ severity: 'action_required' }), history: [] })
    expect(act.decision).toBe('deliver')
  })

  it('⑤ 日预算触顶 → defer，窗口按最旧一条滚动', () => {
    const history = Array.from({ length: 8 }, (_, i) => hist({ id: `h${i}`, topicKey: `t-${i}`, decidedAtMs: DAY - HOUR - i * 60_000 }))
    const r = govern({ nowMs: DAY, prefs: { dailyBudget: 8 }, candidate: baseCandidate(), history })
    expect(r.decision).toBe('defer')
    expect(r.reasonCode).toBe('daily_budget')
  })

  it('⑤ 时预算触顶 → defer 到下一小时', () => {
    const history = [
      hist({ id: 'a', topicKey: 't-a', decidedAtMs: DAY - 5 * 60_000 }),
      hist({ id: 'b', topicKey: 't-b', decidedAtMs: DAY - 20 * 60_000 }),
      hist({ id: 'c', topicKey: 't-c', decidedAtMs: DAY - 40 * 60_000 }),
    ]
    const r = govern({ nowMs: DAY, prefs: { hourlyBudget: 3 }, candidate: baseCandidate(), history })
    expect(r.decision).toBe('defer')
    expect(r.reasonCode).toBe('hourly_budget')
  })

  it('⑥ 同面 ≥2 条待议 → 合并递送（多而杂不如少而清）', () => {
    const history = [
      hist({ id: 'd1', topicKey: 't1', decision: 'defer', decidedAtMs: DAY - 30 * 60_000 }),
      hist({ id: 'd2', topicKey: 't2', decision: 'defer', decidedAtMs: DAY - 20 * 60_000 }),
    ]
    const r = govern({ nowMs: DAY, candidate: baseCandidate({ topicKey: 't3' }), history })
    expect(r.decision).toBe('batch')
    expect(r.reasonCode).toBe('batch_backlog')
  })

  it('⑦ 反复延后升级：同话题 ≥3 次 defer 且从未投递 → escalate', () => {
    const history = [1, 2, 3].map((i) => hist({ id: `d${i}`, decision: 'defer', decidedAtMs: DAY - i * HOUR }))
    const r = govern({ nowMs: DAY, candidate: baseCandidate(), history })
    expect(r.decision).toBe('escalate')
    expect(r.reasonCode).toBe('deferral_aging')
  })

  it('⑧ 收益低于阈值 → 抑制（action_required 豁免）', () => {
    const r = govern({
      nowMs: DAY,
      prefs: { minScore: 0.5 },
      candidate: baseCandidate({ severity: 'info', expectedBenefit: 0.2, attentionCost: 0.15 }),
      history: [],
    })
    expect(r.decision).toBe('suppress')
    expect(r.reasonCode).toBe('below_threshold')
    const act = govern({
      nowMs: DAY,
      prefs: { minScore: 0.5 },
      candidate: baseCandidate({ severity: 'action_required', expectedBenefit: 0.1, attentionCost: 0.9 }),
      history: [],
    })
    expect(act.decision).toBe('deliver')
  })

  it('agent 受众不套安静时段与日预算（协作面不是人的注意力）', () => {
    const r = govern({
      nowMs: NIGHT,
      prefs: { dailyBudget: 0, quietHours: { startHour: 22, endHour: 8 } },
      candidate: baseCandidate({ audience: 'agent', severity: 'attention' }),
      history: [],
    })
    expect(r.decision).toBe('deliver')
  })

  it('放行时分数=收益−成本−密度惩罚，密度越高惩罚越大', () => {
    const quiet = govern({ nowMs: DAY, candidate: baseCandidate(), history: [] })
    expect(quiet.reasonCode).toBe('budget_ok')
    expect(quiet.score).toBeCloseTo(0.5, 5)
    const busy = govern({
      nowMs: DAY,
      prefs: { hourlyBudget: 3 },
      candidate: baseCandidate(),
      history: [hist({ id: 'x', decidedAtMs: DAY - 5 * 60_000, topicKey: 'other' })],
    })
    expect(busy.score).toBeCloseTo(0.45, 5)
  })
})
