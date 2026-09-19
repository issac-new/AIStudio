// overlay/custom/client/ia2/__tests__/flow-adapter.test.ts
// v12 工作流纯适配器守门（2026-09-19）：会话∪循环统一列表投影 / 过滤 /
// 任务挂接（tenant 六段式 + session_id + 契约 persistedTaskId 三路）/
// 动态流归并。全部纯函数，视图不自算。
import { describe, it, expect } from 'vitest'
import {
  buildSessionRows,
  buildLoopRows,
  filterStreams,
  linkedTaskIdsOfSession,
  linkedTasksOfLoop,
  mergeFeed,
  LOOP_STAGE_ORDER,
} from '../adapters/flow'
import type { LoopInstance } from '@/custom/loop/types'
import type { TaskContract } from '@/custom/loop/types'

const NOW = Date.parse('2026-09-19T15:00:00Z')

// ── 会话行投影 ──

describe('buildSessionRows — 会话∪单聊统一投影（按最近活动排序）', () => {
  const hooks = {
    unreadOf: (id: string) => (id === 'r1' ? 2 : 0),
    taskIdsOf: (id: string) => (id === 'r1' ? ['t1', 't2'] : id === 'c1' ? ['t3'] : []),
    teamTagOf: (id: string) => (id === 'r1' ? 'swarm' : ''),
    dutyNameOf: (id: string) => (id === 'r2' ? 'TL' : null),
  }
  it('投影字段齐（unread/taskCount/teamTag/duty），null 活动排末位，其余按时间倒序', () => {
    const rows = buildSessionRows(
      [
        { kind: 'room', id: 'r1', name: '应急指挥中心', lastActivityAt: 200 },
        { kind: 'chat', id: 'c1', name: 'agent 会话', lastActivityAt: 300 },
        { kind: 'room', id: 'r2', name: '老房间', lastActivityAt: null },
      ],
      hooks,
    )
    expect(rows.map(r => r.id)).toEqual(['c1', 'r1', 'r2'])
    expect(rows[1]).toMatchObject({
      kind: 'room', id: 'r1', name: '应急指挥中心',
      unread: 2, taskCount: 2, teamTag: 'swarm', dutyName: null, lastActivityAt: 200,
    })
    expect(rows[2]).toMatchObject({ dutyName: 'TL', lastActivityAt: null })
  })
})

// ── 循环行投影 ──

function loop(partial: Partial<LoopInstance> & Pick<LoopInstance, 'id' | 'name'>): LoopInstance {
  return {
    goal: '', stopCondition: '', pattern: 'daily-triage',
    schedule: { mode: 'manual' }, stage: 'discovery', status: 'running',
    autonomyLevel: 'L2', stateAdapter: 'local',
    createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-19T14:00:00Z',
    lastTickAt: null, nextTickAt: null,
    stats: { totalIterations: 3, tasksDiscovered: 4, tasksCompleted: 2, tasksBlocked: 0, totalCost: 0, currentIteration: 3 },
    ...partial,
  } as LoopInstance
}

describe('buildLoopRows — 阶段指针/门等待/阻塞/进度公式', () => {
  it('stageIndex 按 discovery→scheduling 序；running→run 半程进度', () => {
    const [row] = buildLoopRows([loop({ id: 'l1', name: 'release-pipeline', stage: 'validation' })], NOW)
    expect(row.stageIndex).toBe(LOOP_STAGE_ORDER.indexOf('validation'))
    expect(row.stageTone).toBe('run')
    expect(row.progressPct).toBe(Math.round(((2 + 0.5) / 5) * 100)) // 50
  })
  it('awaiting-review → run 调 + awaitingYou（门=等你决策）', () => {
    const [row] = buildLoopRows([loop({ id: 'l1', name: 'lp', stage: 'persistence', status: 'awaiting-review' })], NOW)
    expect(row.stageTone).toBe('run')
    expect(row.awaitingYou).toBe(true)
    expect(row.statusKey).toBe('awaitingYou')
  })
  it('blocked → err 调 + blocked 标记；completed → done 调 + 100%', () => {
    const rows = buildLoopRows([
      loop({ id: 'l1', name: 'fleet-regress', stage: 'persistence', status: 'blocked' }),
      loop({ id: 'l2', name: 'done-loop', stage: 'scheduling', status: 'completed' }),
      loop({ id: 'l3', name: 'failed-loop', stage: 'handoff', status: 'failed' }),
    ], NOW)
    expect(rows[0]).toMatchObject({ stageTone: 'err', blocked: true, statusKey: 'blocked' })
    expect(rows[1]).toMatchObject({ stageTone: 'done', progressPct: 100, statusKey: 'completed' })
    expect(rows[2]).toMatchObject({ stageTone: 'err', statusKey: 'failed' })
  })
  it('updatedAt 投影为 ms', () => {
    const [row] = buildLoopRows([loop({ id: 'l1', name: 'lp' })], NOW)
    expect(row.updatedAt).toBe(Date.parse('2026-09-19T14:00:00Z'))
  })
})

// ── 过滤 ──

