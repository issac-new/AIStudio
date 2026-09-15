// overlay/custom/client/ia2/__tests__/mind-adapter.test.ts
// 思维图谱本体论守门（2026-09-15 重设计）：实体（任务/运行）→ 关系（孕育/产生）→
// 状态分区 → 区内时序 四层语义。断言：分区归属正确、区内新在内旧在外、关系边
// 有向语义、分区界标计数、思想核上限折叠、末梢时长生长、记忆脉冲、边完整性。
import { describe, it, expect } from 'vitest'
import {
  buildMindScene, MIND_VIEW_W, MIND_VIEW_H,
  RUNS_PER_THOUGHT, MAX_THOUGHTS,
  type MindProjectionDto, type MindThoughtDto, type MindRunDto,
} from '../adapters/mind'

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

const CX = MIND_VIEW_W / 2
const CY = MIND_VIEW_H / 2

function angleOf(node: { x: number; y: number }): number {
  return Math.atan2(node.y - CY, node.x - CX)
}

function distFromCenter(node: { x: number; y: number }): number {
  return Math.hypot(node.x - CX, node.y - CY)
}

describe('buildMindScene — 本体论分层', () => {
  it('空投影 → 仅核心，无边无脉冲无分区', () => {
    const scene = buildMindScene(proj([], []))
    expect(scene.nodes.map(n => n.kind)).toEqual(['core'])
    expect(scene.edges).toEqual([])
    expect(scene.zones).toEqual([])
    expect(scene.hiddenThoughts).toBe(0)
  })

  it('确定性：同一投影两次构造 deep equal', () => {
    const p = proj(
      [makeThought({ id: 'a', status: 'running' }), makeThought({ id: 'b', status: 'idle' })],
      [makeRun({ runId: 'r1', thoughtId: 'a', durationSec: 300 })],
    )
    expect(buildMindScene(p)).toEqual(buildMindScene(p))
  })

  it('实体分层：思想核与末梢是两类一等实体，kind 可区分', () => {
    const scene = buildMindScene(proj(
      [makeThought({ id: 't1' })],
      [makeRun({ runId: 'r1', thoughtId: 't1' })],
    ))
    expect(scene.nodes.some(n => n.kind === 'core')).toBe(true)
    expect(scene.nodes.some(n => n.kind === 'thought')).toBe(true)
    expect(scene.nodes.some(n => n.kind === 'run')).toBe(true)
  })
})

