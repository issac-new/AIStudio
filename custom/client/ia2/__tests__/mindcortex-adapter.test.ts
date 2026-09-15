// overlay/custom/client/ia2/__tests__/mindcortex-adapter.test.ts
// 方案 B 思维皮层原型守门（2026-09-15）：皮层柱拓扑的形态语义。
// 断言：皮层地形起伏、皮层柱粗细=运行史/高度=活跃度、核心沟回、轴突束三类关系
// （孕育/委派/产生）、萌芽标记（近 24h 新任务）、上限折叠、确定性。纯函数零 Three.js。
import { describe, it, expect } from 'vitest'
import { buildCortexScene, CORTEX_R } from '../adapters/mindcortex'
import type { MindProjectionDto } from '../adapters/mind'
import type { MindThoughtDto, MindRunDto } from '../adapters/mind'

function makeThought(partial: Partial<MindThoughtDto> & { id: string }): MindThoughtDto {
  return {
    title: partial.title ?? `任务-${partial.id}`,
    status: 'idle',
    createdAt: '2026-09-01T00:00:00Z',
    board: null,
    ...partial,
  }
}

function makeRun(partial: Partial<MindRunDto> & { runId: string; thoughtId: string }): MindRunDto {
  return {
    status: 'completed',
    durationSec: 60,
    startedAt: '2026-09-14T10:00:00Z',
    endedAt: '2026-09-14T10:01:00Z',
    outcome: 'completed',
    summary: null,
    ...partial,
  }
}

function proj(thoughts: MindThoughtDto[], runs: MindRunDto[], relations?: Array<{ parentId: string; childId: string }>): MindProjectionDto {
  return { thoughts, runs, relations, available: true }
}

describe('buildCortexScene — 方案 B 皮层柱形态', () => {
  it('空投影 → 仅核心沟回 + 皮层地形', () => {
    const scene = buildCortexScene(proj([], []))
    expect(scene.nodes.map(n => n.kind)).toEqual(['core'])
    expect(scene.edges).toEqual([])
    expect(scene.terrain.length).toBeGreaterThan(0) // 地形网格在
  })

  it('确定性：同一投影两次构造 deep equal', () => {
    const p = proj([makeThought({ id: 'a', status: 'running' })], [makeRun({ runId: 'r1', thoughtId: 'a' })])
    expect(buildCortexScene(p)).toEqual(buildCortexScene(p))
  })

  it('皮层柱：粗细=运行史规模、高度=活跃度（状态语义）', () => {
    const scene = buildCortexScene(proj([
      makeThought({ id: 'busy-run', status: 'running' }),
      makeThought({ id: 'quiet-idle', status: 'idle' }),
      makeThought({ id: 'busy-done', status: 'completed' }),
    ], [
      ...Array.from({ length: 5 }, (_, i) => makeRun({ runId: `a${i}`, thoughtId: 'busy-run' })),
      ...Array.from({ length: 5 }, (_, i) => makeRun({ runId: `b${i}`, thoughtId: 'busy-done' })),
    ]))
    const busyRun = scene.nodes.find(n => n.id === 'column:busy-run')!
    const quietIdle = scene.nodes.find(n => n.id === 'column:quiet-idle')!
    const busyDone = scene.nodes.find(n => n.id === 'column:busy-done')!
    // 粗细 = 运行史（与状态无关）
    expect(busyRun.r).toBe(busyDone.r)
    expect(busyRun.r).toBeGreaterThan(quietIdle.r)
    // 高度 = 活跃度（running 高耸、idle 低矮、completed 沉降）
    expect(busyRun.h).toBeGreaterThan(busyDone.h)
    expect(busyDone.h).toBeGreaterThan(quietIdle.h)
  })

  it('皮层地形：脑回起伏（高度场非零且确定）', () => {
    const scene = buildCortexScene(proj([], []))
    const ys = scene.terrain.map(p => p.y)
    expect(Math.max(...ys)).toBeGreaterThan(0)
    expect(Math.min(...ys)).toBeLessThan(0)
    expect(buildCortexScene(proj([], [])).terrain).toEqual(scene.terrain)
  })

  it('轴突束三类关系：孕育（core→柱）+ 产生（柱→run）+ 委派（柱→柱）', () => {
    const scene = buildCortexScene(proj(
      [makeThought({ id: 'parent' }), makeThought({ id: 'child' })],
      [makeRun({ runId: 'r1', thoughtId: 'child' })],
      [{ parentId: 'parent', childId: 'child' }],
    ))
    const birth = scene.edges.find(e => e.id === 'core->column:parent')!
    expect(birth.relKind).toBe('birth')
    const spawn = scene.edges.find(e => e.id === 'column:child->run:r1')!
    expect(spawn.relKind).toBe('spawn')
    const delegate = scene.edges.find(e => e.id === 'rel:parent->child')!
    expect(delegate.relKind).toBe('delegate')
    // 轴突弧顶点高于两端（有机上扬）
    expect(delegate.apexY).toBeGreaterThan(delegate.fromPos.y)
    expect(delegate.apexY).toBeGreaterThan(delegate.toPos.y)
  })

  it('萌芽标记：近 24h 创建的新任务 budding=true（生长动画起点）', () => {
    const recent = new Date(Date.now() - 3600_000).toISOString() // 1h 前
    const scene = buildCortexScene(proj([
      makeThought({ id: 'new', createdAt: recent }),
      makeThought({ id: 'old', createdAt: '2026-09-01T00:00:00Z' }),
    ], []))
    expect(scene.nodes.find(n => n.id === 'column:new')!.budding).toBe(true)
    expect(scene.nodes.find(n => n.id === 'column:old')!.budding).toBe(false)
  })

  it('皮层柱散布在皮层带内（不坍缩到中心）；上限折叠', () => {
    const scene = buildCortexScene(proj([
      makeThought({ id: 'a', status: 'running' }),
      makeThought({ id: 'b', status: 'running' }),
    ], []))
    for (const n of scene.nodes.filter(x => x.kind === 'column')) {
      const planarR = Math.hypot(n.x, n.z)
      expect(planarR).toBeGreaterThan(30)
      expect(planarR).toBeLessThanOrEqual(CORTEX_R + 1)
    }
    const many = buildCortexScene(proj(Array.from({ length: 34 }, (_, i) => makeThought({ id: `t${i}` })), []))
    expect(many.nodes.filter(n => n.kind === 'column').length).toBeLessThanOrEqual(28)
    expect(many.hiddenThoughts).toBe(6)
  })

  it('审批负载路由：待介入皮层柱导航进介入中心', () => {
    const scene = buildCortexScene(proj([makeThought({ id: 'wait', status: 'awaiting-review' })], []))
    expect(scene.nodes.find(n => n.id === 'column:wait')!.to)
      .toEqual({ name: 'ia2.inbox', query: { task: 'wait' } })
  })
})
