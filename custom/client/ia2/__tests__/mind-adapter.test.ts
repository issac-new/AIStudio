// overlay/custom/client/ia2/__tests__/mind-adapter.test.ts
// 思维大脑纯投影守门（2026-09-15：活大脑基于 kanban 已有任务运行数据长成，
// 无人工编排）。数据源 = /api/graph/mind 投影（MindProjectionDto）：
// 布局确定性、thoughtId 分组、思想核上限 + 折叠、运行时长→末梢半径生长、
// 突触可塑性（近期运行数驱动根突触强度）、末梢神经束发散、记忆脉冲、
// 边完整性、点击导航目标。纯函数零 DOM。
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

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function distFromCenter(node: { x: number; y: number }): number {
  return Math.hypot(node.x - CX, node.y - CY)
}

describe('buildMindScene — 基础形状', () => {
  it('空投影 → 仅核心神经元，无边无脉冲', () => {
    const scene = buildMindScene(proj([], []))
    expect(scene.nodes.map(n => n.kind)).toEqual(['core'])
    expect(scene.edges).toEqual([])
    expect(scene.pulses).toEqual([])
    expect(scene.hiddenThoughts).toBe(0)
    expect(scene.width).toBe(MIND_VIEW_W)
    expect(scene.height).toBe(MIND_VIEW_H)
  })

  it('确定性：同一投影两次构造 deep equal（id 哈希驱动稳定散点）', () => {
    const p = proj(
      [makeThought({ id: 'a', status: 'running' }), makeThought({ id: 'b', status: 'idle' })],
      [makeRun({ runId: 'r1', thoughtId: 'a', durationSec: 300 })],
    )
    expect(buildMindScene(p)).toEqual(buildMindScene(p))
  })
})

describe('buildMindScene — 思想核', () => {
  it('思想核落在皮层散布带（半径 96..168），nav 指向该任务的工作项预选', () => {
    const scene = buildMindScene(proj(
      [makeThought({ id: 't1', title: '晨检', status: 'running' }), makeThought({ id: 't2' })],
      [],
    ))
    const t1 = scene.nodes.find(n => n.id === 'thought:t1')!
    expect(t1).toMatchObject({ kind: 'thought', label: '晨检', status: 'running' })
    const r = distFromCenter(t1)
    expect(r).toBeGreaterThanOrEqual(96 - 1e-6)
    expect(r).toBeLessThanOrEqual(168 + 1e-6)
    expect(t1.to).toEqual({ name: 'ia2.tasks', query: { task: 't1' } })
    const root = scene.edges.find(e => e.id === 'core->thought:t1')!
    expect(root.d.startsWith('M ')).toBe(true)
    expect(root.d).toContain(' C ')
  })

  it('活跃排序：有进行中运行的思想核排前（皮层分布活跃驱动）', () => {
    const scene = buildMindScene(proj(
      [makeThought({ id: 'idle-a', status: 'idle' }), makeThought({ id: 'live-b', status: 'completed' })],
      [makeRun({ runId: 'r1', thoughtId: 'live-b', status: 'running', endedAt: null })],
    ))
    const angle = (id: string) => {
      const n = scene.nodes.find(x => x.id === id)!
      return Math.atan2(n.y - CY, n.x - CX)
    }
    expect(angle('thought:live-b')).toBeLessThan(angle('thought:idle-a'))
  })

  it(`思想核上限 ${MAX_THOUGHTS}：超出折叠进 hiddenThoughts`, () => {
    const thoughts = Array.from({ length: MAX_THOUGHTS + 4 }, (_, i) => makeThought({ id: `t${i}` }))
    const scene = buildMindScene(proj(thoughts, []))
    expect(scene.nodes.filter(n => n.kind === 'thought')).toHaveLength(MAX_THOUGHTS)
    expect(scene.hiddenThoughts).toBe(4)
  })
})

