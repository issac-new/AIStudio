// overlay/custom/client/ia2/__tests__/mind3d-adapter.test.ts
// 3D 思维图谱纯投影守门（2026-09-15 形态重构：无中心聚类景观）。
// 用户裁决：去核心轴/思维原点——没有「核心」，思维图按聚类分类呈现。
// 断言：无核心节点、聚类分群（命名前缀族/父子树连通域/单任务族）、族质心散布、
// 族内柱群、柱粗细=运行史/柱高=活跃度、关系弧（父子委派）、末梢环绕、萌芽标记、
// 皮层地形、上限折叠、确定性。纯函数零 Three.js。
import { describe, it, expect } from 'vitest'
import {
  buildMind3DScene, LANDSCAPE_R, MAX_THOUGHTS, RUNS_PER_THOUGHT,
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

describe('buildMind3DScene — 无中心聚类景观', () => {
  it('空投影 → 无节点无边无族（无核心柱——思维原点已去除）', () => {
    const scene = buildMind3DScene(proj([], []))
    expect(scene.nodes).toEqual([])
    expect(scene.edges).toEqual([])
    expect(scene.clusters).toEqual([])
    expect(scene.terrain.length).toBeGreaterThan(0)
    expect(scene.hiddenThoughts).toBe(0)
  })

  it('无中心原点：不存在 core 节点，无柱精确落在 (0,*,0)', () => {
    const scene = buildMind3DScene(proj([
      makeThought({ id: 'a', status: 'running' }),
      makeThought({ id: 'b', status: 'idle' }),
    ], []))
    expect(scene.nodes.find(n => (n as { kind: string }).kind === 'core')).toBeUndefined()
    for (const n of scene.nodes.filter(x => x.kind === 'column')) {
      expect(Math.abs(n.x) > 1e-6 || Math.abs(n.z) > 1e-6).toBe(true)
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

describe('buildMind3DScene — 聚类分类（核心语义）', () => {
  it('命名前缀族聚类：[aiteam-*] 同族、[gap] 同族、无前缀自成族', () => {
    const scene = buildMind3DScene(proj([
      makeThought({ id: 't1', title: '[aiteam-1] 设计能力矩阵' }),
      makeThought({ id: 't2', title: '[aiteam-2] 创建 board' }),
      makeThought({ id: 't3', title: '[gap] platform: 会话无持久化' }),
      makeThought({ id: 't4', title: '[gap] loop graph 静态快照' }),
      makeThought({ id: 't5', title: '无前缀任务' }),
    ], []))
    const clusterOf = (id: string) => scene.nodes.find(n => n.id === `column:${id}`)!.cluster
    expect(clusterOf('t1')).toBe(clusterOf('t2'))
    expect(clusterOf('t3')).toBe(clusterOf('t4'))
    expect(clusterOf('t1')).not.toBe(clusterOf('t3'))
    expect(clusterOf('t5')).not.toBe(clusterOf('t1'))
    expect(scene.clusters.find(c => c.label === 'aiteam')?.count).toBe(2)
    expect(scene.clusters.find(c => c.label === 'gap')?.count).toBe(2)
  })

  it('父子树连通域聚类：无前缀任务归到根任务族', () => {
    const scene = buildMind3DScene(proj([
      makeThought({ id: 'root', title: '根任务' }),
      makeThought({ id: 'child', title: '子任务' }),
      makeThought({ id: 'grandchild', title: '孙任务' }),
    ], [], [
      { parentId: 'root', childId: 'child' },
      { parentId: 'child', childId: 'grandchild' },
    ]))
    const clusterOf = (id: string) => scene.nodes.find(n => n.id === `column:${id}`)!.cluster
    expect(clusterOf('child')).toBe(clusterOf('root'))
    expect(clusterOf('grandchild')).toBe(clusterOf('root'))
  })

  it('族质心散布在景观平面（族间分离，不坍缩到一点）', () => {
    const scene = buildMind3DScene(proj([
      makeThought({ id: 'a', title: '[x] 任务a' }),
      makeThought({ id: 'b', title: '[y] 任务b' }),
      makeThought({ id: 'c', title: '[z] 任务c' }),
    ], []))
    expect(scene.clusters).toHaveLength(3)
    const positions = scene.clusters.map(c => [c.cx, c.cz])
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const d = Math.hypot(positions[i][0] - positions[j][0], positions[i][1] - positions[j][1])
        expect(d).toBeGreaterThan(1)
      }
    }
  })
})

describe('buildMind3DScene — 皮层柱形态（任务实体）', () => {
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
    expect(busyRun.h).toBeGreaterThan(busyDone.h)
    expect(busyDone.h).toBeGreaterThan(quietIdle.h)
  })

  it('皮层地形起伏（脑回高度场非零且确定）', () => {
    const scene = buildMind3DScene(proj([], []))
    const ys = scene.terrain.map(p => p.y)
    expect(Math.max(...ys)).toBeGreaterThan(0)
    expect(Math.min(...ys)).toBeLessThan(0)
    expect(buildMind3DScene(proj([], [])).terrain).toEqual(scene.terrain)
  })

  it('萌芽标记：近 24h 新任务 budding=true；旧任务 false', () => {
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
    expect(wait.pulse).toBe(false)
    expect(wait.to).toEqual({ name: 'ia2.inbox', query: { task: 'wait' } })
    expect(scene.nodes.find(n => n.id === 'column:run')!.pendingAlert).toBeFalsy()
  })
})

describe('buildMind3DScene — 关系与末梢', () => {
  it('父子委派弧：task_links → 柱间有向弧（delegate 语义，顶点高于两端）', () => {
    const scene = buildMind3DScene(proj([
      makeThought({ id: 'parent' }),
      makeThought({ id: 'child' }),
    ], [], [{ parentId: 'parent', childId: 'child' }]))
    const edge = scene.edges.find(e => e.id === 'rel:parent->child')!
    expect(edge.relKind).toBe('delegate')
    expect(edge.from).toBe('column:parent')
    expect(edge.to).toBe('column:child')
    expect(edge.apexY).toBeGreaterThan(edge.fromPos.y)
    expect(edge.apexY).toBeGreaterThan(edge.toPos.y)
    const dangling = buildMind3DScene(proj([makeThought({ id: 'parent' })], [], [{ parentId: 'parent', childId: 'ghost' }]))
    expect(dangling.edges.filter(e => e.id.startsWith('rel:'))).toHaveLength(0)
  })

  it('末梢环绕所属任务柱（同族同簇）；产生弧在柱顶', () => {
    const scene = buildMind3DScene(proj([makeThought({ id: 't1' })], [
      makeRun({ runId: 'r1', thoughtId: 't1' }),
      makeRun({ runId: 'r2', thoughtId: 't1' }),
    ]))
    const col = scene.nodes.find(n => n.id === 'column:t1')!
    for (const run of scene.nodes.filter(n => n.kind === 'run')) {
      expect(run.cluster).toBe(col.cluster)
      const d = Math.hypot(run.x - col.x, run.z - col.z)
      expect(d).toBeGreaterThan(0)
      expect(d).toBeLessThan(60)
      expect(run.y).toBeGreaterThan(col.y)
    }
    const spawn = scene.edges.find(e => e.id === 'column:t1->run:r1')!
    expect(spawn.relKind).toBe('spawn')
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
