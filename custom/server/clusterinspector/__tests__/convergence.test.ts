// 收敛性追踪测试（用户 2026-10-14 指令：同类/同一事件风险是否持续收敛=多轮有效性
// 指标；熵增→升级 high/熔断/降级）。三层：趋势分类纯函数 / 账本持久化与生命周期 /
// 巡检环集成（复发三次持平→升级+熔断+提醒催单停发+降级不喂新活）。
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { anomalyKey, classifyTrend, ConvergenceTracker } from '../convergence'
import { ClusterInspector } from '../inspector'

const MIN = 60_000
const T0 = 1_700_000_000_000
const OPTS = { escapeEpisodes: 3, resolveMs: 3_600_000 }

describe('classifyTrend（复发间隔走势分类）', () => {
  it('复发不足判定线=观察中', () => {
    expect(classifyTrend([T0], T0 + MIN, T0 + MIN, OPTS)).toBe('watching')
    expect(classifyTrend([T0, T0 + 10 * MIN], T0 + 11 * MIN, T0 + 11 * MIN, OPTS)).toBe('watching')
  })
  it('3 次复发间隔持平=熵增（diverging）', () => {
    const ep = [T0, T0 + 10 * MIN, T0 + 20 * MIN]
    expect(classifyTrend(ep, T0 + 21 * MIN, T0 + 21 * MIN, OPTS)).toBe('diverging')
  })
  it('间隔放宽 ≥1.5 倍=收敛中（converging）', () => {
    const ep = [T0, T0 + 10 * MIN, T0 + 30 * MIN] // 10min→20min
    expect(classifyTrend(ep, T0 + 31 * MIN, T0 + 31 * MIN, OPTS)).toBe('converging')
  })
  it('持久硬阈：≥8 次复发即使间隔持续放宽也判熵增', () => {
    const ep = [0, 10, 30, 70, 150, 310, 630, 1270].map((m) => T0 + m * MIN)
    expect(classifyTrend(ep, T0 + 1271 * MIN, T0 + 1271 * MIN, OPTS)).toBe('diverging')
  })
  it('消失超 resolveMs=已收敛（resolved）', () => {
    const ep = [T0, T0 + 10 * MIN, T0 + 20 * MIN]
    expect(classifyTrend(ep, T0 + 20 * MIN, T0 + 20 * MIN + 3_600_001, OPTS)).toBe('resolved')
  })
})

