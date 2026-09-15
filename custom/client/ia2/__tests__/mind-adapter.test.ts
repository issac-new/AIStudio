// overlay/custom/client/ia2/__tests__/mind-adapter.test.ts
// 思维大脑纯投影守门（2026-09-15 重设计：活大脑无人工编排）：
// 布局确定性、graphId 分组（run.graphId 即 loop id）、未知 graphId → seed 思想核、
// 阶段→半径单调（生长语义）、突触可塑性（复用强度）、扇区 run 上限 + 溢出、
// 思想核上限、待介入/涌现的记忆脉冲、点击导航目标。纯函数零 DOM。
import { describe, it, expect } from 'vitest'
import {
  buildMindScene, MIND_VIEW_W, MIND_VIEW_H,
  RUNS_PER_SECTOR, MAX_SECTORS,
} from '../adapters/mind'
import type { LoopInstance } from '@/custom/loop/types'
import type { RunSummary } from '@/custom/loop/runcenter/types'

function makeLoop(partial: Partial<LoopInstance> & { id: string; name?: string; status?: LoopInstance['status'] }): LoopInstance {
  return {
    name: partial.name ?? partial.id,
    goal: '', stopCondition: '', pattern: 'daily-report' as LoopInstance['pattern'],
    schedule: { type: 'cron', cron: '0 9 * * *' } as LoopInstance['schedule'],
    stage: 'discovery', status: partial.status ?? 'idle',
    autonomyLevel: 'level-2' as LoopInstance['autonomyLevel'], stateAdapter: 'local',
    createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
    lastTickAt: null, nextTickAt: null,
    budget: {} as LoopInstance['budget'], stats: {} as LoopInstance['stats'],
    ...partial,
  } as LoopInstance
}

function makeRun(partial: Partial<RunSummary> & { runId: string }): RunSummary {
  return {
    graphId: 'g1', status: 'running', updatedAt: '2026-09-14T10:00:00Z',
    stage: null, iteration: 0, lastActivityAt: '2026-09-14T10:00:00Z',
    cost: 0, events: [], pendingInterruptId: null,
    ...partial,
  }
}

const CX = MIND_VIEW_W / 2
const CY = MIND_VIEW_H / 2

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function distFromCenter(node: { x: number; y: number }): number {
  return Math.hypot(node.x - CX, node.y - CY)
}

describe('buildMindScene — 基础形状', () => {
  it('空输入 → 仅核心神经元，无边无脉冲', () => {
    const scene = buildMindScene([], [])
    expect(scene.nodes.map(n => n.kind)).toEqual(['core'])
    expect(scene.edges).toEqual([])
    expect(scene.pulses).toEqual([])
    expect(scene.hiddenLoops).toBe(0)
    expect(scene.width).toBe(MIND_VIEW_W)
    expect(scene.height).toBe(MIND_VIEW_H)
  })

  it('确定性：同一输入两次构造 deep equal（id 哈希驱动稳定散点）', () => {
    const loops = [makeLoop({ id: 'a', status: 'running' }), makeLoop({ id: 'b', status: 'idle' })]
    const runs = [makeRun({ runId: 'r1', graphId: 'a', stage: 'validation', iteration: 2 })]
    expect(buildMindScene(loops, runs)).toEqual(buildMindScene(loops, runs))
  })
})

