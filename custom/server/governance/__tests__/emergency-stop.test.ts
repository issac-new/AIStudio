// AGT 吸收轮 E（2026-10-21）：全局紧急停止单测——目标筛选、复核活性、如实标红。
import { describe, expect, it } from 'vitest'
import { emergencyStopAll } from '../emergency-stop'
import type { FleetLiveEntry } from '../../services/hermes/fleet-snapshot'

function entry(id: string, profile: string, isWorking: boolean, queue = 0): FleetLiveEntry {
  return { id, profile, isWorking, isAborting: false, queueLength: queue, runStartedAt: null, source: '', lastPreview: '', approvals: [], clarifies: [], subagents: [] }
}

describe('emergencyStopAll（全局紧急停止 + 停后复核）', () => {
  it('只停在跑/排队会话；复核全停 → allStopped=true', async () => {
    const aborted: string[] = []
    let live = [entry('s1', 'p1', true), entry('s2', 'p2', false, 3), entry('s3', 'p3', false)]
    const report = await emergencyStopAll({ reason: '测试', recheckMs: 1 }, {
      liveEntries: () => live,
      abort: async (id) => { aborted.push(id); live = live.filter((e) => e.id !== id || !e.isWorking ? e : { ...e, isWorking: false }) ; return { ok: true } },
      delay: async () => { live = [entry('s3', 'p3', false)] },
      now: () => 1_000,
    })
    expect(report.targets).toBe(2) // s1 在跑 + s2 排队；s3 空闲不停
    expect(aborted.sort()).toEqual(['s1', 's2'])
    expect(report.allStopped).toBe(true)
    expect(report.stillWorking).toEqual([])
    expect(report.results.every((r) => r.ok)).toBe(true)
  })

  it('复核仍在跑 → stillWorking 如实标红，allStopped=false（不粉饰）', async () => {
    let live = [entry('s1', 'p1', true)]
    const report = await emergencyStopAll({ recheckMs: 1 }, {
      liveEntries: () => live,
      abort: async () => { live = [entry('s1', 'p1', true, 0)] ; return { ok: true } },
      delay: async () => { live = [entry('s1', 'p1', true)] },
      now: () => 1_000,
    })
    expect(report.allStopped).toBe(false)
    expect(report.stillWorking).toHaveLength(1)
    expect(report.stillWorking[0].sessionId).toBe('s1')
  })

  it('abort 失败如实入 results（不吞错）', async () => {
    const report = await emergencyStopAll({ recheckMs: 1 }, {
      liveEntries: () => [entry('s1', 'p1', true)],
      abort: async () => ({ ok: false, error: 'ChatRunSocket 未注册' }),
      delay: async () => {},
      now: () => 1_000,
    })
    expect(report.results[0].ok).toBe(false)
    expect(report.results[0].error).toContain('未注册')
  })

  it('无在跑会话 → 零目标空转（幂等，不发停止令）', async () => {
    let called = 0
    const report = await emergencyStopAll({ recheckMs: 1 }, {
      liveEntries: () => [entry('s9', 'p9', false)],
      abort: async () => { called += 1; return { ok: true } },
      delay: async () => {},
      now: () => 1_000,
    })
    expect(report.targets).toBe(0)
    expect(called).toBe(0)
    expect(report.allStopped).toBe(true)
  })
})
