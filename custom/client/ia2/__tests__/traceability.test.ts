// overlay/custom/client/ia2/__tests__/traceability.test.ts
// P3 Task 7 — 追溯矩阵纯函数聚合（重点测试面）：
//   buildTraceMatrix        loop 分组矩阵：需求(goal) → run(状态/迭代) → 产出任务 → 验证轮次
//   persistedLinksForTask   任务 → run 反查（loop.persisted 按 taskId 显式匹配）
//   persistedTaskLinksOfRun run → 任务（replay 事件 payload 读取，NodeInspector 消费）
// 全部纯函数、零 store 零 DOM；事件输入 = LoopEvent / replay GraphLogEvent 的结构化最小子集。
import { describe, it, expect } from 'vitest'
import {
  buildTraceMatrix, persistedLinksForTask, persistedTaskLinksOfRun,
  type TraceLoopEvent,
} from '../adapters/traceability'

const PERSIST = (over: Partial<TraceLoopEvent>): TraceLoopEvent => ({
  type: 'loop.persisted', ts: '2026-09-10T10:00:00Z', loopId: 'l1', contractId: 'task/a', ...over,
})
const TICK = (ts: string, iteration: number, loopId = 'l1'): TraceLoopEvent => ({
  type: 'loop.tick-complete', ts, loopId, iteration,
})
const VERIFY = (contractId: string, passed: boolean, ts: string, loopId = 'l1'): TraceLoopEvent => ({
  type: 'loop.verification-complete', ts, loopId, contractId, passed,
})

// ---------------------------------------------------------------------------
// buildTraceMatrix
// ---------------------------------------------------------------------------

