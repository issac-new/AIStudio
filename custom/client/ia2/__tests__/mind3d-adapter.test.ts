// overlay/custom/client/ia2/__tests__/mind3d-adapter.test.ts
// 3D 思维图谱纯投影守门（2026-09-15 形态重构 v3：多维功能分区结构）。
// 用户裁决：皮层不对——像大脑那样有不同的功能分区，是多维结构，不是弯曲表面堆砌。
// 断言：无核心原点、多维分区（聚类族×状态功能面×活跃度）、分区体内部自治柱群、
// 跨区投射通路（跨分区关系边拉起）、分区界标、末梢环绕、上限折叠、确定性。
// 纯函数零 Three.js。
import { describe, it, expect } from 'vitest'
import { buildMind3DScene, MAX_THOUGHTS, RUNS_PER_THOUGHT } from '../adapters/mind3d'
import type { MindProjectionDto, MindThoughtDto, MindRunDto } from '../adapters/mind'

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

describe('buildMind3DScene — 多维功能分区结构', () => {
  it('空投影 → 无节点无边无分区（无中心原点）', () => {
    const scene = buildMind3DScene(proj([], []))
    expect(scene.nodes).toEqual([])
    expect(scene.edges).toEqual([])
    expect(scene.regions).toEqual([])
    expect(scene.hiddenThoughts).toBe(0)
  })

  it('无中心原点：不存在 core 节点，无分区质心精确落在原点', () => {
    const scene = buildMind3DScene(proj([
      makeThought({ id: 'a', status: 'running' }),
      makeThought({ id: 'b', status: 'idle' }),
    ], []))
    expect(scene.nodes.find(n => (n as { kind: string }).kind === 'core')).toBeUndefined()
    for (const r of scene.regions) {
      expect(Math.abs(r.cx) > 1e-6 || Math.abs(r.cz) > 1e-6 || scene.regions.length === 1).toBe(true)
    }
  })

  it('确定性：同一投影两次构造 deep equal', () => {
    const p = proj(
      [makeThought({ id: 'a', title: '[aiteam-1] 设计', status: 'running' })],
      [makeRun({ runId: 'r1', thoughtId: 'a' })],
      [{ parentId: 'a', childId: 'b' }],
    )
    expect(buildMind3DScene(p)).toEqual(buildMind3DScene(p))
  })
})

describe('buildMind3DScene — 多维功能分区（核心语义）', () => {
  it('分区 = 聚类族 × 状态功能面交汇：同族不同状态落不同分区', () => {
    const scene = buildMind3DScene(proj([
      makeThought({ id: 'a1', title: '[aiteam-1] 设计', status: 'running' }),
      makeThought({ id: 'a2', title: '[aiteam-2] 创建', status: 'completed' }),
      makeThought({ id: 'g1', title: '[gap] 会话无持久化', status: 'blocked' }),
    ], []))
    const regionOf = (id: string) => scene.nodes.find(n => n.id === `column:${id}`)!.region
    // 同族同功能面同分区；同族不同功能面不同分区；不同族不同分区
    expect(regionOf('a1')).not.toBe(regionOf('a2'))
    expect(regionOf('a1')).not.toBe(regionOf('g1'))
    expect(regionOf('a2')).not.toBe(regionOf('g1'))
    // 分区语义标签可读（族 · 功能面）
    const r1 = scene.regions.find(r => r.key === regionOf('a1'))!
    expect(r1.label).toContain('aiteam')
    expect(r1.label).toContain('活跃')
    const r2 = scene.regions.find(r => r.key === regionOf('a2'))!
    expect(r2.label).toContain('已沉降')
  })

  it('功能面高度维：活跃分区在上、待介入居中、沉降在下、静止在底', () => {
    const scene = buildMind3DScene(proj([
      makeThought({ id: 'run', title: '[x] 进行中', status: 'running' }),
      makeThought({ id: 'wait', title: '[y] 待介入', status: 'blocked' }),
      makeThought({ id: 'done', title: '[z] 已完成', status: 'completed' }),
      makeThought({ id: 'idle', title: '[w] 静止', status: 'idle' }),
    ], []))
    const y = (id: string) => scene.regions.find(r => r.key === scene.nodes.find(n => n.id === `column:${id}`)!.region)!.cy
    expect(y('run')).toBeGreaterThan(y('wait'))
    expect(y('wait')).toBeGreaterThan(y('done'))
    expect(y('done')).toBeGreaterThan(y('idle'))
  })

  it('分区体：内部任务柱群自治散布（分区半径内），分区界标含族+计数', () => {
    const scene = buildMind3DScene(proj([
      makeThought({ id: 'a1', title: '[aiteam-1] 设计' }),
      makeThought({ id: 'a2', title: '[aiteam-2] 创建' }),
      makeThought({ id: 'a3', title: '[aiteam-3] 验收' }),
    ], []))
    const region = scene.regions.find(r => r.cluster === 'aiteam')!
    expect(region.count).toBe(3)
    expect(region.radius).toBeGreaterThan(20)
    const members = scene.nodes.filter(n => n.kind === 'column' && n.region === region.key)
    expect(members).toHaveLength(3)
    for (const m of members) {
      const d = Math.hypot(m.x - region.cx, m.z - region.cz)
      expect(d).toBeLessThanOrEqual(region.radius + 1)
    }
  })
})

