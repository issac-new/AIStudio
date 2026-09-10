// overlay/custom/client/loop/runcenter/__tests__/run-graph.test.ts
// run-graph adapter 单测（TDD 先行）：buildRunGraph 状态机投影 / layoutRunGraph
// 分层布局 / projectEvents 三级分辨率 / formatEventTs。
//
// 事件双词汇表都要吃：
// - 事件日志（GET /api/graph/runs/:id/replay → GraphLogEvent）：kind=node.started 等、ts 为 epoch ms
// - /graph socket（GraphEvent）：type=graph.node-start 等、ts 为 ISO 字符串
import { describe, it, expect } from 'vitest'
import {
  buildRunGraph,
  layoutRunGraph,
  projectEvents,
  formatEventTs,
  canonicalEventType,
} from '../adapters/run-graph'
import type {
  RunGraphTopologyLike,
  ReplayEventLike,
  TimelineMode,
} from '../adapters/run-graph'

// ── 固定六节点拓扑（graph-compiler.ts compileLoopToSpec 的编译产物形状）──
const SPEC: RunGraphTopologyLike = {
  id: 'loop-loop1',
  nodes: [
    { id: 'discovery', type: 'phase-discovery', config: { label: 'loop1:discovery' } },
    { id: 'handoff', type: 'phase-handoff', config: { label: 'loop1:handoff' } },
    { id: 'validation', type: 'phase-validation', config: { label: 'loop1:validation' } },
    { id: 'persistence', type: 'phase-persistence', config: { label: 'loop1:persistence' } },
    { id: 'gate', type: 'loop-gate', config: { label: 'loop1:gate' } },
    { id: 'stop-check', type: 'stop-check', config: { label: 'loop1:stop-check' } },
  ],
  edges: [
    { from: 'discovery', to: 'handoff', label: 'has-contracts' },
    { from: 'discovery', to: 'stop-check', label: 'no-contracts' },
    { from: 'handoff', to: 'validation', label: 'dispatched' },
    { from: 'validation', to: 'persistence', label: 'passed' },
    { from: 'validation', to: 'handoff', label: 'repair', guard: { maxIterations: 3 } },
    { from: 'persistence', to: 'gate', label: 'persisted' },
    { from: 'persistence', to: 'handoff', label: 'repair', guard: { maxIterations: 3 } },
    { from: 'gate', to: 'stop-check', label: 'gate-passed' },
    { from: 'gate', to: 'handoff', label: 'gate-repair', guard: { maxIterations: 3 } },
  ],
  entryNode: 'discovery',
}

/** 事件日志形状（GraphLogEvent：kind + epoch ms ts） */
const logEv = (over: Partial<ReplayEventLike> & { kind: string; ts: number }): ReplayEventLike => ({
  runId: 'run-1',
  graphId: 'loop-loop1',
  nodeId: over.nodeId,
  ...over,
})

/** socket 形状（GraphEvent：type + ISO ts） */
const sockEv = (over: Partial<ReplayEventLike> & { type: string; ts: string }): ReplayEventLike => ({
  graphId: 'loop-loop1',
  threadId: 'run-1',
  ...over,
})

describe('canonicalEventType — 双词汇表归一', () => {
  it('事件日志 kind 与 socket type 归一到同一规范名', () => {
    expect(canonicalEventType({ kind: 'node.started', ts: 0 })).toBe('started')
    expect(canonicalEventType({ type: 'graph.node-start', ts: '' })).toBe('started')
    expect(canonicalEventType({ kind: 'interrupt.raised', ts: 0 })).toBe('interrupted')
    expect(canonicalEventType({ type: 'graph.interrupt', ts: '' })).toBe('interrupted')
    expect(canonicalEventType({ kind: 'run.completed', ts: 0 })).toBe('run-completed')
    expect(canonicalEventType({ type: 'graph.completed', ts: '' })).toBe('run-completed')
  })

  it('未知事件原值透传（前端零翻译原则）', () => {
    expect(canonicalEventType({ kind: 'cost.recorded', ts: 0 })).toBe('cost.recorded')
    expect(canonicalEventType({ type: 'loop.stage-transition', ts: '' })).toBe('loop.stage-transition')
  })
})