describe('buildMindScene — 思想核（loop/seed）', () => {
  it('思想核落在皮层散布带（半径 96..168），nav 指向该 loop 的运行列表', () => {
    const scene = buildMindScene(
      [makeLoop({ id: 'l1', name: '晨检', status: 'running' }), makeLoop({ id: 'l2', status: 'idle' })],
      [],
    )
    const l1 = scene.nodes.find(n => n.id === 'loop:l1')!
    expect(l1).toMatchObject({ kind: 'loop', label: '晨检', status: 'running', pulse: true })
    const r = distFromCenter(l1)
    expect(r).toBeGreaterThanOrEqual(96 - 1e-6)
    expect(r).toBeLessThanOrEqual(168 + 1e-6)
    expect(l1.to).toEqual({ name: 'ia2.runs', query: { loop: 'l1' } })
    // core→loop 根突触存在，有机曲线（三次贝塞尔）
    const root = scene.edges.find(e => e.id === 'core->loop:l1')!
    expect(root.d.startsWith('M ')).toBe(true)
    expect(root.d).toContain(' C ')
  })

  it('强度排序：running 思想核先于 idle（活跃驱动皮层分布）', () => {
    const scene = buildMindScene(
      [makeLoop({ id: 'idle-a', status: 'idle' }), makeLoop({ id: 'run-b', status: 'running' })],
      [],
    )
    const angle = (id: string) => {
      const n = scene.nodes.find(x => x.id === id)!
      return Math.atan2(n.y - CY, n.x - CX)
    }
    expect(angle('loop:run-b')).toBeLessThan(angle('loop:idle-a'))
  })

  it('未知 graphId 的 run → seed 思想核；已知 loop 不重复成 seed', () => {
    const scene = buildMindScene(
      [makeLoop({ id: 'l1' })],
      [makeRun({ runId: 'r1', graphId: 'spec-9', status: 'completed' })],
    )
    expect(scene.nodes.find(n => n.id === 'seed:spec-9')).toMatchObject({ kind: 'seed', label: 'spec-9', status: 'completed' })
    expect(scene.nodes.find(n => n.id === 'seed:l1')).toBeUndefined()
    expect(scene.edges.some(e => e.id.startsWith('seed:spec-9->run:r1'))).toBe(true)
  })

  it(`思想核上限 ${MAX_SECTORS}：超出折叠进 hiddenLoops`, () => {
    const loops = Array.from({ length: MAX_SECTORS + 4 }, (_, i) => makeLoop({ id: `l${i}` }))
    const scene = buildMindScene(loops, [])
    expect(scene.nodes.filter(n => n.kind === 'loop' || n.kind === 'seed')).toHaveLength(MAX_SECTORS)
    expect(scene.hiddenLoops).toBe(4)
  })
})

describe('buildMindScene — 突触生长（run）', () => {
  it('阶段推进 → 末梢半径单调增长（生长语义）；迭代叠加半径', () => {
    const sector = makeLoop({ id: 'l1' })
    const runs = [
      makeRun({ runId: 'early', graphId: 'l1', stage: 'discovery', iteration: 0 }),
      makeRun({ runId: 'mid', graphId: 'l1', stage: 'validation', iteration: 0 }),
      makeRun({ runId: 'late', graphId: 'l1', stage: 'stop', iteration: 0 }),
      makeRun({ runId: 'deep', graphId: 'l1', stage: 'stop', iteration: 5 }),
    ]
    const scene = buildMindScene([sector], runs)
    const loopNode = scene.nodes.find(n => n.id === 'loop:l1')!
    const r = (id: string) => dist(scene.nodes.find(n => n.id === `run:${id}`)!, loopNode)
    expect(r('early')).toBeLessThan(r('mid'))
    expect(r('mid')).toBeLessThan(r('late'))
    expect(r('late')).toBeLessThan(r('deep'))
  })

  it(`单扇区上限 ${RUNS_PER_SECTOR}：更旧 run 折叠进 overflow`, () => {
    const runs = Array.from({ length: RUNS_PER_SECTOR + 2 }, (_, i) =>
      makeRun({ runId: `r${i}`, graphId: 'l1', lastActivityAt: `2026-09-14T10:0${i}:00Z` }))
    const scene = buildMindScene([makeLoop({ id: 'l1' })], runs)
    expect(scene.nodes.filter(n => n.kind === 'run')).toHaveLength(RUNS_PER_SECTOR)
    expect(scene.nodes.find(n => n.id === 'run:r6')).toBeTruthy()
    expect(scene.nodes.find(n => n.id === 'run:r0')).toBeFalsy()
    expect(scene.overflow['loop:l1']).toBe(2)
  })

  it('突触可塑性：运行中分支比终态分支更"粗"（strength 更高）', () => {
    const runs = [
      makeRun({ runId: 'live', graphId: 'l1', status: 'running' }),
      makeRun({ runId: 'done', graphId: 'l1', status: 'completed' }),
    ]
    const scene = buildMindScene([makeLoop({ id: 'l1', status: 'running' })], runs)
    const liveEdges = scene.edges.filter(e => e.to === 'run:live')
    const doneEdges = scene.edges.filter(e => e.to === 'run:done')
    expect(Math.max(...liveEdges.map(e => e.strength))).toBeGreaterThan(Math.max(...doneEdges.map(e => e.strength)))
  })

  it('末梢神经束发散 1..3 条（同一 run 恒定分支数）', () => {
    const runs = [makeRun({ runId: 'r1', graphId: 'l1' }), makeRun({ runId: 'r2', graphId: 'l1' })]
    const scene = buildMindScene([makeLoop({ id: 'l1' })], runs)
    for (const runId of ['r1', 'r2']) {
      const edges = scene.edges.filter(e => e.to === `run:${runId}`)
      expect(edges.length).toBeGreaterThanOrEqual(1)
      expect(edges.length).toBeLessThanOrEqual(3)
      // 分支号唯一（束内序号 0..n-1）
      expect(new Set(edges.map(e => e.branchNo)).size).toBe(edges.length)
    }
  })

  it('运行中分支：节点脉冲 + 沿边粒子流；终态无流', () => {
    const runs = [
      makeRun({ runId: 'live', graphId: 'l1', status: 'running' }),
      makeRun({ runId: 'done', graphId: 'l1', status: 'completed' }),
    ]
    const scene = buildMindScene([makeLoop({ id: 'l1', status: 'running' })], runs)
    expect(scene.nodes.find(n => n.id === 'run:live')!.pulse).toBe(true)
    expect(scene.nodes.find(n => n.id === 'run:done')!.pulse).toBe(false)
    expect(scene.edges.filter(e => e.to === 'run:live' && e.flow).length).toBeGreaterThan(0)
    expect(scene.edges.filter(e => e.to === 'run:done' && e.flow)).toHaveLength(0)
  })

  it('run 端点导航 → ia2.runDetail（runId 参数）', () => {
    const scene = buildMindScene([makeLoop({ id: 'l1' })], [makeRun({ runId: 'abc123' })])
    expect(scene.nodes.find(n => n.id === 'run:abc123')!.to)
      .toEqual({ name: 'ia2.runDetail', params: { runId: 'abc123' } })
  })
})