describe('ConvergenceTracker（记账/持久化/生命周期/降级面）', () => {
  function anomaly(detector: string, subject: string, detail?: Record<string, unknown>) {
    return { detector, subject, summary: 's', ...(detail ? { detail } : {}) }
  }

  it('在场+复发记账；risk.diverging 元事件自身不计账', () => {
    const tr = new ConvergenceTracker(mkdtempSync(join(tmpdir(), 'ci-conv-')))
    const key = anomalyKey('session.stalled', 'profile:x')
    tr.recordPresence(1000, [anomaly('session.stalled', 'profile:x')])
    tr.recordEpisode(1000, key)
    expect(tr.itemOf(key, 1000)?.episodes).toBe(1)
    tr.recordPresence(1000, [anomaly('risk.diverging', 'profile:x')])
    expect(tr.items(1000)).toHaveLength(1)
  })

  it('持久化：新实例续账（重启不失熵账）；坏文件=从零起算不炸', () => {
    const home = mkdtempSync(join(tmpdir(), 'ci-conv-'))
    const key = anomalyKey('gateway.unreachable', 'gateway')
    const tr1 = new ConvergenceTracker(home)
    tr1.recordPresence(1000, [anomaly('gateway.unreachable', 'gateway')])
    tr1.recordEpisode(1000, key)
    tr1.trip(1000, key)
    const tr2 = new ConvergenceTracker(home)
    const it = tr2.itemOf(key, 1000)
    expect(it?.episodes).toBe(1)
    expect(it?.tripped).toBe(true)
    // 同刻度重复记账幂等
    tr2.recordEpisode(1000, key)
    expect(tr2.itemOf(key, 1000)?.episodes).toBe(1)
  })

  it('生命周期重置：解决后重现身=新周期（复发清零/熔断重武装）', () => {
    const tr = new ConvergenceTracker(mkdtempSync(join(tmpdir(), 'ci-conv-')))
    const key = anomalyKey('session.stalled', 'profile:x')
    tr.recordPresence(0, [anomaly('session.stalled', 'profile:x')])
    tr.recordEpisode(0, key)
    tr.recordEpisode(10, key)
    tr.trip(10, key)
    tr.recordPresence(10, [anomaly('session.stalled', 'profile:x')])
    // 消失 2h 后重现身：旧账不带入新周期
    const back = 2 * 3_600_000 + 100
    tr.recordPresence(back, [anomaly('session.stalled', 'profile:x')])
    const it = tr.itemOf(key, back)
    expect(it?.episodes).toBe(0)
    expect(it?.tripped).toBe(false)
    expect(it?.trend).toBe('watching')
  })

  it('降级面：diverging 的 profile 主体与 tripped 卡 assignee 都入降级集', () => {
    const tr = new ConvergenceTracker(mkdtempSync(join(tmpdir(), 'ci-conv-')))
    const k1 = anomalyKey('session.stalled', 'profile:x')
    tr.recordPresence(0, [anomaly('session.stalled', 'profile:x')])
    for (const t of [0, 10 * MIN, 20 * MIN]) {
      tr.recordPresence(t, [anomaly('session.stalled', 'profile:x')])
      tr.recordEpisode(t, k1)
    }
    const k2 = anomalyKey('delivery.anchor-missing', 'card:c1')
    tr.recordPresence(0, [anomaly('delivery.anchor-missing', 'card:c1', { assignee: 'chen' })])
    tr.recordEpisode(0, k2)
    tr.trip(0, k2)
    const items = tr.items(20 * MIN)
    expect(tr.degradedSet(items)).toEqual(new Set(['x', 'chen']))
    expect(tr.report(20 * MIN).summary).toMatchObject({ diverging: 1, tripped: 1 })
  })

  it('清账：消失超 24h 的条目删除', () => {
    const tr = new ConvergenceTracker(mkdtempSync(join(tmpdir(), 'ci-conv-')))
    tr.recordPresence(0, [anomaly('session.stalled', 'profile:a'), anomaly('machine.silent', 'machine:m1')])
    tr.recordPresence(25 * 3_600_000, [anomaly('machine.silent', 'machine:m1')])
    expect(tr.items(25 * 3_600_000).map((i) => i.key)).toEqual([anomalyKey('machine.silent', 'machine:m1')])
  })
})

