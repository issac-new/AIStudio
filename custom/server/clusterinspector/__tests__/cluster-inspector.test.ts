// 集群巡检官守门：五检测器（run11 实录形态夹具）+ 冷却去重 + 巡检环重入保护。
import { describe, expect, it } from 'vitest'
import type { ClusterSnapshot } from '../collectors'
import { detectAll, detectGateway, detectSessionStall, detectSlotInflation, detectStorm } from '../detectors'
import { ClusterInspector } from '../inspector'

function snap(partial: Partial<ClusterSnapshot>): ClusterSnapshot {
  return {
    ts: 1,
    gateway: { ok: true },
    sessions: { ok: true, entries: 0, live: 0, dead: [] },
    profiles: { ok: true, tails: [] },
    kanban: { ok: false, rows: [] },
    ...partial,
  }
}

describe('detectors（run11 实录形态）', () => {
  it('D1：网关不可达=high；gateway_state 非 running=降级；platform needs_attention=warn', () => {
    const a = detectGateway(snap({ gateway: { ok: false, error: 'ECONNREFUSED' } }))
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ detector: 'gateway.unreachable', severity: 'high' })

    const b = detectGateway(snap({ gateway: { ok: true, state: { gateway_state: 'degraded' } } }))
    expect(b).toMatchObject([{ detector: 'gateway.degraded', severity: 'warn' }])

    const c = detectGateway(snap({ gateway: { ok: true, state: { gateway_state: 'running', platforms: { matrix: { needs_attention: true, state: 'retrying' } } } } }))
    expect(c).toMatchObject([{ detector: 'gateway.platform-attention', subject: 'platform:matrix', severity: 'warn' }])
  })

  it('D2：槽位膨胀 active=26 vs live=3 → warn；≥inflateHigh → high', () => {
    const gw = (n: number) => snap({ gateway: { ok: true, state: { active_agents: n } }, sessions: { ok: true, entries: 30, live: 3, dead: [] } })
    expect(detectSlotInflation(gw(8))).toHaveLength(0)                        // 差 5=容忍线内
    expect(detectSlotInflation(gw(9))[0]?.severity).toBe('warn')            // 差 6 超线
    expect(detectSlotInflation(gw(26))[0]).toMatchObject({ detector: 'gateway.slot-inflation', severity: 'high' })
    expect(detectSlotInflation(snap({ gateway: { ok: true, state: { active_agents: 2 } }, sessions: { ok: false, entries: 0, live: 0, dead: [] } }))).toHaveLength(0)
  })

  it('D3：kanban 诊断 error/critical → warn/high', () => {
    const rows = [
      { task_id: 't1', diagnostics: [{ severity: 'critical', title: '心跳陈旧 30min' }] },
      { task_id: 't2', diagnostics: [{ severity: 'warning', title: 'ok' }] },
    ]
    const out = detectAll(snap({ kanban: { ok: true, rows, } }))
    expect(out.filter((a) => a.detector === 'kanban.stale-worker')).toMatchObject([
      { subject: 't1', severity: 'high' },
    ])
  })

  it('D4：尾行错误态+静默>5min 判卡；正常尾/刚更新不判', () => {
    const now = 1_000_000
    const tails = [
      { profile: 'fanfan', tail: '2026-10-08 18:18:00 ERROR hindsight prefetch TimeoutError', mtimeMs: now - 400_000 },
      { profile: 'hu', tail: '2026-10-08 18:18:00 INFO ok', mtimeMs: now - 400_000 },
      { profile: 'lin', tail: '... Traceback ...', mtimeMs: now - 10_000 },
    ]
    const out = detectSessionStall(snap({ profiles: { ok: true, tails } }), { nowMs: now })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ detector: 'session.stalled', subject: 'profile:fanfan' })
  })

  it('D5：同检测器 ≥3 主体 → 追加风暴 high', () => {
    const anomalies = detectGateway(snap({
      gateway: {
        ok: true,
        state: { gateway_state: 'running', platforms: Object.fromEntries(['a', 'b', 'c'].map((n) => [n, { needs_attention: true }])) },
      },
    }))
    const storm = detectStorm(anomalies)
    expect(storm).toMatchObject([{ detector: 'anomaly.storm', subject: 'gateway.platform-attention', severity: 'high' }])
  })
})

describe('ClusterInspector（冷却去重/重入/fail-soft）', () => {
  function stalledSnap() {
    return snap({
      gateway: { ok: false, error: 'probe failed' },
      profiles: { ok: true, tails: [{ profile: 'x', tail: '... TimeoutError', mtimeMs: 1 }] },
    })
  }

  it('同 type+subject 冷却窗内只发一次；检测仍每轮全量', async () => {
    const events: Array<{ type: string }> = []
    const insp = new ClusterInspector({ emitGovEvent: (e) => events.push(e), hermesHome: '/nonexistent', now: () => 1_000_000 })
    const r1 = await insp.runOnce()
    expect(r1.anomalies.length).toBeGreaterThan(0)
    expect(r1.emitted).toBe(r1.anomalies.length)
    const r2 = await insp.runOnce()
    expect(r2.anomalies).toHaveLength(r1.anomalies.length)
    expect(r2.emitted).toBe(0)
    expect(r2.suppressedByCooldown).toBe(r2.anomalies.length)
    expect(events.map((e) => e.type).every((t) => t.startsWith('cluster.'))).toBe(true)
  })

  it('govbus 缺席 fail-soft（不抛错）', async () => {
    const insp = new ClusterInspector({ hermesHome: '/nonexistent', now: () => 1 })
    await expect(insp.runOnce()).resolves.toBeTruthy()
  })

  it('start/stop 幂等', () => {
    const insp = new ClusterInspector({ hermesHome: '/nonexistent' })
    insp.start(60_000)
    insp.start(60_000)
    insp.stop()
    insp.stop()
    expect(true).toBe(true)
  })
})
