// overlay/custom/client/loop/runcenter/__tests__/intervention.test.ts
// 介入层纯函数单测（task-7 TDD 先行）：
// - latestEvents：peek 行内展开的最新 N 条事件投影
// - parseApprovalInterrupt：审批 interrupt payload 结构化（socket 与事件日志双词汇）
// - isAutoResume / latestResumeIsAuto：A2 超时自动通过识别
// - inspectNode：节点检查器数据组织（关联事件/最近 update 键值/错误事实）
// - formatDurationMs：时长标签（无 i18n 依赖）
// - inbox 归档 kv：loadArchivedMap / markArchived / unmarkArchived
import { describe, it, expect } from 'vitest'
import {
  latestEvents,
  parseApprovalInterrupt,
  isAutoResume,
  latestResumeIsAuto,
  inspectNode,
  formatDurationMs,
} from '../adapters/intervention'
import {
  INBOX_ARCHIVED_KEY,
  loadArchivedMap,
  markArchived,
  unmarkArchived,
  type KvStorage,
} from '../adapters/inbox'
import type { ReplayEventLike } from '../adapters/run-graph'

/** socket 词汇事件构造器（store 事件缓冲形状） */
const ev = (over: Partial<ReplayEventLike> & { type: string; ts: string | number }): ReplayEventLike => ({
  graphId: 'loop-loop1',
  threadId: 'run-1',
  ...over,
})

/** 事件日志词汇事件构造器（GET /replay 返回形状，kind + payload） */
const log = (over: Partial<ReplayEventLike> & { kind: string; ts: number }): ReplayEventLike => ({
  ...over,
})

/** 审批 interrupt value（phase-nodes.ts 真实形状裁剪） */
const approvalValue = {
  kind: 'approval',
  contractId: 'c1',
  loopId: 'loop1',
  prompt: 'Approval required for contract c1 (fix login bug) in loop loop1: 修复登录',
  contractSummary: {
    id: 'c1', source: 'issue', ref: 'ISSUE-7', summary: 'fix login bug',
    artifactType: 'patch', attempts: 1,
  },
  policy: {
    approvers: ['alice', 'bob'],
    policy: 'all',
    onReject: { goto: 'handoff' },
    timeout: { ms: 72 * 3600_000, onTimeout: 'escalate' },
  },
}

// ---------------------------------------------------------------------------
// latestEvents — peek 投影
// ---------------------------------------------------------------------------

describe('latestEvents — 最新 N 条事件摘要投影', () => {
  it('取最新 3 条且保持时间序（旧→新）', () => {
    const events = [
      ev({ type: 'graph.started', ts: '2026-09-10T00:00:00Z' }),
      ev({ type: 'graph.node-start', nodeId: 'discovery', step: 1, ts: '2026-09-10T00:01:00Z' }),
      ev({ type: 'graph.node-complete', nodeId: 'discovery', step: 1, ts: '2026-09-10T00:02:00Z' }),
      ev({ type: 'graph.node-start', nodeId: 'handoff', step: 2, ts: '2026-09-10T00:03:00Z' }),
    ]
    const lines = latestEvents(events, 3)
    expect(lines.map(l => l.type)).toEqual([
      'graph.node-start', 'graph.node-complete', 'graph.node-start',
    ])
    expect(lines.map(l => l.nodeId)).toEqual(['discovery', 'discovery', 'handoff'])
    expect(lines[0].step).toBe(1)
  })

  it('n 大于事件数时全量返回；空日志返回空数组', () => {
    expect(latestEvents([ev({ type: 'graph.started', ts: 1 })], 3)).toHaveLength(1)
    expect(latestEvents([], 3)).toEqual([])
  })

  it('投影行携带 error 与 autoApproved 标记', () => {
    const events = [
      ev({ type: 'graph.node-error', nodeId: 'gate', error: 'gate reject: coverage 41%<80%', ts: 10 }),
      ev({
        type: 'graph.resume', interruptId: 'approval:c1@1', ts: 11,
        resumeValue: { auto: true, decision: 'approved', reason: 'timeout', autoApproved: true },
      }),
    ]
    const lines = latestEvents(events, 3)
    expect(lines[0].error).toContain('coverage')
    expect(lines[0].autoApproved).toBe(false)
    expect(lines[1].autoApproved).toBe(true)
  })

  it('事件日志词汇（kind 载体）同样投影，type 取 kind 原值', () => {
    const lines = latestEvents([log({ kind: 'node.completed', nodeId: 'discovery', ts: 1700000000000 })], 3)
    expect(lines).toHaveLength(1)
    expect(lines[0].type).toBe('node.completed')
    expect(lines[0].nodeId).toBe('discovery')
  })
})