describe('buildMindScene — 记忆脉冲（时间生长感）', () => {
  it('运行中思想核/末梢产生 spark 脉冲；待介入产生 interrupt 脉冲', () => {
    const loops = [makeLoop({ id: 'l1', status: 'running' }), makeLoop({ id: 'l2', status: 'awaiting-review' })]
    const runs = [
      makeRun({ runId: 'hot', graphId: 'l1', status: 'running' }),
      makeRun({ runId: 'wait', graphId: 'l2', status: 'awaiting-input' }),
    ]
    const scene = buildMindScene(loops, runs)
    const kinds = scene.pulses.map(p => `${p.kind}:${p.nodeId}`)
    expect(kinds).toContain('spark:core')       // 运行思想核触发核心火花
    expect(kinds).toContain('spark:run:hot')    // 运行末梢火花
    expect(kinds).toContain('interrupt:run:wait') // 待介入尖峰
    // 脉冲 delay 稳定（哈希驱动）——逐 id 对账两次独立构造
    const again = buildMindScene(loops, runs)
    expect(again.pulses.map(p => p.id).sort()).toEqual(scene.pulses.map(p => p.id).sort())
    for (const p of scene.pulses) {
      const twin = again.pulses.find(q => q.id === p.id)
      expect(twin).toBeDefined()
      expect(twin!.delayS).toBe(p.delayS)
    }
  })
})

describe('buildMindScene — 边完整性', () => {
  it('每个非 core 节点有入边；边引用的节点均存在；路径 d 非空有机曲线', () => {
    const loops = [makeLoop({ id: 'l1', status: 'running' }), makeLoop({ id: 'l2' })]
    const runs = [
      makeRun({ runId: 'r1', graphId: 'l1', stage: 'handoff' }),
      makeRun({ runId: 'r2', graphId: 'spec-x' }),
    ]
    const scene = buildMindScene(loops, runs)
    const ids = new Set(scene.nodes.map(n => n.id))
    const inbound = new Set<string>()
    for (const e of scene.edges) {
      expect(ids.has(e.from)).toBe(true)
      expect(ids.has(e.to)).toBe(true)
      expect(e.d.startsWith('M ')).toBe(true)
      expect(e.d).toContain(' C ')
      inbound.add(e.to)
    }
    // core 无入边；每个 loop/seed 恰有 core 根突触；每个 run 有 1..3 末梢突触
    expect(inbound.has('core')).toBe(false)
    for (const n of scene.nodes) {
      if (n.kind === 'core') continue
      expect(inbound.has(n.id)).toBe(true)
    }
  })
})
