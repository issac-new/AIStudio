// M9 安全告警中继单测（2026-10-16 安全轮，预警先行版）。
// 注入 getSecurityEvents + sendSecurityAlert，不碰矩阵通道；验证三层去重、
// 每轮封顶聚合、总开关与房间缺省。与巡检官既有测试同款 deps 注入法。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { ClusterInspector, type InspectorDeps } from '../inspector'

type SecEvent = { eventId: string; ts: number; domain: string; severity: string; type: string; summary: string; refs?: Record<string, string> }

function ev(over: Partial<SecEvent> = {}): SecEvent {
  return { eventId: 'e1', ts: 1_000_000, domain: 'security', severity: 'high', type: 'tool.denied', summary: 'x', ...over }
}

const base: InspectorDeps = { hermesHome: '/nonexistent', gatewayBase: 'http://127.0.0.1:1', emitGovEvent: () => {} }

describe('M9 安全告警中继（security/approval 域 high → Matrix）', () => {
  beforeEach(() => {
    process.env.CLUSTER_INSPECTOR_NUDGE_ROOM = '!room:x'
    delete process.env.CLUSTER_INSPECTOR_SECURITY_RELAY
  })
  afterEach(() => {
    delete process.env.CLUSTER_INSPECTOR_NUDGE_ROOM
    delete process.env.CLUSTER_INSPECTOR_SECURITY_RELAY
  })

  it('同键事件（type+profileId）只发一条；不同键各发', async () => {
    const sent: Array<{ body: string; profile?: string }> = []
    const events = [
      ev({ eventId: 'a', ts: 1_000_000, refs: { profileId: 'scout' } }),
      ev({ eventId: 'b', ts: 1_000_050, refs: { profileId: 'scout' } }),  // 同键
      ev({ eventId: 'c', ts: 1_000_060, refs: { profileId: 'orchestrator' } }),  // 异键
    ]
    const insp = new ClusterInspector({ ...base, now: () => 1_000_100, getSecurityEvents: () => events, sendSecurityAlert: async (body, profile) => { sent.push({ body, profile }); return 'sent' } })
    const out = await insp.runOnce()
    const relays = (out.actions ?? []).filter((a) => a.startsWith('security-relay:'))
    expect(relays).toHaveLength(2)
    expect(sent.map((s) => s.profile).sort()).toEqual(['orchestrator', 'scout'])
    expect(sent[0]!.body).toContain('预警先行版：只告警不拦截')
  })

  it('跨轮同键被 15 分钟冷却抑制；新键仍放行（同实例两轮）', async () => {
    const sent: string[] = []
    let now = 1_000_000
    // 可变闭包代替改 deps（deps 是私有成员，测试不碰）
    let events: SecEvent[] = [ev({ eventId: 'a', ts: now - 1000, refs: { profileId: 'scout' } })]
    const insp = new ClusterInspector({
      ...base, now: () => now,
      getSecurityEvents: () => events,
      sendSecurityAlert: async () => { sent.push('x'); return 'sent' },
    })
    await insp.runOnce()
    expect(sent).toHaveLength(1)
    // 同键 5 分钟后（同实例）：被冷却抑制
    now = 1_000_000 + 300_000
    events = [ev({ eventId: 'a2', ts: now - 1000, refs: { profileId: 'scout' } })]
    const out2 = await insp.runOnce()
    expect((out2.actions ?? []).filter((a) => a.startsWith('security-relay:'))).toHaveLength(0)
    expect(sent).toHaveLength(1)
    // 异键立即可发
    events = [ev({ eventId: 'b', ts: now - 1000, refs: { profileId: 'other' } })]
    const out3 = await insp.runOnce()
    expect((out3.actions ?? []).filter((a) => a.startsWith('security-relay:'))).toHaveLength(1)
    expect(sent).toHaveLength(2)
  })

  it('重启防重放：首轮水位线落到 now-5min，更早的历史事件不重发', async () => {
    const sent: string[] = []
    const now = 10_000_000
    const insp = new ClusterInspector({
      ...base, now: () => now,
      // 一条 2 小时前的历史 high 事件（重启前就有）
      getSecurityEvents: () => [ev({ eventId: 'old', ts: now - 7_200_000, refs: { profileId: 'scout' } })],
      sendSecurityAlert: async () => { sent.push('x'); return 'sent' },
    })
    const out = await insp.runOnce()
    expect((out.actions ?? []).filter((a) => a.startsWith('security-relay'))).toEqual([])
    expect(sent).toEqual([])
  })

  it('单轮超 2 条封顶：发 2 条 + 1 条聚合汇总', async () => {
    const sent: string[] = []
    const events = [1, 2, 3, 4, 5].map((i) => ev({ eventId: `e${i}`, ts: 1_000_000 + i, refs: { profileId: `p${i}` } }))
    const insp = new ClusterInspector({ ...base, now: () => 1_000_100, getSecurityEvents: () => events, sendSecurityAlert: async (body) => { sent.push(body); return 'sent' } })
    const out = await insp.runOnce()
    const relays = (out.actions ?? []).filter((a) => a.startsWith('security-relay'))
    expect(relays.filter((a) => a.startsWith('security-relay:'))).toHaveLength(2)
    expect(relays.filter((a) => a.startsWith('security-relay-aggregated:'))).toHaveLength(1)
    expect(sent[sent.length - 1]).toContain('汇总')
    expect(sent[sent.length - 1]).toContain('3')
  })

  it('无 profileId 的事件也发送（不带 mention）', async () => {
    const sent: Array<{ profile?: string }> = []
    const insp = new ClusterInspector({ ...base, now: () => 1_000_100, getSecurityEvents: () => [ev({ refs: {} })], sendSecurityAlert: async (_b, profile) => { sent.push({ profile }); return 'sent' } })
    await insp.runOnce()
    expect(sent).toHaveLength(1)
    expect(sent[0]!.profile).toBeUndefined()
  })

  it('未配 NUDGE_ROOM：静默跳过不抛', async () => {
    delete process.env.CLUSTER_INSPECTOR_NUDGE_ROOM
    const insp = new ClusterInspector({ ...base, now: () => 1_000_100, getSecurityEvents: () => [ev()], sendSecurityAlert: async () => 'sent' })
    const out = await insp.runOnce()
    expect((out.actions ?? []).filter((a) => a.startsWith('security-relay'))).toEqual([])
  })

  it('CLUSTER_INSPECTOR_SECURITY_RELAY=off：总开关关闭', async () => {
    process.env.CLUSTER_INSPECTOR_SECURITY_RELAY = 'off'
    const insp = new ClusterInspector({ ...base, now: () => 1_000_100, getSecurityEvents: () => [ev()], sendSecurityAlert: async () => 'sent' })
    const out = await insp.runOnce()
    expect((out.actions ?? []).filter((a) => a.startsWith('security-relay'))).toEqual([])
  })

  it('水位线：同一批事件重复轮询不重发', async () => {
    const sent: string[] = []
    const deps = { ...base, now: () => 1_000_100, getSecurityEvents: () => [ev({ eventId: 'a', refs: { profileId: 'scout' } })], sendSecurityAlert: async () => { sent.push('x'); return 'sent' } }
    const insp = new ClusterInspector(deps)
    await insp.runOnce()
    await insp.runOnce()
    expect(sent).toHaveLength(1)
  })

  it('getSecurityEvents 抛错：fail-soft 不炸巡检轮', async () => {
    const insp = new ClusterInspector({ ...base, now: () => 1_000_100, getSecurityEvents: () => { throw new Error('boom') } })
    const out = await insp.runOnce()
    expect(out.error).toBeUndefined()
  })
})