describe('buildMindScene — 状态分区（语义可读）', () => {
  it('思想核按状态落对应分区（zone 字段 = 分区语义）', () => {
    const scene = buildMindScene(proj([
      makeThought({ id: 'run-1', status: 'running' }),
      makeThought({ id: 'blk-1', status: 'blocked' }),
      makeThought({ id: 'done-1', status: 'completed' }),
      makeThought({ id: 'arch-1', status: 'archived' }),
    ], []))
    expect(scene.nodes.find(n => n.id === 'thought:run-1')!.zone).toBe('running')
    expect(scene.nodes.find(n => n.id === 'thought:blk-1')!.zone).toBe('blocked')
    expect(scene.nodes.find(n => n.id === 'thought:done-1')!.zone).toBe('completed')
    expect(scene.nodes.find(n => n.id === 'thought:arch-1')!.zone).toBe('archived')
  })

  it('分区界标：有任务的分区产出 zone（含计数），空分区不产出', () => {
    const scene = buildMindScene(proj([
      makeThought({ id: 'a', status: 'running' }),
      makeThought({ id: 'b', status: 'running' }),
      makeThought({ id: 'c', status: 'completed' }),
    ], []))
    const runningZone = scene.zones.find(z => z.key === 'running')
    expect(runningZone).toBeDefined()
    expect(runningZone!.count).toBe(2)
    expect(scene.zones.find(z => z.key === 'completed')!.count).toBe(1)
    // 无 failed 任务 → 无 failed 分区
    expect(scene.zones.find(z => z.key === 'failed')).toBeUndefined()
  })

  it('分区内时序：同区任务按最近活动排序（新在内、旧在外）', () => {
    const scene = buildMindScene(proj([
      makeThought({ id: 'old', status: 'completed' }),
      makeThought({ id: 'new', status: 'completed' }),
    ], [
      makeRun({ runId: 'ro', thoughtId: 'old', startedAt: '2026-09-01T10:00:00Z' }),
      makeRun({ runId: 'rn', thoughtId: 'new', startedAt: '2026-09-14T10:00:00Z' }),
    ]))
    const oldN = scene.nodes.find(n => n.id === 'thought:old')!
    const newN = scene.nodes.find(n => n.id === 'thought:new')!
    // 同区（completed）内，新活动的半径更小（更靠内）
    expect(distFromCenter(newN)).toBeLessThan(distFromCenter(oldN))
  })

  it('分区角度域：running 区与 completed 区的角度范围不重叠（语义分区隔离）', () => {
    const scene = buildMindScene(proj([
      makeThought({ id: 'r1', status: 'running' }),
      makeThought({ id: 'c1', status: 'completed' }),
    ], []))
    // atan2 跨 ±π 断裂——归一化到 [0, 2π) 再断言分区归属
    const norm = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
    const rAngle = norm(angleOf(scene.nodes.find(n => n.id === 'thought:r1')!))
    const cAngle = norm(angleOf(scene.nodes.find(n => n.id === 'thought:c1')!))
    // running 区 [-0.55π, -0.05π] 归一化后 ≈ [4.56, 6.13]；completed 区 [0.95π, 1.45π] ≈ [2.98, 4.55]
    expect(rAngle).toBeGreaterThan(norm(-Math.PI * 0.55) - 1e-6)
    expect(rAngle).toBeLessThan(norm(-Math.PI * 0.05) + 1e-6)
    expect(cAngle).toBeGreaterThan(Math.PI * 0.95 - 1e-6)
    expect(cAngle).toBeLessThan(Math.PI * 1.45 + 1e-6)
    // 两区角距 ≥ π/2（语义隔离；单元素区中点距恰为 π/2 边界）
    const gap = Math.abs(rAngle - cAngle)
    expect(Math.min(gap, Math.PI * 2 - gap)).toBeGreaterThanOrEqual(Math.PI * 0.5 - 1e-6)
  })
})

describe('buildMindScene — 关系（孕育/产生）', () => {
  it('core → 思想核 = 孕育关系边（有机曲线，可塑性边宽）', () => {
    const scene = buildMindScene(proj([makeThought({ id: 't1' })], []))
    const edge = scene.edges.find(e => e.id === 'core->thought:t1')!
    expect(edge.from).toBe('core')
    expect(edge.to).toBe('thought:t1')
    expect(edge.d.startsWith('M ')).toBe(true)
    expect(edge.d).toContain(' C ')
  })

  it('思想核 → 末梢 = 产生关系边（属于该任务）', () => {
    const scene = buildMindScene(proj([makeThought({ id: 't1' })], [makeRun({ runId: 'r1', thoughtId: 't1' })]))
    const edge = scene.edges.find(e => e.id === 'thought:t1->run:r1')!
    expect(edge.from).toBe('thought:t1')
    expect(edge.to).toBe('run:r1')
  })

  it('可塑性：运行多的任务孕育边更粗（常用通路增强）', () => {
    const busy = Array.from({ length: 5 }, (_, i) => makeRun({ runId: `b${i}`, thoughtId: 'busy' }))
    const scene = buildMindScene(proj(
      [makeThought({ id: 'busy', status: 'running' }), makeThought({ id: 'quiet', status: 'running' })],
      busy,
    ))
    const busyEdge = scene.edges.find(e => e.id === 'core->thought:busy')!
    const quietEdge = scene.edges.find(e => e.id === 'core->thought:quiet')!
    expect(busyEdge.strength).toBeGreaterThan(quietEdge.strength)
  })
})

