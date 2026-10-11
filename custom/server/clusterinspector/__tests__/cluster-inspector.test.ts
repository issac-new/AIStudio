// 集群巡检官测试：六检测器（run11 实录形态夹具）+ 冷却去重 + 巡检环重入保护。
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
    runningCards: { ok: false, cards: [] },
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
      { profile: 'fanfan', tail: '2026-10-08 18:18:00 ERROR hindsight prefetch TimeoutError', mtimeMs: now - 400_000, workTsMs: now - 400_000 },
      { profile: 'hu', tail: '2026-10-08 18:18:00 INFO ok', mtimeMs: now - 400_000, workTsMs: now - 400_000 },
      { profile: 'lin', tail: '... Traceback ...', mtimeMs: now - 10_000, workTsMs: now - 10_000 },
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
      profiles: { ok: true, tails: [{ profile: 'x', tail: '... TimeoutError', mtimeMs: 1, workTsMs: 1 }] },
    })
  }

  it('同 type+subject 冷却窗内只发一次；检测仍每轮全量', async () => {
    const events: Array<{ type: string }> = []
    // gatewayBase 指不可达端口：单测须与宿主真实网关（如 SIM 8801 在跑）隔离，防环境泄漏翻转断言
    const insp = new ClusterInspector({ emitGovEvent: (e) => events.push(e), hermesHome: '/nonexistent', gatewayBase: 'http://127.0.0.1:1', now: () => 1_000_000 })
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
    const insp = new ClusterInspector({ hermesHome: '/nonexistent', gatewayBase: 'http://127.0.0.1:1', now: () => 1 })
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

describe('二期：容量泵 D6 + safe-act', () => {
  it('D6：depth/cap ≥75% warn、≥90% high；<75% 无事件', () => {
    const mk = (depth: number) => snap({ gateway: { ok: true, capacity: { ts: Date.now() / 1000, depth, anchors: depth, cap: 64 } } })
    const only = (n: number) => detectAll(mk(n)).filter((a) => a.detector === 'gateway.capacity-pump')
    expect(only(50)[0]?.severity).toBe('warn')      // 78%
    expect(only(60)[0]).toMatchObject({ severity: 'high' })  // 94%
    expect(only(47)).toHaveLength(0)                // 73% 线内
    expect(only(10)).toHaveLength(0)
  })

  it('safe-act：SAFE_ACT=on 僵尸卡触发 reclaim；off 不动', async () => {
    const reclaimed: string[] = []
    const mkInsp = () => new ClusterInspector({
      emitGovEvent: () => {}, hermesHome: '/nonexistent', gatewayBase: 'http://127.0.0.1:1',
      getKanbanDiagnostics: async () => [{ task_id: 't9', diagnostics: [{ severity: 'critical', title: '心跳陈旧' }] }],
      reclaimTask: async (id) => { reclaimed.push(id); return 'ok' },
      now: () => 1_000_000,
    })
    process.env.CLUSTER_INSPECTOR_SAFE_ACT = 'on'
    const r1 = await mkInsp().runOnce()
    delete process.env.CLUSTER_INSPECTOR_SAFE_ACT
    expect(r1.actions).toEqual(['t9:reclaimed'])
    expect(reclaimed).toEqual(['t9'])
    const r2 = await mkInsp().runOnce()
    expect(r2.actions ?? []).toEqual([])  // off：不动手（anomaly 仍报）
  })
})

describe('二期②③：matrix 提醒 + destructive 审批联动', () => {
  // D1 high（网关不可达）+ D4 stalled（fanfan 尾错误态且静默）双异常夹具
  function deadGatewaySnap() {
    return snap({
      gateway: { ok: false, error: 'probe failed' },
      profiles: { ok: true, tails: [{ profile: 'fanfan', tail: '... TimeoutError', mtimeMs: 1, workTsMs: 1 }] },
    })
  }
  it('② NUDGE=on 时 session.stalled 触发提醒（mentions 经凭据链由注入桩代验）', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, utimesSync } = require('node:fs')
    const { join } = require('node:path')
    const { tmpdir } = require('node:os')
    const home = mkdtempSync(join(tmpdir(), 'ci-home-'))
    const logDir = join(home, 'profiles', 'fanfan', 'logs')
    mkdirSync(logDir, { recursive: true })
    const log = join(logDir, 'agent.log')
    writeFileSync(log, '2026-10-08 18:18:00 ERROR hindsight prefetch TimeoutError\n')
    utimesSync(log, new Date(Date.now() - 400_000), new Date(Date.now() - 400_000))
    const nudged: Array<[string, string]> = []
    const insp = new ClusterInspector({
      emitGovEvent: () => {}, hermesHome: home, gatewayBase: 'http://127.0.0.1:1',
      nudge: async (pf, sum) => { nudged.push([pf, sum]); return 'nudged' },
      now: () => 1,
    })
    process.env.CLUSTER_INSPECTOR_NUDGE = 'on'
    process.env.CLUSTER_INSPECTOR_NUDGE_ROOM = '!room:x'
    try {
      await insp.runOnce()
      expect(nudged).toEqual([['fanfan', expect.stringContaining('卡死')]])  // 注入桩收 a.summary；提醒话术在缺省发送体内
    } finally { delete process.env.CLUSTER_INSPECTOR_NUDGE; delete process.env.CLUSTER_INSPECTOR_NUDGE_ROOM }
  })

  it('③ destructive：high 网关异常→入审批队列；approve→重启一次；reject→不动', async () => {
    const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } = require('node:fs')
    const { join } = require('node:path')
    const { tmpdir } = require('node:os')
    const dir = mkdtempSync(join(tmpdir(), 'ci-appr-'))
    const restarts: string[] = []
    const mkInsp = () => new ClusterInspector({
      emitGovEvent: () => {}, hermesHome: '/nonexistent', gatewayBase: 'http://127.0.0.1:1',
      approvalsDir: dir, restartGateway: async (pf) => { restarts.push(pf); return { running: true, profile: pf } },
      now: () => 1,
    })
    process.env.CLUSTER_INSPECTOR_DESTRUCTIVE = 'approval'
    try {
      const r1 = await mkInsp().runOnce()
      expect(r1.actions?.some((a) => a.startsWith('approval-requested:'))).toBe(true)
      const q = readFileSync(join(dir, 'mx-requests.jsonl'), 'utf-8')
      const eid = (JSON.parse(q.trim().split('\n')[0]) as { eid: string }).eid
      // 裁决 approve → 下一轮重启
      mkdirSync(join(dir, 'responses'), { recursive: true })
      writeFileSync(join(dir, 'responses', `${eid}.json`), JSON.stringify({ decision: 'approve' }))
      const r2 = await mkInsp().runOnce()
      expect(r2.actions).toContain('gateway-restarted:default')
      expect(restarts).toEqual(['default'])
      // 已处理：第三轮不再动作
      const r3 = await mkInsp().runOnce()
      expect(r3.actions?.some((a) => a.startsWith('gateway-restarted'))).toBeFalsy()
    } finally { delete process.env.CLUSTER_INSPECTOR_DESTRUCTIVE }
  })
})

