// overlay/custom/client/ia2/__tests__/mind3d-adapter.test.ts
// 3D 思维图谱纯投影守门（2026-09-15 用户裁决：Three.js 立体图——可缩放/旋转/
// 层级切换）。断言本体论 → 3D 语义映射：状态→高度层、任务→层内平面节点、
// 运行→附属点、核心柱贯穿、层界标计数、上限折叠、确定性。纯函数零 Three.js。
import { describe, it, expect } from 'vitest'
import {
  buildMind3DScene, MIND3D_LAYER_GAP,
  type MindProjectionDto,
} from '../adapters/mind3d'
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

function proj(thoughts: MindThoughtDto[], runs: MindRunDto[]): MindProjectionDto {
  return { thoughts, runs, available: true }
}

describe('buildMind3DScene — 本体论 → 3D 映射', () => {
  it('空投影 → 仅核心柱，无边无层', () => {
    const scene = buildMind3DScene(proj([], []))
    expect(scene.nodes.map(n => n.kind)).toEqual(['core'])
    expect(scene.edges).toEqual([])
    expect(scene.layers).toEqual([])
  })

  it('确定性：同一投影两次构造 deep equal', () => {
    const p = proj([makeThought({ id: 'a', status: 'running' })], [makeRun({ runId: 'r1', thoughtId: 'a' })])
    expect(buildMind3DScene(p)).toEqual(buildMind3DScene(p))
  })

  it('状态 → 高度层：running 顶、awaiting/blocked 中、completed/failed 下、idle/archived 底', () => {
    const scene = buildMind3DScene(proj([
      makeThought({ id: 'run', status: 'running' }),
      makeThought({ id: 'wait', status: 'awaiting-review' }),
      makeThought({ id: 'done', status: 'completed' }),
      makeThought({ id: 'arch', status: 'archived' }),
    ], []))
    const y = (id: string) => scene.nodes.find(n => n.id === `thought:${id}`)!.y
    expect(y('run')).toBe(3 * MIND3D_LAYER_GAP)
    expect(y('wait')).toBe(2 * MIND3D_LAYER_GAP)
    expect(y('done')).toBe(1 * MIND3D_LAYER_GAP)
    expect(y('arch')).toBe(0)
    // 层序单调（上 > 下）
    expect(y('run')).toBeGreaterThan(y('wait'))
    expect(y('wait')).toBeGreaterThan(y('done'))
    expect(y('done')).toBeGreaterThan(y('arch'))
  })

  it('层界标：有任务的层产出 layer（含计数），空层不产出', () => {
    const scene = buildMind3DScene(proj([
      makeThought({ id: 'a', status: 'running' }),
      makeThought({ id: 'b', status: 'running' }),
      makeThought({ id: 'c', status: 'completed' }),
    ], []))
    const running = scene.layers.find(l => l.key === 'running')
    expect(running).toBeDefined()
    expect(running!.count).toBe(2)
    expect(running!.y).toBe(3 * MIND3D_LAYER_GAP)
    expect(scene.layers.find(l => l.key === 'done')!.count).toBe(1)
    expect(scene.layers.find(l => l.key === 'awaiting')).toBeUndefined()
  })

  it('核心柱贯穿各层（y 居中于层区间）', () => {
    const scene = buildMind3DScene(proj([makeThought({ id: 't1', status: 'running' })], []))
    const core = scene.nodes.find(n => n.kind === 'core')!
    expect(core.x).toBe(0)
    expect(core.z).toBe(0)
    expect(core.y).toBe(MIND3D_LAYER_GAP * 1.5)
  })

  it('思想核在层平面散布（XZ 平面；半径带内，不坍缩到中心）', () => {
    const scene = buildMind3DScene(proj([
      makeThought({ id: 'a', status: 'running' }),
      makeThought({ id: 'b', status: 'running' }),
      makeThought({ id: 'c', status: 'running' }),
    ], []))
    const thoughts = scene.nodes.filter(n => n.kind === 'thought')
    expect(thoughts).toHaveLength(3)
    for (const t of thoughts) {
      expect(t.y).toBe(3 * MIND3D_LAYER_GAP)
      const planarR = Math.hypot(t.x, t.z)
      expect(planarR).toBeGreaterThan(30) // 不坍缩到中心轴
    }
  })

  it('末梢环绕所属任务（附属点，同一层）', () => {
    const scene = buildMind3DScene(proj([makeThought({ id: 't1' })], [
      makeRun({ runId: 'r1', thoughtId: 't1' }),
      makeRun({ runId: 'r2', thoughtId: 't1' }),
    ]))
    const thought = scene.nodes.find(n => n.id === 'thought:t1')!
    for (const run of scene.nodes.filter(n => n.kind === 'run')) {
      const d = Math.hypot(run.x - thought.x, run.z - thought.z)
      expect(d).toBeGreaterThan(0)
      expect(d).toBeLessThan(80) // 附属点在任务近旁
      expect(Math.abs(run.y - thought.y)).toBeLessThan(20) // 同一层附近
    }
  })

  it('关系连线：core→任务（孕育）+ 任务→末梢（产生），端点坐标在边对象上', () => {
    const scene = buildMind3DScene(proj([makeThought({ id: 't1' })], [makeRun({ runId: 'r1', thoughtId: 't1' })]))
    const rootEdge = scene.edges.find(e => e.id === 'core->thought:t1')!
    expect(rootEdge.from).toBe('core')
    expect(rootEdge.fromPos.x).toBe(0)
    expect(rootEdge.toPos).toMatchObject({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) })
    const leafEdge = scene.edges.find(e => e.id === 'thought:t1->run:r1')!
    expect(leafEdge.from).toBe('thought:t1')
  })

  it('可塑性：运行多的任务孕育边更强', () => {
    const busy = Array.from({ length: 4 }, (_, i) => makeRun({ runId: `b${i}`, thoughtId: 'busy' }))
    const scene = buildMind3DScene(proj(
      [makeThought({ id: 'busy', status: 'running' }), makeThought({ id: 'quiet', status: 'running' })],
      busy,
    ))
    expect(scene.edges.find(e => e.id === 'core->thought:busy')!.strength)
      .toBeGreaterThan(scene.edges.find(e => e.id === 'core->thought:quiet')!.strength)
  })

  it('末梢副标 = 运行时长；点击 → 工作项区预选该任务', () => {
    const scene = buildMind3DScene(proj([makeThought({ id: 't1' })], [
      makeRun({ runId: 'q', thoughtId: 't1', durationSec: 900 }),
    ]))
    const run = scene.nodes.find(n => n.id === 'run:q')!
    expect(run.sub).toBe('15m')
    expect(run.to).toEqual({ name: 'ia2.tasks', query: { task: 't1' } })
  })

  it('思想核上限 24：超出折叠进 hiddenThoughts', () => {
    const thoughts = Array.from({ length: 30 }, (_, i) => makeThought({ id: `t${i}` }))
    const scene = buildMind3DScene(proj(thoughts, []))
    expect(scene.nodes.filter(n => n.kind === 'thought').length).toBeLessThanOrEqual(24)
    expect(scene.hiddenThoughts).toBe(6)
  })
})