describe('buildTraceMatrix', () => {
  it('按 loop 分组：goal/name 取自 loops 输入；persisted 事件归入所属 loop 与 run', () => {
    const groups = buildTraceMatrix({
      loops: [
        { id: 'l1', name: 'Alpha', goal: '修复登录' },
        { id: 'l2', name: 'Beta', goal: '巡检 CI' },
      ],
      events: [
        PERSIST({ loopId: 'l2', contractId: 'task/b', taskId: 't_2', runId: 'run-l2-1' }),
        PERSIST({ contractId: 'task/a', taskId: 't_1', runId: 'run-l1-1' }),
      ],
    })
    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({ loopId: 'l1', loopName: 'Alpha', goal: '修复登录' })
    expect(groups[0].runs[0]?.runId).toBe('run-l1-1')
    expect(groups[1].runs[0]?.tasks[0]?.contractId).toBe('task/b')
  })

  it('产出任务行：taskId 关联 kanban 标题/状态；无 taskId（legacy 事件）行仍保留 taskId=null', () => {
    const groups = buildTraceMatrix({
      loops: [{ id: 'l1', name: 'Alpha', goal: 'g' }],
      events: [
        PERSIST({ contractId: 'task/a', taskId: 't_1' }),
        PERSIST({ ts: '2026-09-01T00:00:00Z', contractId: 'task/legacy' }),
      ],
      tasks: [{ id: 't_1', title: '修登录页', status: 'done' }],
    })
    const run = groups[0].runs[0]
    expect(run?.tasks).toHaveLength(2)
    const linked = run?.tasks.find(t => t.contractId === 'task/a')
    expect(linked).toMatchObject({ taskId: 't_1', taskTitle: '修登录页', taskStatus: 'done' })
    const orphan = run?.tasks.find(t => t.contractId === 'task/legacy')
    expect(orphan?.taskId).toBeNull()
    expect(orphan?.taskTitle).toBeNull()
  })

  it('同一契约 repair 回边重复 persist → 单行，取最新 taskId 与最新落库时刻', () => {
    const groups = buildTraceMatrix({
      loops: [{ id: 'l1', name: 'A', goal: 'g' }],
      events: [
        PERSIST({ ts: '2026-09-10T10:00:00Z', contractId: 'task/a', taskId: 't_old' }),
        PERSIST({ ts: '2026-09-10T11:00:00Z', contractId: 'task/a', taskId: 't_new' }),
      ],
    })
    const run = groups[0].runs[0]
    expect(run?.tasks).toHaveLength(1)
    expect(run?.tasks[0]).toMatchObject({ taskId: 't_new', persistedAt: '2026-09-10T11:00:00Z' })
  })

  it('验证轮次：verification-complete 按 contract 计 passed/failed，lastRoundPassed 取最新一轮', () => {
    const groups = buildTraceMatrix({
      loops: [{ id: 'l1', name: 'A', goal: 'g' }],
      events: [
        VERIFY('task/a', false, '2026-09-10T09:00:00Z'),
        VERIFY('task/a', false, '2026-09-10T09:30:00Z'),
        VERIFY('task/a', true, '2026-09-10T09:55:00Z'),
        PERSIST({ contractId: 'task/a', taskId: 't_1' }),
      ],
    })
    expect(groups[0].runs[0]?.tasks[0]?.rounds).toEqual({ total: 3, passed: 1, failed: 2 })
    expect(groups[0].runs[0]?.tasks[0]?.lastRoundPassed).toBe(true)
  })

  it('迭代归属：persisted 事件前的 tick-complete 计数 + 1 = 本次 tick 序号；无 tick 事件为 null', () => {
    const groups = buildTraceMatrix({
      loops: [{ id: 'l1', name: 'A', goal: 'g' }],
      events: [
        TICK('2026-09-09T10:00:00Z', 1),
        TICK('2026-09-10T09:00:00Z', 2),
        PERSIST({ ts: '2026-09-10T10:00:00Z', contractId: 'task/a', runId: 'run-l1-3' }),
        PERSIST({ ts: '2026-09-08T10:00:00Z', contractId: 'task/first', runId: 'run-l1-1' }),
      ],
    })
    const byRun = new Map(groups[0].runs.map(r => [r.runId, r]))
    expect(byRun.get('run-l1-3')?.iteration).toBe(3)
    expect(byRun.get('run-l1-1')?.iteration).toBe(1)
  })

  it('run 状态 join（runs store 投影）与 null runId 分桶（legacy 引擎事件）', () => {
    const groups = buildTraceMatrix({
      loops: [{ id: 'l1', name: 'A', goal: 'g' }],
      events: [
        PERSIST({ contractId: 'task/a', runId: 'run-l1-1' }),
        PERSIST({ ts: '2026-09-01T00:00:00Z', contractId: 'task/legacy', runId: undefined }),
      ],
      runs: [{ runId: 'run-l1-1', status: 'completed' }],
    })
    const runs = groups[0].runs
    expect(runs).toHaveLength(2)
    const attributed = runs.find(r => r.runId === 'run-l1-1')
    expect(attributed).toMatchObject({ runStatus: 'completed' })
    const orphan = runs.find(r => r.runId === null)
    expect(orphan?.runStatus).toBeNull()
    expect(orphan?.tasks[0]?.contractId).toBe('task/legacy')
  })

  it('排序：run 组内最近落库优先；loop 顺序跟随 loops 输入；无 persisted 事件的 loop runs 为空', () => {
    const groups = buildTraceMatrix({
      loops: [{ id: 'l1', name: 'A', goal: 'g' }, { id: 'l2', name: 'B', goal: 'g2' }],
      events: [
        PERSIST({ ts: '2026-09-09T00:00:00Z', contractId: 'task/old', runId: 'run-1' }),
        PERSIST({ ts: '2026-09-10T00:00:00Z', contractId: 'task/new', runId: 'run-2' }),
      ],
    })
    expect(groups[0].runs.map(r => r.runId)).toEqual(['run-2', 'run-1'])
    expect(groups[1].runs).toEqual([])
  })

  it('鲁棒：畸形事件（缺 type/ts/contractId）与空输入不抛异常', () => {
    expect(buildTraceMatrix({ loops: [], events: [] })).toEqual([])
    // 唯一的 persisted 事件缺 contractId → 不成行（畸形事件不进矩阵，也不炸聚合）
    const groups = buildTraceMatrix({
      loops: [{ id: 'l1', name: 'A', goal: 'g' }],
      events: [
        { ts: '2026-09-10T00:00:00Z' } as TraceLoopEvent,
        PERSIST({ contractId: undefined as unknown as string }),
      ],
    })
    expect(groups[0].runs).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// persistedLinksForTask（任务 → run 反查）
// ---------------------------------------------------------------------------

describe('persistedLinksForTask', () => {
  it('按 taskId 显式匹配 loop.persisted，返回 runId 深链数据（最近优先）', () => {
    const links = persistedLinksForTask([
      PERSIST({ contractId: 'task/a', taskId: 't_1', runId: 'run-1' }),
      PERSIST({ ts: '2026-09-11T00:00:00Z', contractId: 'task/a', taskId: 't_1', runId: 'run-2' }),
      PERSIST({ contractId: 'task/b', taskId: 't_2', runId: 'run-3' }),
      // 旧数据：无 taskId 的事件不参与匹配（不做 artifact 字符串反解）
      PERSIST({ ts: '2026-09-01T00:00:00Z', contractId: 'task/a', runId: 'run-0' }),
    ], 't_1')
    expect(links).toHaveLength(2)
    expect(links[0]).toMatchObject({ runId: 'run-2', contractId: 'task/a' })
    expect(links[1]?.runId).toBe('run-1')
  })

  it('无关联（或 taskId 空）返回空数组，不抛异常', () => {
    expect(persistedLinksForTask([PERSIST({ taskId: 't_1' })], 't_x')).toEqual([])
    expect(persistedLinksForTask([], 't_1')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// persistedTaskLinksOfRun（run → 任务，replay 事件词汇）
// ---------------------------------------------------------------------------

describe('persistedTaskLinksOfRun', () => {
  it('从 replay 事件（kind + payload）读取产物任务链接，缺 taskId 的条目剔除', () => {
    const links = persistedTaskLinksOfRun([
      { kind: 'run.started', ts: 1 },
      { kind: 'loop.persisted', ts: 2, payload: { contractId: 'task/a', artifact: 'kanban:t_1', taskId: 't_1' } },
      { kind: 'loop.persisted', ts: 3, payload: { contractId: 'task/b', artifact: 'dryrun:task/b' } },
      { kind: 'loop.persist-failed', ts: 4, payload: { contractId: 'task/c', error: 'x' } },
    ])
    expect(links).toEqual([{ contractId: 'task/a', taskId: 't_1' }])
  })

  it('空事件流 / socket 词汇（type）事件同样安全', () => {
    expect(persistedTaskLinksOfRun([])).toEqual([])
    expect(persistedTaskLinksOfRun([
      { type: 'loop.persisted', ts: 1, payload: { contractId: 'task/a', taskId: 't_9' } },
    ])).toEqual([{ contractId: 'task/a', taskId: 't_9' }])
  })
})