describe('buildMindScene — 突触末梢（运行）', () => {
  it('运行时长 → 末梢半径单调增长（越久枝越长 = 真实活动体量）', () => {
    const runs = [
      makeRun({ runId: 'short', thoughtId: 't1', durationSec: 30 }),
      makeRun({ runId: 'mid', thoughtId: 't1', durationSec: 600 }),
      makeRun({ runId: 'long', thoughtId: 't1', durationSec: 7200 }),
    ]
    const scene = buildMindScene(proj([makeThought({ id: 't1' })], runs))
    const thought = scene.nodes.find(n => n.id === 'thought:t1')!
    const r = (id: string) => dist(scene.nodes.find(n => n.id === `run:${id}`)!, thought)
    expect(r('short')).toBeLessThan(r('mid'))
    expect(r('mid')).toBeLessThan(r('long'))
  })

  it(`单思想核上限 ${RUNS_PER_THOUGHT}：更旧运行折叠进 overflow；最新在列`, () => {
    const runs = Array.from({ length: RUNS_PER_THOUGHT + 2 }, (_, i) =>
      makeRun({ runId: `r${i}`, thoughtId: 't1', startedAt: `2026-09-14T10:0${i}:00Z` }))
    const scene = buildMindScene(proj([makeThought({ id: 't1' })], runs))
    expect(scene.nodes.filter(n => n.kind === 'run')).toHaveLength(RUNS_PER_THOUGHT)
    expect(scene.nodes.find(n => n.id === 'run:r6')).toBeTruthy()
    expect(scene.nodes.find(n => n.id === 'run:r0')).toBeFalsy()
    expect(scene.overflow['thought:t1']).toBe(2)
  })

  it('突触可塑性：近期运行多的思想核根突触强度更高（常用通路增强）', () => {
    const busy = Array.from({ length: 5 }, (_, i) => makeRun({ runId: `b${i}`, thoughtId: 'busy' }))
    const scene = buildMindScene(proj(
      [makeThought({ id: 'busy', status: 'running' }), makeThought({ id: 'quiet', status: 'running' })],
      busy,
    ))
    const busyRoot = scene.edges.find(e => e.id === 'core->thought:busy')!
    const quietRoot = scene.edges.find(e => e.id === 'core->thought:quiet')!
    expect(busyRoot.strength).toBeGreaterThan(quietRoot.strength)
  })

  it('末梢神经束发散 1..3 条（同一 run 恒定分支数）', () => {
    const runs = [makeRun({ runId: 'r1', thoughtId: 't1' }), makeRun({ runId: 'r2', thoughtId: 't1' })]
    const scene = buildMindScene(proj([makeThought({ id: 't1' })], runs))
    for (const runId of ['r1', 'r2']) {
      const edges = scene.edges.filter(e => e.to === `run:${runId}`)
      expect(edges.length).toBeGreaterThanOrEqual(1)
      expect(edges.length).toBeLessThanOrEqual(3)
      expect(new Set(edges.map(e => e.branchNo)).size).toBe(edges.length)
    }
  })

  it('进行中末梢：节点脉冲 + 沿边粒子流；完成/失败无流', () => {
    const runs = [
      makeRun({ runId: 'live', thoughtId: 't1', status: 'running', endedAt: null }),
      makeRun({ runId: 'done', thoughtId: 't1', status: 'completed' }),
      makeRun({ runId: 'bad', thoughtId: 't1', status: 'failed', outcome: 'crashed' }),
    ]
    const scene = buildMindScene(proj([makeThought({ id: 't1', status: 'running' })], runs))
    expect(scene.nodes.find(n => n.id === 'run:live')!.pulse).toBe(true)
    expect(scene.nodes.find(n => n.id === 'run:done')!.pulse).toBe(false)
    expect(scene.edges.filter(e => e.to === 'run:live' && e.flow).length).toBeGreaterThan(0)
    expect(scene.edges.filter(e => e.to === 'run:done' && e.flow)).toHaveLength(0)
    expect(scene.edges.filter(e => e.to === 'run:bad' && e.flow)).toHaveLength(0)
  })

  it('末梢点击 → 工作项区预选该任务（活大脑只读观察）', () => {
    const scene = buildMindScene(proj([makeThought({ id: 't1' })], [makeRun({ runId: 'abc', thoughtId: 't1' })]))
    expect(scene.nodes.find(n => n.id === 'run:abc')!.to)
      .toEqual({ name: 'ia2.tasks', query: { task: 't1' } })
  })
})

describe('buildMindScene — 记忆脉冲（时间生长感）', () => {
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
    // 脉冲 delay 稳定（哈希驱动）——逐 id 对账两次独立构造
    const again = buildMindScene(p)
    expect(again.pulses.map(x => x.id).sort()).toEqual(scene.pulses.map(x => x.id).sort())
    for (const pulse of scene.pulses) {
      const twin = again.pulses.find(q => q.id === pulse.id)
      expect(twin).toBeDefined()
      expect(twin!.delayS).toBe(pulse.delayS)
    }
  })
})

describe('buildMindScene — 边完整性', () => {
  it('core 无入边；每个思想核有 core 根突触；每个末梢有 1..3 束；边引用节点均存在', () => {
    const p = proj(
      [makeThought({ id: 't1', status: 'running' }), makeThought({ id: 't2' })],
      [makeRun({ runId: 'r1', thoughtId: 't1', durationSec: 300 }), makeRun({ runId: 'r2', thoughtId: 't2' })],
    )
    const scene = buildMindScene(p)
    const ids = new Set(scene.nodes.map(n => n.id))
    const inbound = new Set<string>()
    for (const e of scene.edges) {
      expect(ids.has(e.from)).toBe(true)
      expect(ids.has(e.to)).toBe(true)
      expect(e.d.startsWith('M ')).toBe(true)
      expect(e.d).toContain(' C ')
      inbound.add(e.to)
    }
    expect(inbound.has('core')).toBe(false)
    for (const n of scene.nodes) {
      if (n.kind === 'core') continue
      expect(inbound.has(n.id)).toBe(true)
    }
  })
})
