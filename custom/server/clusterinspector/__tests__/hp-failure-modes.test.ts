// 三失败模式观测守门（2026-10-23 Harness 十一坑吸收轮 HP-5）。
// 腾讯文引 OpenAI/Anthropic：过早宣布胜利/上下文焦虑/越权操作。
// 本批新增：session.context-anxiety（双条件）+ security.sensitive-path（采集真空补告警）
// + 既有 premature-victory 家族打分类轴标。
import { describe, expect, it } from 'vitest'
import type { ClusterSnapshot, SessionTelemetryFace } from '../collectors'
import { detectAll, detectContextAnxiety, detectSensitivePath } from '../detectors'
import { detectZeroDelivery } from '../detectors-zero-delivery'

function snap(partial: Partial<ClusterSnapshot>): ClusterSnapshot {
  return {
    ts: 1,
    gateway: { ok: true },
    sessions: { ok: true, entries: 0, live: 0, dead: [] },
    profiles: { ok: true, tails: [] },
    kanban: { ok: false, rows: [] },
    runningCards: { ok: false, cards: [] },
    federation: { ok: false, nowMs: 1, machines: [] },
    ...partial,
  }
}

function telemetry(entries: Array<Record<string, unknown>>): SessionTelemetryFace {
  return {
    ok: true,
    entries: entries.map((e, i) => ({
      sessionKey: `s-${i}`, tsMs: 1, watermarkPct: null, turns: 10, cumApiCalls: 40, emptyStreak: 0, rotations: 0, ...e,
    })) as SessionTelemetryFace['entries'],
  }
}

describe('session.context-anxiety（双条件：压力 ∧ 行为签名）', () => {
  it('高水位 + 空转连击 → warn（failureMode=context-anxiety）', () => {
    const out = detectContextAnxiety(snap({ sessionTelemetry: telemetry([{ watermarkPct: 88, emptyStreak: 3 }]) }))
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ detector: 'session.context-anxiety', severity: 'warn', failureMode: 'context-anxiety' })
    expect(out[0].summary).toContain('焦虑')
  })

  it('压缩 now 档 + 多次轮换 → warn；双签名（空转∧轮换）→ high', () => {
    const single = detectContextAnxiety(snap({ sessionTelemetry: telemetry([{ compaction: { level: 'now', triggerTokens: 1, headroomTokens: 0, reserveTokens: 0 }, rotations: 3 }]) }))
    expect(single[0].severity).toBe('warn')
    const both = detectContextAnxiety(snap({ sessionTelemetry: telemetry([{ watermarkPct: 92, emptyStreak: 4, rotations: 5 }]) }))
    expect(both[0].severity).toBe('high')
  })

  it('纯高水位无行为签名不报（D9 已管水位，重复报=狼来了）；低水位不报', () => {
    const pureWatermark = detectContextAnxiety(snap({ sessionTelemetry: telemetry([{ watermarkPct: 90 }]) }))
    expect(pureWatermark).toHaveLength(0)
    const lowPressure = detectContextAnxiety(snap({ sessionTelemetry: telemetry([{ watermarkPct: 50, emptyStreak: 9, rotations: 9 }]) }))
    expect(lowPressure).toHaveLength(0)
  })

  it('未接线=合法空态；detectAll 聚合内可达', () => {
    expect(detectContextAnxiety(snap({}))).toHaveLength(0)
    const all = detectAll(snap({ sessionTelemetry: telemetry([{ watermarkPct: 85, emptyStreak: 3 }]) }))
    expect(all.some((a) => a.detector === 'session.context-anxiety')).toBe(true)
  })
})

describe('security.sensitive-path（越权观测真空补告警）', () => {
  const usage = (n: number) => ({
    ok: true, nowMs: 1,
    entries: [{ profile: 'p1', total1h: 3, total24h: 9, highRisk24h: 0, offhours24h: 0, offhoursHighRisk24h: 0, sensitivePath24h: n, perTool24h: [{ tool: 'terminal', n: 9 }] }],
  })

  it('达阈 warn、≥3× high、阈下静默、fail-soft 条目跳过', () => {
    expect(detectSensitivePath(snap({ toolUsage: usage(3) }))).toHaveLength(0)
    const warn = detectSensitivePath(snap({ toolUsage: usage(5) }))
    expect(warn[0]).toMatchObject({ detector: 'security.sensitive-path', severity: 'warn', failureMode: 'unauthorized-action' })
    const high = detectSensitivePath(snap({ toolUsage: usage(20) }))
    expect(high[0].severity).toBe('high')
    const errored = { ok: true, nowMs: 1, entries: [{ ...usage(20).entries[0], error: 'db locked' }] }
    expect(detectSensitivePath(snap({ toolUsage: errored as never }))).toHaveLength(0)
  })

  it('未接线=合法空态', () => {
    expect(detectSensitivePath(snap({}))).toHaveLength(0)
  })
})

describe('premature-victory 家族打标（分类轴不改变既有语义）', () => {
  it('zero-delivery 异常携带 failureMode=premature-victory', () => {
    const face = {
      ok: true,
      cards: [{
        id: 'c1', title: '修复登录 bug', status: 'done', assignee: 'a1', body: '已修复', branch_name: null,
      }],
    }
    const out = detectZeroDelivery(snap({ runningCards: face as never }))
    expect(out).toHaveLength(1)
    expect(out[0].failureMode).toBe('premature-victory')
    expect(out[0].detector).toBe('completion.zero-delivery')
  })
})