describe('buildMind3DScene — 投射通路与末梢', () => {
  it('跨区投射通路：跨分区的父子边显式拉起（crossRegion + 更高弧线）', () => {
    const scene = buildMind3DScene(proj([
      makeThought({ id: 'parent', title: '[a] 父任务', status: 'running' }),
      makeThought({ id: 'child', title: '[b] 子任务', status: 'completed' }),
    ], [], [{ parentId: 'parent', childId: 'child' }]))
    const edge = scene.edges.find(e => e.id === 'rel:parent->child')!
    expect(edge.relKind).toBe('delegate')
    expect(edge.crossRegion).toBe(true)
    expect(edge.apexY).toBeGreaterThan(Math.max(edge.fromPos.y, edge.toPos.y) + 30)
  })

  it('同区关系边不拉起（区内消化，crossRegion=false）', () => {
    const scene = buildMind3DScene(proj([
      makeThought({ id: 'parent', title: '[a] 父任务', status: 'running' }),
      makeThought({ id: 'child', title: '[a] 子任务', status: 'running' }),
    ], [], [{ parentId: 'parent', childId: 'child' }]))
    const edge = scene.edges.find(e => e.id === 'rel:parent->child')!
    expect(edge.crossRegion).toBe(false)
  })

  it('末梢环绕所属任务柱（同分区同簇）', () => {
    const scene = buildMind3DScene(proj([makeThought({ id: 't1' })], [
      makeRun({ runId: 'r1', thoughtId: 't1' }),
      makeRun({ runId: 'r2', thoughtId: 't1' }),
    ]))
    const col = scene.nodes.find(n => n.id === 'column:t1')!
    for (const run of scene.nodes.filter(n => n.kind === 'run')) {
      expect(run.region).toBe(col.region)
      const d = Math.hypot(run.x - col.x, run.z - col.z)
      expect(d).toBeGreaterThan(0)
      expect(d).toBeLessThan(50)
    }
  })

  it(`单思想核末梢上限 ${RUNS_PER_THOUGHT}；思想核上限 ${MAX_THOUGHTS} 折叠`, () => {
    const runs = Array.from({ length: RUNS_PER_THOUGHT + 2 }, (_, i) =>
      makeRun({ runId: `r${i}`, thoughtId: 't1', startedAt: `2026-09-14T10:0${i}:00Z` }))
    const scene = buildMind3DScene(proj([makeThought({ id: 't1' })], runs))
    expect(scene.nodes.filter(n => n.kind === 'run')).toHaveLength(RUNS_PER_THOUGHT)

    const many = buildMind3DScene(proj(Array.from({ length: MAX_THOUGHTS + 4 }, (_, i) => makeThought({ id: `t${i}` })), []))
    expect(many.nodes.filter(n => n.kind === 'column').length).toBeLessThanOrEqual(MAX_THOUGHTS)
    expect(many.hiddenThoughts).toBe(4)
  })
})

describe('buildMind3DScene — 柱形态与待介入', () => {
  it('柱粗细=运行史规模、柱高=活跃度（状态语义）', () => {
    const scene = buildMind3DScene(proj([
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
    expect(busyRun.r).toBe(busyDone.r)
    expect(busyRun.r).toBeGreaterThan(quietIdle.r)
    expect(busyRun.h).toBeGreaterThan(quietIdle.h)
  })

  it('萌芽标记：近 24h 新任务 budding=true', () => {
    const recent = new Date(Date.now() - 3600_000).toISOString()
    const scene = buildMind3DScene(proj([
      makeThought({ id: 'new', createdAt: recent }),
      makeThought({ id: 'old', createdAt: '2026-09-01T00:00:00Z' }),
    ], []))
    expect(scene.nodes.find(n => n.id === 'column:new')!.budding).toBe(true)
    expect(scene.nodes.find(n => n.id === 'column:old')!.budding).toBe(false)
  })

  it('待介入专属通道：pendingAlert 标记 + 路由进介入中心', () => {
    const scene = buildMind3DScene(proj([
      makeThought({ id: 'wait', status: 'awaiting-review' }),
      makeThought({ id: 'run', status: 'running' }),
    ], []))
    const wait = scene.nodes.find(n => n.id === 'column:wait')!
    expect(wait.pendingAlert).toBe(true)
    expect(wait.to).toEqual({ name: 'ia2.inbox', query: { task: 'wait' } })
    expect(scene.nodes.find(n => n.id === 'column:run')!.pendingAlert).toBeFalsy()
  })
})