// ---------------------------------------------------------------------------
// parseApprovalInterrupt — 审批 interrupt payload 结构化
// ---------------------------------------------------------------------------

describe('parseApprovalInterrupt — 审批 interrupt payload', () => {
  it('socket 词汇：value 在事件顶层；提取 prompt/契约摘要/policy/approvers/超时', () => {
    const events = [
      ev({ type: 'graph.started', ts: 1 }),
      ev({ type: 'graph.interrupt', nodeId: 'validation', interruptId: 'approval:c1@1', value: approvalValue, ts: 100 }),
    ]
    const view = parseApprovalInterrupt(events)
    expect(view).not.toBeNull()
    expect(view!.interruptId).toBe('approval:c1@1')
    expect(view!.prompt).toContain('contract c1')
    expect(view!.contractId).toBe('c1')
    expect(view!.contractSummary).toMatchObject({ id: 'c1', summary: 'fix login bug', attempts: 1 })
    expect(view!.policy).toBe('all')
    expect(view!.approversLabel).toBe('alice, bob')
    expect(view!.onReject).toBe('handoff')
    expect(view!.timeout).toEqual({ ms: 72 * 3600_000, onTimeout: 'escalate' })
    expect(view!.raisedAt).toBe(100)
  })

  it('事件日志词汇：value 在 payload.value；非数组 approvers（channel 来源）渲染来源标签', () => {
    const value = {
      ...approvalValue,
      policy: { ...approvalValue.policy, approvers: { from: 'channel', name: 'reviewers' } },
    }
    const events = [
      log({ kind: 'interrupt.raised', nodeId: 'validation', interruptId: 'approval:c1@1', payload: { interruptId: 'approval:c1@1', value }, ts: 200 }),
    ]
    const view = parseApprovalInterrupt(events)
    expect(view!.prompt).toContain('contract c1')
    expect(view!.approversLabel).toBe('from:channel:reviewers')
    expect(view!.raisedAt).toBe(200)
  })

  it('最后一个未决 interrupt 胜出：resume 关闭后回落 null；新 interrupt 覆盖旧值', () => {
    const interrupted = (id: string, ts: number) =>
      ev({ type: 'graph.interrupt', nodeId: 'validation', interruptId: id, value: approvalValue, ts })
    const resumed = (id: string, ts: number) =>
      ev({ type: 'graph.resume', interruptId: id, ts })

    // 全部关闭 → null
    expect(parseApprovalInterrupt([interrupted('a', 1), resumed('a', 2)])).toBeNull()
    // 终态同样关闭
    expect(parseApprovalInterrupt([interrupted('a', 1), ev({ type: 'graph.completed', ts: 2 })])).toBeNull()
    // 后开 interrupt 覆盖
    const view = parseApprovalInterrupt([interrupted('a', 1), resumed('a', 2), interrupted('b', 3)])
    expect(view!.interruptId).toBe('b')
  })

  it('value 缺失/畸形不炸：返回骨架视图（prompt 空、policy 未知）', () => {
    const view = parseApprovalInterrupt([
      ev({ type: 'graph.interrupt', nodeId: 'validation', interruptId: 'x', ts: 1 }),
    ])
    expect(view).not.toBeNull()
    expect(view!.interruptId).toBe('x')
    expect(view!.prompt).toBe('')
    expect(view!.policy).toBe('')
    expect(view!.approversLabel).toBe('')
    expect(view!.timeout).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// isAutoResume / latestResumeIsAuto — A2 超时自动通过识别
// ---------------------------------------------------------------------------

describe('isAutoResume — 超时自动通过 resume 识别', () => {
  it('socket 词汇 resumeValue.auto / resumeValue.autoApproved 命中', () => {
    expect(isAutoResume(ev({
      type: 'graph.resume', interruptId: 'a', ts: 1,
      resumeValue: { auto: true, decision: 'approved', reason: 'timeout', autoApproved: true },
    }))).toBe(true)
    expect(isAutoResume(ev({ type: 'graph.resume', interruptId: 'a', ts: 1, resumeValue: { auto: true } }))).toBe(true)
    // 手动审批不带 auto
    expect(isAutoResume(ev({ type: 'graph.resume', interruptId: 'a', ts: 1, resumeValue: { decision: 'approved' } }))).toBe(false)
    // value 缺失
    expect(isAutoResume(ev({ type: 'graph.resume', interruptId: 'a', ts: 1 }))).toBe(false)
  })

  it('事件日志词汇 payload.autoApproved / payload.value.auto 命中；非 resume 事件恒 false', () => {
    expect(isAutoResume(log({ kind: 'interrupt.resumed', interruptId: 'a', payload: { autoApproved: true }, ts: 1 }))).toBe(true)
    expect(isAutoResume(log({ kind: 'interrupt.resumed', interruptId: 'a', payload: { value: { auto: true } }, ts: 1 }))).toBe(true)
    expect(isAutoResume(log({ kind: 'interrupt.resumed', interruptId: 'a', payload: {}, ts: 1 }))).toBe(false)
    expect(isAutoResume(ev({ type: 'graph.interrupt', interruptId: 'a', ts: 1 }))).toBe(false)
  })

  it('latestResumeIsAuto：最后一条 resume 决定标记；无 resume → false', () => {
    const r = (auto: boolean, ts: number) => ev({
      type: 'graph.resume', interruptId: 'a', ts,
      resumeValue: auto ? { auto: true, autoApproved: true } : { decision: 'approved' },
    })
    expect(latestResumeIsAuto([r(true, 1), r(false, 2)])).toBe(false)
    expect(latestResumeIsAuto([r(false, 1), r(true, 2)])).toBe(true)
    expect(latestResumeIsAuto([ev({ type: 'graph.interrupt', ts: 1 })])).toBe(false)
    expect(latestResumeIsAuto([])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// inspectNode — 节点检查器数据组织
// ---------------------------------------------------------------------------

describe('inspectNode — 检查器数据组织', () => {
  it('关联事件 = 该节点全部事件 + resume 按 interruptId 归位（resume 事件不带 nodeId）', () => {
    const events: ReplayEventLike[] = [
      ev({ type: 'graph.started', ts: 1 }),
      ev({ type: 'graph.node-start', nodeId: 'validation', step: 1, ts: 2 }),
      ev({ type: 'graph.interrupt', nodeId: 'validation', interruptId: 'approval:c1@1', value: approvalValue, ts: 3 }),
      ev({ type: 'graph.node-start', nodeId: 'handoff', step: 1, ts: 4 }), // 他节点
      ev({ type: 'graph.resume', interruptId: 'approval:c1@1', resumeValue: { decision: 'approved' }, ts: 5 }),
      ev({ type: 'graph.node-complete', nodeId: 'validation', step: 2, ts: 6 }),
    ]
    const insp = inspectNode(events, 'validation')
    expect(insp.nodeId).toBe('validation')
    expect(insp.events.map(e => e.ts)).toEqual([2, 3, 5, 6])
    // resume 无自身 nodeId，按 interruptId → validation 归位（已在上断言）
  })

  it('lastUpdate：socket 词汇取 result.update 的真实键值（最近一次完成胜出）', () => {
    const events: ReplayEventLike[] = [
      ev({
        type: 'graph.node-complete', nodeId: 'discovery', ts: 1,
        result: { update: { contracts: [{ id: 'c1' }], stage: 'discovery' }, goto: ['handoff'] },
      }),
      ev({
        type: 'graph.node-complete', nodeId: 'discovery', ts: 9,
        result: { update: { stage: 'handoff' }, goto: [] },
      }),
    ]
    const insp = inspectNode(events, 'discovery')
    expect(insp.lastUpdate).not.toBeNull()
    expect(insp.lastUpdate!.ts).toBe(9) // 最近一次
    expect(insp.lastUpdate!.updateKeys).toEqual(['stage'])
    expect(insp.lastUpdate!.update).toEqual({ stage: 'handoff' })
  })

  it('lastUpdate：事件日志词汇只有 updateKeys（日志不落值）——update 为 null、键名可用', () => {
    const insp = inspectNode([
      log({ kind: 'node.completed', nodeId: 'discovery', payload: { updateKeys: ['contracts', 'stage'], goto: ['handoff'] }, ts: 1 }),
    ], 'discovery')
    expect(insp.lastUpdate!.updateKeys).toEqual(['contracts', 'stage'])
    expect(insp.lastUpdate!.update).toBeNull()
  })

  it('无完成事件 → lastUpdate 为 null；未知节点 → 空关联事件', () => {
    expect(inspectNode([ev({ type: 'graph.node-start', nodeId: 'a', ts: 1 })], 'a').lastUpdate).toBeNull()
    expect(inspectNode([ev({ type: 'graph.node-start', nodeId: 'a', ts: 1 })], 'ghost').events).toEqual([])
  })

  it('error：failed 事件的人类可读原因（顶层 error / payload.error），多次取最近', () => {
    const events: ReplayEventLike[] = [
      ev({ type: 'graph.node-error', nodeId: 'gate', error: 'gate rejected: coverage 41% < 80%', ts: 1 }),
      ev({ type: 'graph.node-error', nodeId: 'gate', error: 'gate rejected: lint errors', ts: 2 }),
    ]
    expect(inspectNode(events, 'gate').error).toBe('gate rejected: lint errors')

    const fromPayload = inspectNode([
      log({ kind: 'node.failed', nodeId: 'gate', payload: { error: 'boom from log' }, ts: 1 }),
    ], 'gate')
    expect(fromPayload.error).toBe('boom from log')
    expect(inspectNode([ev({ type: 'graph.node-error', nodeId: 'gate', ts: 1 })], 'gate').error).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// formatDurationMs — 时长标签
// ---------------------------------------------------------------------------

describe('formatDurationMs — 时长标签（locale 无关）', () => {
  it('分段：<1s → ms；<1min → 秒；<1h → 分秒；<1d → 时分；更长 → 天时', () => {
    expect(formatDurationMs(0)).toBe('0ms')
    expect(formatDurationMs(-5)).toBe('0ms')
    expect(formatDurationMs(120)).toBe('120ms')
    expect(formatDurationMs(42_000)).toBe('42.0s')
    expect(formatDurationMs(5 * 60_000 + 32_000)).toBe('5m32s')
    expect(formatDurationMs(2 * 3_600_000 + 5 * 60_000)).toBe('2h5m')
    expect(formatDurationMs(3 * 86_400_000 + 4 * 3_600_000)).toBe('3d4h')
  })
})

// ---------------------------------------------------------------------------
// inbox 归档 kv — 本地标记（不改 run 状态）
// ---------------------------------------------------------------------------

/** 内存 kv（结构化 Storage 子集，测试可注入） */
function memStorage(): KvStorage & { dump(): Map<string, string> } {
  const m = new Map<string, string>()
  return {
    getItem: k => m.get(k) ?? null,
    setItem: (k, v) => { m.set(k, v) },
    removeItem: k => { m.delete(k) },
    dump: () => m,
  }
}

describe('inbox 归档 kv — loadArchivedMap / markArchived / unmarkArchived', () => {
  it('空存储 → 空映射；键名常量语义化', () => {
    const s = memStorage()
    expect(loadArchivedMap(s)).toEqual({})
    expect(INBOX_ARCHIVED_KEY).toContain('runcenter')
  })

  it('markArchived 写入 runId → 归档时刻，返回更新后的映射', () => {
    const s = memStorage()
    const next = markArchived('run-1', '2026-09-10T00:00:00Z', s)
    expect(next).toEqual({ 'run-1': '2026-09-10T00:00:00Z' })
    expect(loadArchivedMap(s)).toEqual({ 'run-1': '2026-09-10T00:00:00Z' })
    // 二次归档只更新时刻，不产生重复键
    markArchived('run-1', '2026-09-11T00:00:00Z', s)
    expect(loadArchivedMap(s)).toEqual({ 'run-1': '2026-09-11T00:00:00Z' })
  })

  it('unmarkArchived 移除标记；归档的键值对落真实存储（持久化语义）', () => {
    const s = memStorage()
    markArchived('run-1', 't1', s)
    markArchived('run-2', 't2', s)
    const next = unmarkArchived('run-1', s)
    expect(next).toEqual({ 'run-2': 't2' })
    expect(JSON.parse(s.dump().get(INBOX_ARCHIVED_KEY)!)).toEqual({ 'run-2': 't2' })
  })

  it('畸形 JSON / 非对象载荷按空映射兜底，不抛错', () => {
    const s = memStorage()
    s.setItem(INBOX_ARCHIVED_KEY, '{not json')
    expect(loadArchivedMap(s)).toEqual({})
    s.setItem(INBOX_ARCHIVED_KEY, '["array"]')
    expect(loadArchivedMap(s)).toEqual({})
    // 畸形底子上 mark 正常工作（覆盖写回合法结构）
    const next = markArchived('run-9', 't9', s)
    expect(next).toEqual({ 'run-9': 't9' })
  })

  it('storage null（SSR/异常环境）安全：读空、写返回内存映射不落盘', () => {
    expect(loadArchivedMap(null)).toEqual({})
    expect(markArchived('run-1', 't1', null)).toEqual({ 'run-1': 't1' })
    expect(unmarkArchived('run-1', null)).toEqual({})
  })
})
