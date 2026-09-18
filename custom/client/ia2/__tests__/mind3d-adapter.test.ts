// overlay/custom/client/ia2/__tests__/mind3d-adapter.test.ts
// 3D 思维图谱纯投影守门（2026-09-15 形态重构 v4：力导向内聚团块 + 就地筛选）。
import { describe, it, expect } from 'vitest'
import {
  buildMind3DScene, relatedIdsOf, MAX_THOUGHTS, RUNS_PER_THOUGHT,
} from '../adapters/mind3d'
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

function dist2D(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

describe('buildMind3DScene — 力导向内聚团块', () => {
  it('空投影 → 无节点无边无簇（无中心原点）', () => {
    const scene = buildMind3DScene(proj([], []))
    expect(scene.nodes).toEqual([])
    expect(scene.edges).toEqual([])
    expect(scene.clusters).toEqual([])
    expect(scene.hiddenThoughts).toBe(0)
  })

  it('确定性：同一投影两次构造 deep equal（固定种子力导向）', () => {
    const p = proj(
      [makeThought({ id: 'a', title: '[aiteam-1] 设计', status: 'running' }), makeThought({ id: 'b', title: '[gap] 问题' })],
      [makeRun({ runId: 'r1', thoughtId: 'a' })],
      [{ parentId: 'a', childId: 'b' }],
    )
    expect(buildMind3DScene(p)).toEqual(buildMind3DScene(p))
  })

  it('力导向自组织：同族任务收敛成簇（族内距 < 族间距）', () => {
    const scene = buildMind3DScene(proj([
      makeThought({ id: 'a1', title: '[aiteam-1] 设计' }),
      makeThought({ id: 'a2', title: '[aiteam-2] 创建' }),
      makeThought({ id: 'a3', title: '[aiteam-3] 验收' }),
      makeThought({ id: 'g1', title: '[gap] 问题一' }),
      makeThought({ id: 'g2', title: '[gap] 问题二' }),
    ], []))
    const pos = (id: string) => scene.nodes.find(n => n.id === `column:${id}`)!
    const aiteamSpread = Math.max(dist2D(pos('a1'), pos('a2')), dist2D(pos('a2'), pos('a3')), dist2D(pos('a1'), pos('a3')))
    const gapDist = Math.min(dist2D(pos('a1'), pos('g1')), dist2D(pos('a1'), pos('g2')), dist2D(pos('a2'), pos('g1')), dist2D(pos('a3'), pos('g2')))
    expect(aiteamSpread).toBeLessThan(gapDist)
  })

  it('关系边拉拢：父子链任务比无关联孤任务更靠近', () => {
    const scene = buildMind3DScene(proj([
      makeThought({ id: 'parent', title: '父任务' }),
      makeThought({ id: 'child', title: '子任务' }),
      makeThought({ id: 'lone', title: '孤任务' }),
    ], [], [{ parentId: 'parent', childId: 'child' }]))
    const pos = (id: string) => scene.nodes.find(n => n.id === `column:${id}`)!
    expect(dist2D(pos('parent'), pos('child'))).toBeLessThan(dist2D(pos('parent'), pos('lone')))
  })

  it('簇界标涌现：力导向收敛后的实际质心（非手工指定），含族名+计数', () => {
    const scene = buildMind3DScene(proj([
      makeThought({ id: 'a1', title: '[aiteam-1] 设计' }),
      makeThought({ id: 'a2', title: '[aiteam-2] 创建' }),
      makeThought({ id: 'g1', title: '[gap] 问题' }),
    ], []))
    const aiteam = scene.clusters.find(c => c.label === 'aiteam')!
    expect(aiteam.count).toBe(2)
    const m1 = scene.nodes.find(n => n.id === 'column:a1')!
    const m2 = scene.nodes.find(n => n.id === 'column:a2')!
    expect(aiteam.cx).toBeCloseTo((m1.x + m2.x) / 2, 5)
    expect(aiteam.cz).toBeCloseTo((m1.z + m2.z) / 2, 5)
  })

  it('柱形态语义保留：粗细=运行史、高度=活跃度', () => {
    const scene = buildMind3DScene(proj([
      makeThought({ id: 'busy-run', status: 'running' }),
      makeThought({ id: 'quiet-idle', status: 'idle' }),
    ], Array.from({ length: 5 }, (_, i) => makeRun({ runId: `a${i}`, thoughtId: 'busy-run' }))))
    const busyRun = scene.nodes.find(n => n.id === 'column:busy-run')!
    const quietIdle = scene.nodes.find(n => n.id === 'column:quiet-idle')!
    expect(busyRun.r).toBeGreaterThan(quietIdle.r)
    expect(busyRun.h).toBeGreaterThan(quietIdle.h)
  })

  it('跨簇投射弧：跨族父子边 crossCluster=true + 更高弧线；同族 false', () => {
    const scene = buildMind3DScene(proj([
      makeThought({ id: 'parent', title: '[a] 父' }),
      makeThought({ id: 'child', title: '[b] 子' }),
      makeThought({ id: 'inner1', title: '[c] 内1' }),
      makeThought({ id: 'inner2', title: '[c] 内2' }),
    ], [], [
      { parentId: 'parent', childId: 'child' },
      { parentId: 'inner1', childId: 'inner2' },
    ]))
    const cross = scene.edges.find(e => e.id === 'rel:parent->child')!
    expect(cross.crossCluster).toBe(true)
    expect(cross.apexY).toBeGreaterThan(Math.max(cross.fromPos.y, cross.toPos.y) + 30)
    const inner = scene.edges.find(e => e.id === 'rel:inner1->inner2')!
    expect(inner.crossCluster).toBe(false)
  })

  it('待介入专属通道：pendingAlert 标记 + 路由进介入中心', () => {
    const scene = buildMind3DScene(proj([
      makeThought({ id: 'wait', status: 'awaiting-review' }),
      makeThought({ id: 'run', status: 'running' }),
    ], []))
    const wait = scene.nodes.find(n => n.id === 'column:wait')!
    expect(wait.pendingAlert).toBe(true)
    expect(wait.to).toEqual({ name: 'ia2.ops', query: { tab: 'inbox', task: 'wait' } })
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

describe('relatedIdsOf — 就地筛选关联项（用户裁决：不跳 kanban）', () => {
  it('选中任务柱：关联 = 同族全部任务 + 该任务运行 + 父子链邻居', () => {
    const p = proj([
      makeThought({ id: 'a1', title: '[aiteam-1] 设计' }),
      makeThought({ id: 'a2', title: '[aiteam-2] 创建' }),
      makeThought({ id: 'g1', title: '[gap] 问题' }),
    ], [
      makeRun({ runId: 'r1', thoughtId: 'a1' }),
      makeRun({ runId: 'r2', thoughtId: 'a2' }),
      makeRun({ runId: 'r3', thoughtId: 'g1' }),
    ], [{ parentId: 'a1', childId: 'a2' }])
    const related = relatedIdsOf('column:a1', p)
    expect(related.has('column:a1')).toBe(true)
    expect(related.has('column:a2')).toBe(true)
    expect(related.has('run:r1')).toBe(true)
    expect(related.has('run:r2')).toBe(true)
    expect(related.has('column:g1')).toBe(false)
    expect(related.has('run:r3')).toBe(false)
  })

  it('选中运行末梢：关联 = 所属任务 + 同任务其余运行', () => {
    const p = proj([
      makeThought({ id: 't1' }),
      makeThought({ id: 't2' }),
    ], [
      makeRun({ runId: 'r1', thoughtId: 't1' }),
      makeRun({ runId: 'r2', thoughtId: 't1' }),
      makeRun({ runId: 'r3', thoughtId: 't2' }),
    ])
    const related = relatedIdsOf('run:r1', p)
    expect(related.has('run:r1')).toBe(true)
    expect(related.has('run:r2')).toBe(true)
    expect(related.has('column:t1')).toBe(true)
    expect(related.has('run:r3')).toBe(false)
    expect(related.has('column:t2')).toBe(false)
  })

  it('父子链邻居纳入关联（跨族父子链两端都进关联集）', () => {
    const p = proj([
      makeThought({ id: 'a1', title: '[a] 父' }),
      makeThought({ id: 'b1', title: '[b] 子' }),
    ], [], [{ parentId: 'a1', childId: 'b1' }])
    const related = relatedIdsOf('column:a1', p)
    expect(related.has('column:b1')).toBe(true)
  })

  it('未知节点 → 空集（容错）', () => {
    const p = proj([makeThought({ id: 't1' })], [])
    expect(relatedIdsOf('column:ghost', p).size).toBe(0)
    expect(relatedIdsOf('run:ghost', p).size).toBe(0)
  })
})