describe('D7 在办任务·档案静默交叉（run14 三次停摆形态）', () => {
  const now = 1_000_000_000_000
  const mk = (mtime: number) => snap({
    ts: now,
    profiles: { ok: true, tails: [{ profile: 'chen-csw-pay-core', tail: 'INFO agent ok', mtimeMs: mtime, workTsMs: mtime }] },
    runningCards: { ok: true, cards: [{ id: 't_fix1', assignee: 'chen-csw-pay-core' }, { id: 't_fix2', assignee: 'chen-csw-pay-core' }] },
  })
  it('在办卡+档案静默超阈 → 报 task.agent-silent（不要求日志尾错误态）', () => {
    const a = detectAll(mk(now - 1200_000), { nowMs: now })
    const hit = a.find((x) => x.detector === 'task.agent-silent')
    expect(hit).toBeTruthy()
    expect(hit!.subject).toBe('profile:chen-csw-pay-core')
    expect(hit!.summary).toContain('2 张在办卡')
  })
  it('档案活跃（刚写日志）→ 不报；无在办卡的静默档案 → 不报（真空闲不误报）', () => {
    expect(detectAll(mk(now - 60_000), { nowMs: now }).find((x) => x.detector === 'task.agent-silent')).toBeUndefined()
    const idle = snap({ ts: now, profiles: { ok: true, tails: [{ profile: 'ops', tail: 'x', mtimeMs: now - 9999_000, workTsMs: 0 }] }, runningCards: { ok: true, cards: [] } })
    expect(detectAll(idle, { nowMs: now }).find((x) => x.detector === 'task.agent-silent')).toBeUndefined()
  })
  it('假活跃防误判（run14 实锤形态）：mtime 被 reaction 噪音刷新但工作行已死 → 按 workTsMs 判停报', () => {
    const fake = snap({
      ts: now,
      profiles: { ok: true, tails: [{ profile: 'chen-csw-pay-core', tail: 'Matrix: reaction ✅', mtimeMs: now - 60_000, workTsMs: now - 1200_000 }] },
      runningCards: { ok: true, cards: [{ id: 't_fix1', assignee: 'chen-csw-pay-core' }] },
    })
    const hit = detectAll(fake, { nowMs: now }).find((x) => x.detector === 'task.agent-silent')
    expect(hit).toBeTruthy() // mtime 60s 前（新鲜）但工作行 20min 前 → 仍报
    const alive = snap({
      ts: now,
      profiles: { ok: true, tails: [{ profile: 'chen-csw-pay-core', tail: 'API call #5', mtimeMs: now - 60_000, workTsMs: now - 60_000 }] },
      runningCards: { ok: true, cards: [{ id: 't_fix1', assignee: 'chen-csw-pay-core' }] },
    })
    expect(detectAll(alive, { nowMs: now }).find((x) => x.detector === 'task.agent-silent')).toBeUndefined()
  })
  it('runningCards 面未接线 → 零误报', () => {
    const off = snap({ ts: now, profiles: { ok: true, tails: [{ profile: 'a', tail: 'x', mtimeMs: 0, workTsMs: 0 }] }, runningCards: { ok: false, cards: [] } })
    expect(detectAll(off, { nowMs: now }).find((x) => x.detector === 'task.agent-silent')).toBeUndefined()
  })
})