describe('buildRunGraph — 状态机投影（事件日志词汇）', () => {
  it('空事件：全部节点 idle、边全部未 taken', () => {
    const g = buildRunGraph(SPEC, [])
    expect(g.nodes).toHaveLength(6)
    expect(g.nodes.every(n => n.status === 'idle')).toBe(true)
    expect(g.nodes.every(n => n.iteration === 0 && n.durationMs === 0)).toBe(true)
    expect(g.edges).toHaveLength(9)
    expect(g.edges.every(e => !e.taken)).toBe(true)
  })

  it('node.started → running；node.completed → done', () => {
    const g = buildRunGraph(SPEC, [
      logEv({ kind: 'run.started', ts: 1000 }),
      logEv({ kind: 'node.started', nodeId: 'discovery', superStep: 1, ts: 1000 }),
      logEv({ kind: 'node.completed', nodeId: 'discovery', superStep: 1, payload: { goto: ['handoff'] }, ts: 3000 }),
    ])
    const discovery = g.nodes.find(n => n.id === 'discovery')!
    expect(discovery.status).toBe('done')
    expect(discovery.iteration).toBe(1)
    expect(discovery.durationMs).toBe(2000)
    // 其余节点保持 idle
    expect(g.nodes.find(n => n.id === 'handoff')!.status).toBe('idle')
    // 路由事实：discovery→handoff 已走
    const taken = g.edges.filter(e => e.taken).map(e => e.id)
    expect(taken).toEqual(['discovery->handoff'])
  })

  it('node.failed → failed；payload.error 进投影', () => {
    const g = buildRunGraph(SPEC, [
      logEv({ kind: 'node.started', nodeId: 'validation', superStep: 2, ts: 1000 }),
      logEv({ kind: 'node.failed', nodeId: 'validation', superStep: 2, payload: { error: 'boom' }, ts: 1500 }),
    ])
    expect(g.nodes.find(n => n.id === 'validation')!.status).toBe('failed')
    expect(g.nodes.find(n => n.id === 'validation')!.durationMs).toBe(500)
  })

  it('interrupt.raised → awaiting-input；interrupt.resumed 恢复 running', () => {
    const g = buildRunGraph(SPEC, [
      logEv({ kind: 'node.started', nodeId: 'validation', ts: 1000 }),
      logEv({ kind: 'interrupt.raised', nodeId: 'validation', payload: { interruptId: 'approval:c1' }, ts: 2000 }),
    ])
    expect(g.nodes.find(n => n.id === 'validation')!.status).toBe('awaiting-input')

    const g2 = buildRunGraph(SPEC, [
      logEv({ kind: 'node.started', nodeId: 'validation', ts: 1000 }),
      logEv({ kind: 'interrupt.raised', nodeId: 'validation', ts: 2000 }),
      logEv({ kind: 'interrupt.resumed', nodeId: 'validation', ts: 9000 }),
    ])
    expect(g2.nodes.find(n => n.id === 'validation')!.status).toBe('running')
  })

  it('同节点多次完成：iteration 取最大、durationMs 累计', () => {
    const g = buildRunGraph(SPEC, [
      logEv({ kind: 'node.started', nodeId: 'handoff', superStep: 1, ts: 1000 }),
      logEv({ kind: 'node.completed', nodeId: 'handoff', superStep: 1, payload: { goto: ['validation'] }, ts: 2000 }),
      logEv({ kind: 'node.started', nodeId: 'handoff', superStep: 3, ts: 5000 }),
      logEv({ kind: 'node.completed', nodeId: 'handoff', superStep: 3, payload: { goto: ['validation'] }, ts: 7000 }),
    ])
    const handoff = g.nodes.find(n => n.id === 'handoff')!
    expect(handoff.iteration).toBe(3)
    expect(handoff.durationMs).toBe(3000)
    expect(handoff.status).toBe('done')
  })

  it('repair 回边 taken：node.completed 的 goto 指回 handoff', () => {
    const g = buildRunGraph(SPEC, [
      logEv({ kind: 'node.started', nodeId: 'validation', superStep: 1, ts: 1000 }),
      logEv({ kind: 'node.completed', nodeId: 'validation', superStep: 1, payload: { goto: ['handoff'] }, ts: 2000 }),
    ])
    const taken = g.edges.filter(e => e.taken).map(e => e.id)
    expect(taken).toEqual(['validation->handoff'])
  })

  it('node.error-routed 的 payload.target 记为路由事实（边 taken）', () => {
    const g = buildRunGraph(SPEC, [
      logEv({ kind: 'node.failed', nodeId: 'persistence', payload: { error: 'write fail' }, ts: 1000 }),
      logEv({ kind: 'node.error-routed', nodeId: 'persistence', payload: { target: 'handoff' }, ts: 1100 }),
    ])
    const taken = g.edges.filter(e => e.taken).map(e => e.id)
    expect(taken).toContain('persistence->handoff')
  })

  it('run.completed 后从未启动的节点 → skipped', () => {
    const g = buildRunGraph(SPEC, [
      logEv({ kind: 'node.started', nodeId: 'discovery', ts: 1000 }),
      logEv({ kind: 'node.completed', nodeId: 'discovery', payload: { goto: ['stop-check'] }, ts: 2000 }),
      logEv({ kind: 'node.started', nodeId: 'stop-check', ts: 2100 }),
      logEv({ kind: 'node.completed', nodeId: 'stop-check', payload: { hasEnd: true }, ts: 2400 }),
      logEv({ kind: 'run.completed', payload: { totalCost: 0.5 }, ts: 2500 }),
    ])
    expect(g.nodes.find(n => n.id === 'discovery')!.status).toBe('done')
    expect(g.nodes.find(n => n.id === 'handoff')!.status).toBe('skipped')
    expect(g.nodes.find(n => n.id === 'gate')!.status).toBe('skipped')
    // 启动过的不受影响
    expect(g.nodes.find(n => n.id === 'stop-check')!.status).toBe('done')
  })

  it('未知 nodeId（legacy 桥接的 reason）不产生幽灵节点', () => {
    const g = buildRunGraph(SPEC, [
      logEv({ kind: 'node.failed', nodeId: 'scheduling', payload: { error: 'budget 90%' }, ts: 1000 }),
    ])
    expect(g.nodes).toHaveLength(6)
    expect(g.nodes.every(n => n.status === 'idle')).toBe(true)
  })

  it('guard 徽标：带 guard 的边投影 maxIterations', () => {
    const g = buildRunGraph(SPEC, [])
    const repair = g.edges.find(e => e.id === 'validation->handoff')!
    expect(repair.guard).toBe(3)
    const plain = g.edges.find(e => e.id === 'discovery->handoff')!
    expect(plain.guard).toBeUndefined()
  })

  it('拓扑未含 entryNode 时零入边节点为起点（布局仍可用）', () => {
    const { entryNode: _drop, ...noEntry } = SPEC
    const g = buildRunGraph(noEntry, [])
    expect(g.nodes).toHaveLength(6)
  })

  it('纯函数：不改入参数组', () => {
    const events = [
      logEv({ kind: 'node.started', nodeId: 'discovery', ts: 1000 }),
    ]
    const snapshot = JSON.stringify(events)
    buildRunGraph(SPEC, events)
    expect(JSON.stringify(events)).toBe(snapshot)
  })
})

