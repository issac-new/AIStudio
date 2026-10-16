// session-starved.test.ts — session.starved 检测器守门（run20 复盘 D6 产品化）
// 守门面：①面缺席=合法空态 ②低水位空转不判（等得回来——区别于 empty-streak 的关键维度）
// ③高压空转=warn ④双倍连击=high ⑤水位与 tokens 双代理 ⑥detectAll 全量入口接线。
import { describe, it, expect } from 'vitest'
import type { ClusterSnapshot } from '../collectors'
import { detectAll, detectSessionStarvation } from '../detectors'

function snapWith(te?: ClusterSnapshot['sessionTelemetry']): ClusterSnapshot {
  return {
    ts: Date.now(),
    gateway: { ok: true },
    sessions: { ok: true, entries: 0, live: 0, dead: [] },
    profiles: { ok: true, tails: [] },
    kanban: { ok: true, rows: [] },
    runningCards: { ok: true, cards: [] },
    federation: { ok: true, machines: [] },
    sessionTelemetry: te,
  } as unknown as ClusterSnapshot
}

function entry(over: Record<string, unknown> = {}) {
  return {
    sessionKey: 'wei@matrix', tsMs: Date.now(), platform: 'matrix',
    model: 'glm-5.3', emptyStreak: 4, turns: 42, cumApiCalls: 60,
    watermarkPct: 78, contextLength: 78_000, ...over,
  }
}

describe('detectSessionStarvation（session.starved，run20 复盘 D6）', () => {
  it('面缺席=合法空态静默', () => {
    expect(detectSessionStarvation(snapWith(undefined))).toHaveLength(0)
    expect(detectSessionStarvation(snapWith({ ok: false, entries: [] }))).toHaveLength(0)
  })

  it('低水位空转不判（等得回来——卡住≠饥饿）', () => {
    const te = { ok: true, entries: [entry({ emptyStreak: 5, watermarkPct: 30, contextLength: 20_000 })] }
    expect(detectSessionStarvation(snapWith(te))).toHaveLength(0)
  })

  it('未达连击阈不判（空转 2 回合属波动）', () => {
    const te = { ok: true, entries: [entry({ emptyStreak: 2 })] }
    expect(detectSessionStarvation(snapWith(te))).toHaveLength(0)
  })

  it('高压空转=warn（run20 wei 形态：in 涨 out≤8token 连续 4 轮）', () => {
    const te = { ok: true, entries: [entry({ emptyStreak: 4, watermarkPct: 78 })] }
    const out = detectSessionStarvation(snapWith(te))
    expect(out).toHaveLength(1)
    expect(out[0].detector).toBe('session.starved')
    expect(out[0].severity).toBe('warn')
    expect(out[0].summary).toContain('换会话')
    expect(out[0].summary).toContain('禁陪等')
  })

  it('双倍连击+高压=high', () => {
    const te = { ok: true, entries: [entry({ emptyStreak: 8, watermarkPct: 90 })] }
    const out = detectSessionStarvation(snapWith(te))
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe('high')
  })

  it('watermark 缺席时 contextLength≥60K 作压力代理', () => {
    const te = { ok: true, entries: [entry({ watermarkPct: null, contextLength: 65_000 })] }
    expect(detectSessionStarvation(snapWith(te))).toHaveLength(1)
    const te2 = { ok: true, entries: [entry({ watermarkPct: null, contextLength: 30_000 })] }
    expect(detectSessionStarvation(snapWith(te2))).toHaveLength(0)
  })

  it('detectAll 全量入口接线（防漏接线空转）', () => {
    const te = { ok: true, entries: [entry({ emptyStreak: 4 })] }
    const out = detectAll(snapWith(te))
    expect(out.some((a) => a.detector === 'session.starved')).toBe(true)
  })
})
