/**
 * agent.active-no-artifact 检测器单测（run21 契约里程碑族⑧，2026-10-18）：
 * detectAll 挂载级回归是首测——首版（4ab303d2）只落函数未挂调用清单，esbuild
 * tree-shake 把未被引用的导出整段摇掉，测试直连函数照绿而产线零生效；本批补
 * 挂载并锚死「经 detectAll 出警」，防同型复发。
 */
import { describe, expect, it } from 'vitest'
import { detectActiveNoArtifact, detectAll } from '../detectors'

const now = 1_790_000_000_000
const snap = (over: Partial<Parameters<typeof detectActiveNoArtifact>[0]> = {}) =>
  ({
    ts: 1,
    gateway: { ok: true },
    sessions: { ok: true, entries: 0, live: 0, dead: [] },
    profiles: { ok: true, tails: [{ profile: 'chen', workTsMs: now - 60_000 }] },
    kanban: { ok: false, rows: [] },
    runningCards: { ok: true, cards: [{ assignee: 'chen' }] },
    federation: { ok: false, nowMs: 1, machines: [] },
    ...over,
  }) as Parameters<typeof detectActiveNoArtifact>[0]

describe('detectActiveNoArtifact — 活跃零产物（run21 四复发同族）', () => {
  it('detectAll 挂载级回归：活跃档案×持有在途卡 → 经 detectAll 出警 warn', () => {
    const hit = detectAll(snap(), { nowMs: now }).find((a) => a.detector === 'agent.active-no-artifact')
    expect(hit).toBeTruthy()
    expect(hit?.subject).toBe('profile:chen')
    expect(hit?.severity).toBe('warn')
    expect(hit?.summary).toContain('chen')
  })
  it('assignee 兼容 profile 与 profile-agent 两种形态；30-60 分钟灰带升 high（首版 high 死分支回归锚）', () => {
    const out = detectActiveNoArtifact(snap({
      profiles: { ok: true, tails: [{ profile: 'hu', workTsMs: now - 2_700_000 }] },
      runningCards: { ok: true, cards: [{ assignee: 'hu-agent' }] },
    }), { nowMs: now })
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe('high')
  })
  it('活跃但零在途卡 / 持卡但日志静默超阈 / 任一面缺席 = fail-soft 静默', () => {
    expect(detectActiveNoArtifact(snap({ runningCards: { ok: true, cards: [] } }), { nowMs: now })).toEqual([])
    expect(detectActiveNoArtifact(snap({
      profiles: { ok: true, tails: [{ profile: 'chen', workTsMs: now - 7_200_000 }] },
    }), { nowMs: now })).toEqual([])
    expect(detectActiveNoArtifact(snap({ profiles: undefined }), { nowMs: now })).toEqual([])
  })
})