describe('buildRunGraph — socket 词汇等价投影', () => {
  it('graph.node-start/graph.node-complete/graph.interrupt 与日志 kind 同一结果', () => {
    const g = buildRunGraph(SPEC, [
      sockEv({ type: 'graph.started', ts: '2026-09-10T00:00:01Z' }),
      sockEv({ type: 'graph.node-start', nodeId: 'discovery', step: 1, ts: '2026-09-10T00:00:01Z' }),
      sockEv({
        type: 'graph.node-complete', nodeId: 'discovery', step: 1,
        result: { goto: ['handoff'] }, ts: '2026-09-10T00:00:03Z',
      }),
    ])
    const discovery = g.nodes.find(n => n.id === 'discovery')!
    expect(discovery.status).toBe('done')
    expect(discovery.iteration).toBe(1)
    expect(g.edges.find(e => e.id === 'discovery->handoff')!.taken).toBe(true)
  })

  it('graph.interrupt → awaiting-input；graph.resume → running', () => {
    const g = buildRunGraph(SPEC, [
      sockEv({ type: 'graph.node-start', nodeId: 'validation', ts: '2026-09-10T00:00:01Z' }),
      sockEv({ type: 'graph.interrupt', nodeId: 'validation', interruptId: 'approval:c1', ts: '2026-09-10T00:00:02Z' }),
      sockEv({ type: 'graph.resume', interruptId: 'approval:c1', ts: '2026-09-10T00:05:00Z' }),
    ])
    expect(g.nodes.find(n => n.id === 'validation')!.status).toBe('running')
  })
})

describe('layoutRunGraph — 手写分层布局（固定六节点列布局）', () => {
  it('discovery→handoff→validation→persistence→gate→stop-check 逐列递增', () => {
    const g = buildRunGraph(SPEC, [])
    const pos = layoutRunGraph(g, 'discovery')
    const col = (id: string) => pos.get(id)!.x
    expect(col('discovery')).toBeLessThan(col('handoff'))
    expect(col('handoff')).toBeLessThan(col('validation'))
    expect(col('validation')).toBeLessThan(col('persistence'))
    expect(col('persistence')).toBeLessThan(col('gate'))
    expect(col('gate')).toBeLessThan(col('stop-check'))
  })

  it('直接短路路径（discovery→stop-check）不把 stop-check 拉平到第 1 列——取最长路径分层', () => {
    const g = buildRunGraph(SPEC, [])
    const pos = layoutRunGraph(g, 'discovery')
    // stop-check 的最长前驱链是 gate（5 列），不是 discovery 直连（1 列）
    expect(pos.get('stop-check')!.x).toBeGreaterThan(pos.get('gate')!.x)
  })

  it('repair 回边不参与分层（handoff 保持第 1 列，不被拉到 persistence 之后）', () => {
    const g = buildRunGraph(SPEC, [])
    const pos = layoutRunGraph(g, 'discovery')
    expect(pos.get('handoff')!.x).toBeLessThan(pos.get('validation')!.x)
  })

  it('全部节点都有坐标', () => {
    const g = buildRunGraph(SPEC, [])
    const pos = layoutRunGraph(g, 'discovery')
    expect(pos.size).toBe(6)
    for (const n of g.nodes) expect(pos.get(n.id)).toBeDefined()
  })
})