describe('filterStreams — 类型 chips + 名称/任务号搜索', () => {
  const rows = [
    { kind: 'room' as const, id: 'r1', name: '应急指挥中心', taskIds: ['t-402'] },
    { kind: 'chat' as const, id: 'c1', name: 'agent 会话', taskIds: [] },
    { kind: 'loop' as const, id: 'l1', name: 'release-pipeline', taskIds: ['t-398'] },
  ]
  it('kind 过滤：session=room∪chat，loop=循环，all=全部', () => {
    expect(filterStreams(rows, { kind: 'session', query: '' }).map(r => r.id)).toEqual(['r1', 'c1'])
    expect(filterStreams(rows, { kind: 'loop', query: '' }).map(r => r.id)).toEqual(['l1'])
    expect(filterStreams(rows, { kind: 'all', query: '' })).toHaveLength(3)
  })
  it('query 匹配名称（大小写不敏感）或任务号全等/前缀', () => {
    expect(filterStreams(rows, { kind: 'all', query: '指挥' }).map(r => r.id)).toEqual(['r1'])
    expect(filterStreams(rows, { kind: 'all', query: 'RELEASE' }).map(r => r.id)).toEqual(['l1'])
    expect(filterStreams(rows, { kind: 'all', query: 't-402' }).map(r => r.id)).toEqual(['r1'])
    expect(filterStreams(rows, { kind: 'all', query: 't-' }).map(r => r.id)).toEqual(['r1', 'l1'])
  })
})

// ── 任务挂接 ──

describe('linkedTaskIdsOfSession — tenant 六段式(房间+会话) / session_id 双路', () => {
  const tasks = [
    { id: 't1', tenant: '群:话题:@u:!roomA:sessA:matrix', session_id: null },   // 全格式
    { id: 't2', tenant: null, session_id: 'sessA' },                            // 显式 session_id
    { id: 't3', tenant: 'matrix:!roomA:标签', session_id: null },               // 旧格式 matrix:<roomId>:
    { id: 't4', tenant: '群:话题:@u:!roomB:sessB:matrix', session_id: null },   // 别的房间
  ]
  it('房间选择：命中六段式 roomId 与旧格式 matrix:<roomId>', () => {
    expect(linkedTaskIdsOfSession({ kind: 'room', id: '!roomA' }, tasks)).toEqual(['t1', 't3'])
  })
  it('会话选择：命中六段式 sessionId 与显式 session_id', () => {
    expect(linkedTaskIdsOfSession({ kind: 'chat', id: 'sessA' }, tasks)).toEqual(['t1', 't2'])
  })
})

describe('linkedTasksOfLoop — 契约 persistedTaskId → 任务（保序去重，缺失容错）', () => {
  const tasks = [
    { id: 't1', title: 'A' }, { id: 't2', title: 'B' }, { id: 't3', title: 'C' },
  ] as never[]
  const contracts = [
    { id: 'c1', persistedTaskId: 't2' },
    { id: 'c2', persistedTaskId: 't1' },
    { id: 'c3', persistedTaskId: null },
    { id: 'c4', persistedTaskId: 't2' },      // 重复指向
    { id: 'c5', persistedTaskId: 't-missing' }, // 任务已删
  ] as unknown as TaskContract[]
  it('按契约序返回去重任务，缺失/未持久化跳过', () => {
    const out = linkedTasksOfLoop(contracts, tasks)
    expect(out.map(t => (t as { id: string }).id)).toEqual(['t2', 't1'])
  })
})

// ── 动态流 ──

describe('mergeFeed — 循环事件 ∪ 运行尾部 ∪ 任务状态时戳，倒序封顶', () => {
  it('三源归并按 ts 倒序、cap 生效、ts 归一为 ms', () => {
    const rows = mergeFeed(
      [
        { type: 'loop.stage-transition', ts: '2026-09-19T14:00:00Z', loopName: 'release-pipeline', to: 'validation' },
        { type: 'loop.escalated', ts: '2026-09-19T13:00:00Z', loopName: 'fleet-regress' },
      ],
      [{ runId: 'run-8f21', events: [{ type: 'graph.node-started', ts: '2026-09-19T15:00:00Z', nodeId: 'validation' }] }],
      [{ id: 't-402', title: 'v2.28 发布', createdAt: Date.parse('2026-09-17T05:00:00Z'), startedAt: null, completedAt: Date.parse('2026-09-19T14:31:00Z'), status: 'review' }],
      NOW,
    )
    expect(rows).toHaveLength(5)
    expect(rows[0]).toMatchObject({ icon: 'run', ts: Date.parse('2026-09-19T15:00:00Z') })
    expect(rows.map(r => r.icon)).toEqual(['run', 'task', 'run', 'gate', 'task'])
    expect(rows[0].key).toContain('ia2.feed.')
    expect(rows[4].ts).toBe(Date.parse('2026-09-17T05:00:00Z'))
    // cap
    expect(mergeFeed(
      Array.from({ length: 30 }, (_, i) => ({ type: 'loop.tick-complete', ts: new Date(NOW - i * 1000).toISOString(), loopName: 'lp' })),
      [], [], NOW, 5),
    ).toHaveLength(5)
  })
})