describe('巡检环集成：熵增三联动（升级/熔断/降级）', () => {
  /** fanfan 型停摆档案夹具（日志尾错误态+mtime 陈旧 20min——同时过 stalled 5min
   *  与 idle.with-work 15min 两个静默阈） */
  function mkHome(profile: string): string {
    const home = mkdtempSync(join(tmpdir(), 'ci-convhome-'))
    const logDir = join(home, 'profiles', profile, 'logs')
    mkdirSync(logDir, { recursive: true })
    const log = join(logDir, 'agent.log')
    writeFileSync(log, '2026-10-14 10:00:00 ERROR hindsight prefetch TimeoutError\n')
    utimesSync(log, new Date(Date.now() - 1_200_000), new Date(Date.now() - 1_200_000))
    return home
  }

  it('复发三次持平：第 3 次升 high + 熔断事件一次性 + 提醒催单停发 + 负责人降级', async () => {
    const home = mkHome('fanfan')
    const events: Array<{ type: string; severity: string; payload?: Record<string, unknown> }> = []
    const nudged: string[] = []
    let now = T0
    const insp = new ClusterInspector({
      emitGovEvent: (e) => { events.push({ type: e.type, severity: e.severity, payload: e.payload }) },
      hermesHome: home, gatewayBase: 'http://127.0.0.1:1',
      nudge: async (pf) => { nudged.push(pf); return 'nudged' },
      now: () => now,
    })
    process.env.CLUSTER_INSPECTOR_NUDGE = 'on'
    process.env.CLUSTER_INSPECTOR_NUDGE_ROOM = '!room:x'
    try {
      const r1 = await insp.runOnce() // 复发 1：warn + 提醒催单
      expect(r1.anomalies.some((a) => a.detector === 'session.stalled')).toBe(true)
      now += 16 * MIN
      await insp.runOnce() // 复发 2：warn + 提醒催单
      now += 16 * MIN
      const r3 = await insp.runOnce() // 复发 3：间隔持平 → 熵增
      // ①升级：复发异常本身升 high，事件带收敛账
      const st3 = events.filter((e) => e.type === 'cluster.session.stalled')
      expect(st3).toHaveLength(3)
      expect(st3[2].severity).toBe('high')
      expect(st3[2].payload?.convergence).toMatchObject({ episodes: 3 })
      // ②熔断：risk.diverging 事件一次（本轮出现，后续不再重复）
      expect(r3.anomalies.some((a) => a.detector === 'risk.diverging' && a.subject === 'profile:fanfan')).toBe(true)
      expect(r3.actions).toContain('nudge-breaker:fanfan')
      now += 16 * MIN
      const r4 = await insp.runOnce() // 仍熵增：无第二次熔断事件，提醒催单继续停发
      expect(events.filter((e) => e.type === 'cluster.risk.diverging' && e.payload?.origin === 'session.stalled')).toHaveLength(1)
      expect(r4.actions).toContain('nudge-breaker:fanfan')
      // 提醒催单只发生在熵增判定前（回灌轰炸防线）
      expect(nudged).toEqual(['fanfan', 'fanfan'])
      // ③降级：负责人进降级档案；收敛面报表可查
      expect(insp.convergenceFace?.degradedProfiles).toContain('fanfan')
      expect(insp.convergenceFace?.summary.tripped ?? 0).toBeGreaterThanOrEqual(1)
      expect(insp.convergenceFace?.summary.diverging ?? 0).toBeGreaterThanOrEqual(1)
    } finally {
      delete process.env.CLUSTER_INSPECTOR_NUDGE
      delete process.env.CLUSTER_INSPECTOR_NUDGE_ROOM
    }
  })

  it('降级：负责人有熵增风险后 idle.with-work 领卡提醒催单抑制（不喂新活）', async () => {
    const home = mkHome('x')
    const nudged: string[] = []
    let now = T0
    const insp = new ClusterInspector({
      emitGovEvent: () => {},
      hermesHome: home, gatewayBase: 'http://127.0.0.1:1',
      getRunningCards: async () => [{ task_id: 'c9', status: 'ready', title: 'T' }], // 无主 ready 卡（可领未领形态）
      nudge: async (pf) => { nudged.push(pf); return 'nudged' },
      now: () => now,
    })
    process.env.CLUSTER_INSPECTOR_NUDGE = 'on'
    process.env.CLUSTER_INSPECTOR_NUDGE_ROOM = '!room:x'
    try {
      await insp.runOnce() // 复发 1：stalled + idle.with-work 各催一次
      expect(nudged).toEqual(['x', 'x'])
      now += 16 * MIN
      await insp.runOnce() // 复发 2
      now += 16 * MIN
      const r3 = await insp.runOnce() // 复发 3：x 熵增 → 熔断 + 降级
      expect(r3.actions).toContain('nudge-breaker:x')
      expect(r3.actions).toContain('nudge-degrade:x')
      expect(nudged.filter((p) => p === 'x')).toHaveLength(4) // 仅前两轮
    } finally {
      delete process.env.CLUSTER_INSPECTOR_NUDGE
      delete process.env.CLUSTER_INSPECTOR_NUDGE_ROOM
    }
  })

  it('CONVERGENCE=off 全通道旁路：反复复发不升级不熔断，提醒催单照常', async () => {
    // off 旁路：反复复发既不升级也不熔断，提醒催单照常
    const home = mkHome('lin')
    const events: Array<{ type: string; severity: string }> = []
    const nudged: string[] = []
    let now = T0
    process.env.CLUSTER_INSPECTOR_CONVERGENCE = 'off' // 须在构造前生效（enabled 在构造时求值）
    const insp = new ClusterInspector({
      emitGovEvent: (e) => { events.push({ type: e.type, severity: e.severity }) },
      hermesHome: home, gatewayBase: 'http://127.0.0.1:1',
      nudge: async (pf) => { nudged.push(pf); return 'nudged' },
      now: () => now,
    })
    process.env.CLUSTER_INSPECTOR_NUDGE = 'on'
    process.env.CLUSTER_INSPECTOR_NUDGE_ROOM = '!room:x'
    try {
      for (let i = 0; i < 4; i++) {
        now += i === 0 ? 0 : 16 * MIN
        await insp.runOnce()
      }
      expect(events.filter((e) => e.type === 'cluster.risk.diverging')).toHaveLength(0)
      expect(events.filter((e) => e.type === 'cluster.session.stalled').every((e) => e.severity === 'warn')).toBe(true)
      expect(nudged).toHaveLength(4)
      expect(insp.convergenceFace).toBeNull()
    } finally {
      delete process.env.CLUSTER_INSPECTOR_NUDGE
      delete process.env.CLUSTER_INSPECTOR_NUDGE_ROOM
      delete process.env.CLUSTER_INSPECTOR_CONVERGENCE
    }
  })
})