describe('buildMindScene — 末梢（运行尝试）', () => {
  it('末梢半径随运行时长生长（线性单调，可辨）', () => {
    const runs = [
      makeRun({ runId: 'short', thoughtId: 't1', durationSec: 30 }),
      makeRun({ runId: 'mid', thoughtId: 't1', durationSec: 600 }),
      makeRun({ runId: 'long', thoughtId: 't1', durationSec: 3000 }),
    ]
    const scene = buildMindScene(proj([makeThought({ id: 't1' })], runs))
    const thought = scene.nodes.find(n => n.id === 'thought:t1')!
    const r = (id: string) => {
      const n = scene.nodes.find(x => x.id === `run:${id}`)!
      return Math.hypot(n.x - thought.x, n.y - thought.y)
    }
    expect(r('short')).toBeLessThan(r('mid'))
    expect(r('mid')).toBeLessThan(r('long'))
  })

  it('末梢副标 = 运行时长（可读语义）', () => {
    const scene = buildMindScene(proj([makeThought({ id: 't1' })], [
      makeRun({ runId: 'q', thoughtId: 't1', durationSec: 45 }),
      makeRun({ runId: 'm', thoughtId: 't1', durationSec: 900 }),
    ]))
    expect(scene.nodes.find(n => n.id === 'run:q')!.sub).toBe('45s')
    expect(scene.nodes.find(n => n.id === 'run:m')!.sub).toBe('15m')
  })

  it(`单思想核上限 ${RUNS_PER_THOUGHT}：更旧运行折叠进 overflow`, () => {
    const runs = Array.from({ length: RUNS_PER_THOUGHT + 2 }, (_, i) =>
      makeRun({ runId: `r${i}`, thoughtId: 't1', startedAt: `2026-09-14T10:0${i}:00Z` }))
    const scene = buildMindScene(proj([makeThought({ id: 't1' })], runs))
    expect(scene.nodes.filter(n => n.kind === 'run')).toHaveLength(RUNS_PER_THOUGHT)
    expect(scene.overflow['thought:t1']).toBe(2)
  })

  it('末梢点击 → 工作项区预选该任务（只读观察）', () => {
    const scene = buildMindScene(proj([makeThought({ id: 't1' })], [makeRun({ runId: 'abc', thoughtId: 't1' })]))
    expect(scene.nodes.find(n => n.id === 'run:abc')!.to)
      .toEqual({ name: 'ia2.tasks', query: { task: 't1' } })
  })
})

describe('buildMindScene — 记忆脉冲与完整性', () => {
  it('进行中思想核/末梢产生 spark 脉冲；待介入产生 interrupt 脉冲', () => {
    const p = proj(
      [makeThought({ id: 't1', status: 'running' }), makeThought({ id: 't2', status: 'awaiting-review' })],
      [
        makeRun({ runId: 'hot', thoughtId: 't1', status: 'running', endedAt: null }),
        makeRun({ runId: 'wait', thoughtId: 't2', status: 'awaiting-input', endedAt: null }),
      ],
    )
    const scene = buildMindScene(p)
    const kinds = scene.pulses.map(x => `${x.kind}:${x.nodeId}`)
    expect(kinds).toContain('spark:core')
    expect(kinds).toContain('spark:run:hot')
    expect(kinds).toContain('interrupt:run:wait')
    const again = buildMindScene(p)
    expect(again.pulses.map(x => x.id).sort()).toEqual(scene.pulses.map(x => x.id).sort())
  })

  it('边完整性：core 无入边；每个思想核/末梢有入边；边引用节点均存在', () => {
    const scene = buildMindScene(proj(
      [makeThought({ id: 't1', status: 'running' }), makeThought({ id: 't2' })],
      [makeRun({ runId: 'r1', thoughtId: 't1', durationSec: 300 })],
    ))
    const ids = new Set(scene.nodes.map(n => n.id))
    const inbound = new Set<string>()
    for (const e of scene.edges) {
      expect(ids.has(e.from)).toBe(true)
      expect(ids.has(e.to)).toBe(true)
      inbound.add(e.to)
    }
    expect(inbound.has('core')).toBe(false)
    for (const n of scene.nodes) {
      if (n.kind === 'core') continue
      expect(inbound.has(n.id)).toBe(true)
    }
  })

  it(`思想核上限 ${MAX_THOUGHTS}：超出折叠进 hiddenThoughts`, () => {
    const thoughts = Array.from({ length: MAX_THOUGHTS + 6 }, (_, i) => makeThought({ id: `t${i}` }))
    const scene = buildMindScene(proj(thoughts, []))
    expect(scene.nodes.filter(n => n.kind === 'thought').length).toBeLessThanOrEqual(MAX_THOUGHTS)
    expect(scene.hiddenThoughts).toBe(6)
  })
})
