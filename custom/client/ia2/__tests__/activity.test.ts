// overlay/custom/client/ia2/__tests__/activity.test.ts
// v13 协作感知守门（2026-09-21）：三组纯函数——循环活动索引（左栏脉冲）、
// 需关注分诊（右栏 attention 档；与 buildWaiting 的边界：awaiting-input 不入）、
// 事件语义分类（历史回放着色/过滤的词表通吃：socket 词汇 ∪ 日志词汇）。
import { describe, it, expect } from 'vitest'
import {
  loopRunActivity, buildAttention, classifyRunEvent, semanticCounts, SEMANTIC_ORDER,
} from '../adapters/activity'
import type { RunSummary } from '@/custom/loop/runcenter/types'
import type { CockpitTask } from '@/custom/cockpit/adapters/task-adapter'

const NOW = Date.parse('2026-09-21T12:00:00Z')

function run(over: Partial<RunSummary> & { runId: string; graphId: string }): RunSummary {
  return {
    status: 'running', updatedAt: null, stage: null, iteration: 0,
    lastActivityAt: null, cost: 0, events: [], pendingInterruptId: null,
    ...over,
  } as RunSummary
}

function task(over: Partial<CockpitTask> & { id: string }): CockpitTask {
  return {
    title: `task-${over.id}`, priority: 'P2', status: 'todo', assignee: '',
    workspace: '', tenant: null, boardSlug: 'b', createdAt: NOW, ...over,
  } as CockpitTask
}

describe('loopRunActivity —— 左栏活动索引', () => {
  it('按 loopId 聚合 running/awaiting/failed；非 loop 图忽略', () => {
    const m = loopRunActivity([
      run({ runId: 'r1', graphId: 'loop-lp-1', status: 'running' }),
      run({ runId: 'r2', graphId: 'loop-lp-1', status: 'running' }),
      run({ runId: 'r3', graphId: 'loop-lp-1', status: 'awaiting-input' }),
      run({ runId: 'r4', graphId: 'loop-lp-2', status: 'failed' }),
      run({ runId: 'r5', graphId: 'adhoc-graph' }),
    ])
    expect(m.get('lp-1')).toEqual({ running: 2, awaiting: 1, failed: 0 })
    expect(m.get('lp-2')).toEqual({ running: 0, awaiting: 0, failed: 1 })
    expect(m.has('adhoc-graph')).toBe(false)
    expect(m.size).toBe(2)
  })

  it('空 runs → 空索引；loop- 裸前缀（空 id）忽略', () => {
    expect(loopRunActivity([]).size).toBe(0)
    expect(loopRunActivity([run({ runId: 'r', graphId: 'loop-' })]).size).toBe(0)
  })
})

describe('buildAttention —— 需关注分诊（attention 档）', () => {
  it('blocked 任务入列（task-blocked，ts=createdAt）', () => {
    const rows = buildAttention(
      [task({ id: 't1', status: 'blocked', createdAt: NOW - 3600_000 })],
      [], NOW,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'task-blocked', id: 'task:t1', taskId: 't1', subKey: 'ia2.att.subTaskBlocked',
    })
  })

  it('failed run 入列（run-failed，ts=lastActivityAt 归一 ms）', () => {
    const rows = buildAttention([], [
      run({ runId: 'r9', graphId: 'loop-lp-9', status: 'failed', lastActivityAt: '2026-09-21T11:00:00Z' }),
    ], NOW)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'run-failed', id: 'run:r9', runId: 'r9' })
    expect(rows[0].ts).toBe(Date.parse('2026-09-21T11:00:00Z'))
  })

  it('loop.stuck 事件优先于 failed（同 run 去重，取 stuck 且 ts=事件时刻）', () => {
    const rows = buildAttention([], [
      run({
        runId: 'r7', graphId: 'loop-lp-7', status: 'failed',
        lastActivityAt: '2026-09-21T10:00:00Z',
        events: [
          { type: 'loop.stuck', ts: '2026-09-21T11:30:00Z' },
          { type: 'loop.stuck', ts: '2026-09-21T11:45:00Z' },
        ],
      }),
    ], NOW)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'loop-stuck', id: 'run:r7' })
    expect(rows[0].ts).toBe(Date.parse('2026-09-21T11:45:00Z'))
  })

  it('awaiting-input 不入（边界：那是「等我」action_required 档）；健康态不入', () => {
    const rows = buildAttention(
      [task({ id: 't2', status: 'review' }), task({ id: 't3', status: 'running' })],
      [
        run({ runId: 'ra', graphId: 'loop-1', status: 'awaiting-input', pendingInterruptId: 'i1' }),
        run({ runId: 'rb', graphId: 'loop-1', status: 'completed' }),
      ],
      NOW,
    )
    expect(rows).toHaveLength(0)
  })

  it('排序：时间倒序', () => {
    const rows = buildAttention([
      task({ id: 'old', status: 'blocked', createdAt: 100 }),
      task({ id: 'new', status: 'blocked', createdAt: 900 }),
    ], [], NOW)
    expect(rows.map(r => r.id)).toEqual(['task:new', 'task:old'])
  })
})

describe('classifyRunEvent —— 语义分类（双词汇通吃）', () => {
  const cases: Array<[string, string]> = [
    // socket 词汇（graph.* / interrupt.* / cost.* / loop.*）
    ['graph.started', 'lifecycle'],
    ['graph.completed', 'lifecycle'],
    ['graph.failed', 'lifecycle'],
    ['graph.forked', 'lifecycle'],
    ['graph.step-start', 'step'],
    ['graph.node-start', 'node'],
    ['graph.node-complete', 'node'],
    ['graph.node-error', 'node'],
    ['graph.interrupt', 'interrupt'],
    ['graph.resume', 'interrupt'],
    ['interrupt.raised', 'interrupt'],
    ['interrupt.resumed', 'interrupt'],
    ['loop.stage-transition', 'stage'],
    ['loop.stuck', 'interrupt'],
    ['cost.recorded', 'cost'],
    // 日志词汇（event-log-store kind）
    ['completed', 'node'],
    ['error-routed', 'node'],
    ['interrupted', 'interrupt'],
    ['resumed', 'interrupt'],
    ['started', 'lifecycle'],
    ['failed', 'lifecycle'],
    ['agent.message', 'other'],
  ]
  for (const [name, kind] of cases) {
    it(`${name} → ${kind}`, () => {
      expect(classifyRunEvent(name)).toBe(kind)
    })
  }

  it('graph.node-started（-ed 后缀变体，既有回放测试事件名）→ node', () => {
    expect(classifyRunEvent('graph.node-started')).toBe('node')
  })
})

describe('semanticCounts —— 分布（SEMANTIC_ORDER 序，零计数省略）', () => {
  it('聚合 + 固定序输出', () => {
    const counts = semanticCounts([
      'graph.node-complete', 'graph.node-start', 'interrupt.raised',
      'graph.started', 'cost.recorded', 'graph.node-complete', 'weird.thing',
    ])
    expect(counts).toEqual([
      { kind: 'node', n: 3 },
      { kind: 'interrupt', n: 1 },
      { kind: 'lifecycle', n: 1 },
      { kind: 'cost', n: 1 },
      { kind: 'other', n: 1 },
    ])
    // 固定序断言：输出顺序是 SEMANTIC_ORDER 的子序列
    const order = counts.map(c => SEMANTIC_ORDER.indexOf(c.kind))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('空序列 → 空分布', () => {
    expect(semanticCounts([])).toEqual([])
  })
})
