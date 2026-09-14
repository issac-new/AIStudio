// overlay/custom/client/ia2/__tests__/growth-adapter.test.ts
// 循环生长图纯投影守门：布局确定性、graphId 分组、未知 graphId → seed、
// 阶段→半径单调（"生长"语义）、扇区 run 上限 + 溢出计数、扇区上限、点击导航目标。
// 纯函数测试（零 DOM）：LoopInstance 完整形状过重，测试用最小投影字段构造。
import { describe, it, expect } from 'vitest'
import {
  buildGrowthScene, GROWTH_VIEW_W, GROWTH_VIEW_H,
  RUNS_PER_SECTOR, MAX_SECTORS,
} from '../adapters/growth'
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

const CX = GROWTH_VIEW_W / 2
const CY = GROWTH_VIEW_H / 2

function distFromCenter(node: { x: number; y: number }): number {
  return Math.hypot(node.x - CX, node.y - CY)
}

describe('buildGrowthScene — 基础形状', () => {
  it('空输入 → 仅核心节点，无边无溢出', () => {
    const scene = buildGrowthScene([], [])
    expect(scene.nodes.map(n => n.kind)).toEqual(['core'])
    expect(scene.edges).toEqual([])
    expect(scene.overflow).toEqual({})
    expect(scene.hiddenLoops).toBe(0)
    expect(scene.width).toBe(GROWTH_VIEW_W)
    expect(scene.height).toBe(GROWTH_VIEW_H)
  })

  it('确定性：同一输入两次构造 deep equal（跨渲染不跳位）', () => {
    const loops = [makeLoop({ id: 'a', status: 'running' }), makeLoop({ id: 'b', status: 'idle' })]
    const runs = [makeRun({ runId: 'r1', graphId: 'a', stage: 'validation', iteration: 2 })]
    expect(buildGrowthScene(loops, runs)).toEqual(buildGrowthScene(loops, runs))
  })
})

describe('buildGrowthScene — 扇区（loop/seed）', () => {
  it('loop 落内环 R=150，id/nav 目标正确；运行中扇区脉冲', () => {
    const scene = buildGrowthScene(
      [makeLoop({ id: 'l1', name: '晨检', status: 'running' }), makeLoop({ id: 'l2', status: 'idle' })],
      [],
    )
    const l1 = scene.nodes.find(n => n.id === 'loop:l1')
    expect(l1).toMatchObject({ kind: 'loop', label: '晨检', status: 'running', pulse: true })
    expect(distFromCenter(l1!)).toBeCloseTo(150, 5)
    expect(l1!.to).toEqual({ name: 'ia2.runs', query: { loop: 'l1' } })
    const l2 = scene.nodes.find(n => n.id === 'loop:l2')!
    expect(l2.pulse).toBe(false)
    // core→loop 根边存在
    expect(scene.edges.some(e => e.id === 'core->loop:l1')).toBe(true)
  })

  it('状态排序：running 扇区角度先于 idle（活跃驱动内环排序语义）', () => {
    const scene = buildGrowthScene(
      [makeLoop({ id: 'idle-a', status: 'idle' }), makeLoop({ id: 'run-b', status: 'running' })],
      [],
    )
    const angle = (id: string) => {
      const n = scene.nodes.find(x => x.id === id)!
      return Math.atan2(n.y - CY, n.x - CX)
    }
    expect(angle('loop:run-b')).toBeLessThan(angle('loop:idle-a'))
  })

  it('未知 graphId 的 run → seed 扇区（自建图），已知 loop 不重复成 seed', () => {
    const scene = buildGrowthScene(
      [makeLoop({ id: 'l1' })],
      [makeRun({ runId: 'r1', graphId: 'spec-9', status: 'completed' })],
    )
    const seed = scene.nodes.find(n => n.id === 'seed:spec-9')
    expect(seed).toMatchObject({ kind: 'seed', label: 'spec-9', status: 'completed' })
    expect(scene.nodes.find(n => n.id === 'seed:l1')).toBeUndefined()
    expect(scene.edges.some(e => e.id === 'seed:spec-9->run:r1')).toBe(true)
  })

  it(`扇区上限 ${MAX_SECTORS}：超出折叠进 hiddenLoops`, () => {
    const loops = Array.from({ length: MAX_SECTORS + 3 }, (_, i) => makeLoop({ id: `l${i}` }))
    const scene = buildGrowthScene(loops, [])
    expect(scene.nodes.filter(n => n.kind === 'loop' || n.kind === 'seed')).toHaveLength(MAX_SECTORS)
    expect(scene.hiddenLoops).toBe(3)
  })
})

