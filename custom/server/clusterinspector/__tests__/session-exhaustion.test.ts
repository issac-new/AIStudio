/**
 * agent.session-exhaustion 检测器单测（run22 2026-10-21 两实录产品化）：
 * 首测即 detectAll 挂载级回归（active-no-artifact 首版 tree-shake 教训——
 * 只落函数未挂调用清单=产线零生效，本批锚死「经 detectAll 出警」防同型复发）。
 * 判据契约：应答行新鲜 + 真做行曾发生且停摆 ≥gap 阈 → warn；≥2× → high。
 * fail-soft：realWorkTsMs 缺席（新会话首回合/从未真做）不报——那是
 * active-no-artifact 与 task.agent-silent 的辖域。
 */
import { describe, expect, it } from 'vitest'
import { detectSessionExhaustion, detectAll } from '../detectors'

const now = 1_790_000_000_000
const snap = (over: Partial<Parameters<typeof detectSessionExhaustion>[0]> = {}) =>
  ({
    ts: 1,
    gateway: { ok: true },
    sessions: { ok: true, entries: 0, live: 0, dead: [] },
    profiles: { ok: true, tails: [{ profile: 'hu', workTsMs: now - 60_000, realWorkTsMs: now - 2_400_000 }] },
    kanban: { ok: false, rows: [] },
    runningCards: { ok: false, cards: [] },
    federation: { ok: false, nowMs: 1, machines: [] },
    ...over,
  }) as Parameters<typeof detectSessionExhaustion>[0]

describe('detectSessionExhaustion — 会话耗尽（应答无执行，run22 hu/qi 两实录）', () => {
  it('detectAll 挂载级回归：应答新鲜×真做停摆 40 分钟 → 经 detectAll 出警 warn', () => {
    const hit = detectAll(snap(), { nowMs: now }).find((a) => a.detector === 'agent.session-exhaustion')
    expect(hit).toBeTruthy()
    expect(hit?.subject).toBe('profile:hu')
    expect(hit?.severity).toBe('warn')
    expect(hit?.summary).toContain('换会话令')
  })
  it('落差 ≥2× 阈（60 分钟+）升 high（hu 实录 93 分钟形态）', () => {
    const out = detectSessionExhaustion(snap({
      profiles: { ok: true, tails: [{ profile: 'qi', workTsMs: now - 30_000, realWorkTsMs: now - 5_700_000 }] },
    }), { nowMs: now })
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe('high')
  })
  it('realWorkTsMs 缺席（新会话首回合）／落差未达阈／应答也停了（彻底静默归 silence 族）= 静默', () => {
    expect(detectSessionExhaustion(snap({
      profiles: { ok: true, tails: [{ profile: 'chen', workTsMs: now - 60_000 }] },
    }), { nowMs: now })).toEqual([])
    expect(detectSessionExhaustion(snap({
      profiles: { ok: true, tails: [{ profile: 'chen', workTsMs: now - 60_000, realWorkTsMs: now - 600_000 }] },
    }), { nowMs: now })).toEqual([])
    expect(detectSessionExhaustion(snap({
      profiles: { ok: true, tails: [{ profile: 'lin', workTsMs: now - 7_200_000, realWorkTsMs: now - 9_000_000 }] },
    }), { nowMs: now })).toEqual([])
    expect(detectSessionExhaustion(snap({ profiles: undefined }), { nowMs: now })).toEqual([])
  })
})