// ── 三级分辨率投影 ──

/** 覆盖三类级别的完整事件序列（日志词汇） */
const FULL_EVENTS: ReplayEventLike[] = [
  logEv({ kind: 'run.started', ts: 1000 }),
  logEv({ kind: 'node.started', nodeId: 'discovery', superStep: 1, ts: 1000 }),
  logEv({ kind: 'node.completed', nodeId: 'discovery', superStep: 1, payload: { goto: ['handoff'], updateKeys: ['contracts'] }, ts: 2000 }),
  logEv({ kind: 'checkpoint.saved', payload: { checkpointId: 'cp-1' }, ts: 2100 }),
  logEv({ kind: 'cost.recorded', payload: { amount: 0.1, totalCost: 0.1 }, ts: 2200 }),
  logEv({ kind: 'node.started', nodeId: 'validation', superStep: 2, ts: 3000 }),
  logEv({ kind: 'interrupt.raised', nodeId: 'validation', payload: { interruptId: 'approval:c1' }, ts: 3500 }),
]

describe('projectEvents — Summary 档：只显示节点级结果行', () => {
  const rows = projectEvents(FULL_EVENTS, 'summary')

  it('只含 node.completed/node.failed/interrupt.raised', () => {
    expect(rows.map(r => r.type)).toEqual(['node.completed', 'interrupt.raised'])
  })

  it('结果行带节点状态投影', () => {
    expect(rows[0].status).toBe('done')
    expect(rows[0].nodeId).toBe('discovery')
    expect(rows[1].status).toBe('awaiting-input')
  })

  it('不携带 payload / goto（Summary 不显示明细）', () => {
    expect(rows.every(r => r.payload === undefined && r.goto === undefined)).toBe(true)
  })
})

describe('projectEvents — Normal 档：节点 started/completed + 路由事实', () => {
  const rows = projectEvents(FULL_EVENTS, 'normal')

  it('含 started + 结果 + run 生命周期，不含 checkpoint/cost 等过程事件', () => {
    expect(rows.map(r => r.type)).toEqual([
      'run.started',
      'node.started',
      'node.completed',
      'node.started',
      'interrupt.raised',
    ])
  })

  it('completed 行携带路由事实 goto', () => {
    const completed = rows.find(r => r.type === 'node.completed')!
    expect(completed.goto).toEqual(['handoff'])
  })

  it('无 payload', () => {
    expect(rows.every(r => r.payload === undefined)).toBe(true)
  })
})

describe('projectEvents — Verbose 档：全事件含 payload', () => {
  const rows = projectEvents(FULL_EVENTS, 'verbose')

  it('全事件一比一投影，携带 payload 与原始 index', () => {
    expect(rows).toHaveLength(FULL_EVENTS.length)
    const checkpoint = rows.find(r => r.type === 'checkpoint.saved')!
    expect(checkpoint.payload).toEqual({ checkpointId: 'cp-1' })
    expect(checkpoint.index).toBe(3)
    expect(checkpoint.level).toBe('raw')
  })

  it('error 事实进投影（node.failed 的 payload.error / 顶层 error）', () => {
    const rows2 = projectEvents([
      logEv({ kind: 'node.failed', nodeId: 'gate', payload: { error: 'gate reject' }, ts: 1 }),
    ], 'verbose')
    expect(rows2[0].error).toBe('gate reject')
  })

  it('空事件 → 空行数组；未知 mode 收敛为 normal', () => {
    expect(projectEvents([], 'verbose')).toEqual([])
    const rows = projectEvents(FULL_EVENTS, 'unknown' as TimelineMode)
    expect(rows.map(r => r.type)).toContain('node.started')
    expect(rows.map(r => r.type)).not.toContain('cost.recorded')
  })
})

describe('formatEventTs — 时间轴时间标签', () => {
  it('epoch ms → HH:MM:SS（本地时区）', () => {
    const d = new Date(2026, 8, 10, 12, 34, 56)
    expect(formatEventTs(d.getTime())).toBe('12:34:56')
  })

  it('ISO 字符串截取时刻段', () => {
    expect(formatEventTs('2026-09-10T08:09:10Z')).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  it('非法输入落 —', () => {
    expect(formatEventTs(Number.NaN)).toBe('—')
    expect(formatEventTs('not-a-date')).toBe('—')
  })
})