describe('buildGrowthScene — 生长分支（run）', () => {
  it('阶段推进 → 端点半径单调增长（生长语义）；迭代叠加半径', () => {
    const runs = [
      makeRun({ runId: 'early', graphId: 'l1', stage: 'discovery', iteration: 0 }),
      makeRun({ runId: 'mid', graphId: 'l1', stage: 'validation', iteration: 0 }),
      makeRun({ runId: 'late', graphId: 'l1', stage: 'stop', iteration: 0 }),
      makeRun({ runId: 'deep', graphId: 'l1', stage: 'stop', iteration: 4 }),
    ]
    const scene = buildGrowthScene([makeLoop({ id: 'l1' })], runs)
    const r = (id: string) => distFromCenter(scene.nodes.find(n => n.id === `run:${id}`)!)
    expect(r('early')).toBeLessThan(r('mid'))
    expect(r('mid')).toBeLessThan(r('late'))
    expect(r('late')).toBeLessThan(r('deep'))
  })

  it(`单扇区上限 ${RUNS_PER_SECTOR}：更旧 run 折叠进 overflow；最新一支落扇区轴心`, () => {
    const runs = Array.from({ length: RUNS_PER_SECTOR + 2 }, (_, i) =>
      makeRun({ runId: `r${i}`, graphId: 'l1', lastActivityAt: `2026-09-14T10:0${i}:00Z` }))
    const scene = buildGrowthScene([makeLoop({ id: 'l1' })], runs)
    const runNodes = scene.nodes.filter(n => n.kind === 'run')
    expect(runNodes).toHaveLength(RUNS_PER_SECTOR)
    // 最新（r6，最大 ts）在列，最旧两支折叠
    expect(scene.nodes.find(n => n.id === 'run:r6')).toBeTruthy()
    expect(scene.nodes.find(n => n.id === 'run:r0')).toBeFalsy()
    expect(scene.overflow['loop:l1']).toBe(2)
    // 最新一支角度 == 扇区角度（offset 0）
    const sector = scene.nodes.find(n => n.id === 'loop:l1')!
    const newest = scene.nodes.find(n => n.id === 'run:r6')!
    const sectorAngle = Math.atan2(sector.y - CY, sector.x - CX)
    const runAngle = Math.atan2(newest.y - CY, newest.x - CX)
    expect(Math.abs(runAngle - sectorAngle)).toBeLessThan(1e-6)
  })

  it('运行中分支：节点脉冲 + 沿边粒子流；终态无流', () => {
    const runs = [
      makeRun({ runId: 'live', graphId: 'l1', status: 'running' }),
      makeRun({ runId: 'done', graphId: 'l1', status: 'completed' }),
    ]
    const scene = buildGrowthScene([makeLoop({ id: 'l1', status: 'running' })], runs)
    expect(scene.nodes.find(n => n.id === 'run:live')!.pulse).toBe(true)
    expect(scene.nodes.find(n => n.id === 'run:done')!.pulse).toBe(false)
    const liveEdge = scene.edges.find(e => e.id === 'loop:l1->run:live')!
    const doneEdge = scene.edges.find(e => e.id === 'loop:l1->run:done')!
    expect(liveEdge.flow).toBe(true)
    expect(doneEdge.flow).toBe(false)
  })

  it('run 端点导航 → ia2.runDetail（runId 参数）', () => {
    const scene = buildGrowthScene([makeLoop({ id: 'l1' })], [makeRun({ runId: 'abc123' })])
    expect(scene.nodes.find(n => n.id === 'run:abc123')!.to)
      .toEqual({ name: 'ia2.runDetail', params: { runId: 'abc123' } })
  })
})

describe('buildGrowthScene — 边完整性', () => {
  it('每个非 core 节点恰有一条入边；边引用的节点均存在；路径 d 非空', () => {
    const loops = [makeLoop({ id: 'l1', status: 'running' }), makeLoop({ id: 'l2' })]
    const runs = [
      makeRun({ runId: 'r1', graphId: 'l1', stage: 'handoff' }),
      makeRun({ runId: 'r2', graphId: 'spec-x' }),
    ]
    const scene = buildGrowthScene(loops, runs)
    const ids = new Set(scene.nodes.map(n => n.id))
    const inbound = new Map<string, number>()
    for (const e of scene.edges) {
      expect(ids.has(e.from)).toBe(true)
      expect(ids.has(e.to)).toBe(true)
      expect(e.d.startsWith('M ')).toBe(true)
      inbound.set(e.to, (inbound.get(e.to) ?? 0) + 1)
    }
    for (const n of scene.nodes) {
      if (n.kind === 'core') expect(inbound.get(n.id)).toBeUndefined()
      else expect(inbound.get(n.id)).toBe(1)
    }
  })
})
