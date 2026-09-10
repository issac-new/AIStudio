// overlay/custom/client/ia2/__tests__/overview-adapter.test.ts
// P3 Task 4 — 总览纯函数 adapter 重点单测：
//   mergeAttention（注意力优先级归并）/ aggregateActiveRuns / aggregateInbox（卡片数字）/
//   aggregateMetrics（近 7 天成功率/平均耗时/熔断计数）/ buildTodayPlan（今日计划推导）/
//   formatDuration（耗时人性化）。
// 纯函数、零 DOM、零 store——全部输入输出结构化断言。
import { describe, it, expect } from 'vitest'
import {
  mergeAttention, aggregateActiveRuns, aggregateInbox,
  aggregateMetrics, buildTodayPlan, formatDuration,
} from '../adapters/overview'
import type { MetricsRaw } from '@/custom/loop/runcenter/types'

// ── 工厂 ──
const att = (over: Partial<{ id: string; title: string; status: string; priority: number | string | null; createdAt: number | null }> = {}) => ({
  id: over.id ?? 't1',
  title: over.title ?? '任务一',
  status: over.status ?? 'blocked',
  priority: over.priority ?? null,
  createdAt: over.createdAt ?? null,
})

// ── mergeAttention：收编 CockpitAttention 优先级模型 ──
describe('mergeAttention — 注意力优先级归并', () => {
  it('只保留 blocked/review/triage，其余状态（todo/done/running…）不进注意力条', () => {
    const rows = mergeAttention([
      att({ id: 'a', status: 'blocked' }),
      att({ id: 'b', status: 'review' }),
      att({ id: 'c', status: 'triage' }),
      att({ id: 'd', status: 'todo' }),
      att({ id: 'e', status: 'done' }),
      att({ id: 'f', status: 'running' }),
    ])
    expect(rows.map(r => r.taskId)).toEqual(['a', 'b', 'c'])
  })

  it('梯队排序：blocked > review > triage（与 cockpit attentionTier 同权重）', () => {
    const rows = mergeAttention([
      att({ id: 't', status: 'triage' }),
      att({ id: 'r', status: 'review' }),
      att({ id: 'b', status: 'blocked' }),
    ])
    expect(rows.map(r => r.status)).toEqual(['blocked', 'review', 'triage'])
  })

  it('梯队内按优先级：P0 在 P2 前（数字与 P 字符串两种词表都归一）', () => {
    const rows = mergeAttention([
      att({ id: 'low', status: 'blocked', priority: 2 }),
      att({ id: 'high', status: 'blocked', priority: 0 }),
      att({ id: 'str-low', status: 'blocked', priority: 'P2' }),
      att({ id: 'str-high', status: 'blocked', priority: 'P0' }),
    ])
    expect(rows.map(r => r.taskId)).toEqual(['high', 'str-high', 'low', 'str-low'])
  })

  it('同优先级按创建时间降序（晚的在前）；缺省视为最旧', () => {
    const rows = mergeAttention([
      att({ id: 'old', status: 'review', createdAt: 1000 }),
      att({ id: 'new', status: 'review', createdAt: 3000 }),
      att({ id: 'mid', status: 'review', createdAt: 2000 }),
      att({ id: 'none', status: 'review', createdAt: null }),
    ])
    expect(rows.map(r => r.taskId)).toEqual(['new', 'mid', 'old', 'none'])
  })

  it('行携带 taskId + severity（review=medium，blocked/triage=high）供条上色', () => {
    const rows = mergeAttention([
      att({ id: 'b', status: 'blocked' }),
      att({ id: 'r', status: 'review' }),
      att({ id: 't', status: 'triage' }),
    ])
    expect(rows.find(r => r.status === 'review')?.severity).toBe('medium')
    expect(rows.filter(r => r.severity === 'high')).toHaveLength(2)
    expect(rows.every(r => r.taskId && r.id.startsWith('att-'))).toBe(true)
  })

  it('空输入返回空数组（条显空态文案）', () => {
    expect(mergeAttention([])).toEqual([])
  })
})

// ── 卡片数字 ──
describe('aggregateActiveRuns — 活跃运行卡', () => {
  it('running 与 awaiting-input 分别计数，终态不计', () => {
    const agg = aggregateActiveRuns([
      { status: 'running', updatedAt: null },
      { status: 'running', updatedAt: null },
      { status: 'awaiting-input', updatedAt: null },
      { status: 'completed', updatedAt: null },
      { status: 'failed', updatedAt: null },
      { status: 'unknown', updatedAt: null },
    ])
    expect(agg.running).toBe(2)
    expect(agg.awaiting).toBe(1)
  })

  it('最近活动时间 = 活跃 run 中 lastActivityAt（缺省回 updatedAt）最大值；无活跃 run 为 null', () => {
    const agg = aggregateActiveRuns([
      { status: 'running', updatedAt: '2026-09-10T01:00:00Z' },
      { status: 'awaiting-input', updatedAt: '2026-09-10T03:00:00Z', lastActivityAt: '2026-09-10T03:30:00Z' },
      { status: 'completed', updatedAt: '2026-09-10T09:00:00Z', lastActivityAt: '2026-09-10T09:00:00Z' },
    ])
    expect(agg.lastActivityAt).toBe('2026-09-10T03:30:00Z')
    expect(aggregateActiveRuns([{ status: 'completed', updatedAt: '2026-09-10T09:00:00Z' }]).lastActivityAt).toBeNull()
  })
})

describe('aggregateInbox — 等你决策卡', () => {
  const NOW = Date.parse('2026-09-10T12:00:00Z')

  it('awaiting 计数 + 最久等待时长（最早 lastActivityAt 距今）', () => {
    const agg = aggregateInbox([
      { status: 'awaiting-input', updatedAt: '2026-09-10T10:00:00Z', lastActivityAt: '2026-09-10T10:00:00Z' },
      { status: 'awaiting-input', updatedAt: '2026-09-10T11:00:00Z', lastActivityAt: '2026-09-10T11:30:00Z' },
      { status: 'running', updatedAt: '2026-09-10T08:00:00Z' },
    ], NOW)
    expect(agg.awaiting).toBe(2)
    expect(agg.longestWaitMs).toBe(2 * 3_600_000)
  })

  it('lastActivityAt 缺失回 updatedAt；两者皆缺不计入等待', () => {
    const agg = aggregateInbox([
      { status: 'awaiting-input', updatedAt: '2026-09-10T09:00:00Z', lastActivityAt: null },
      { status: 'awaiting-input', updatedAt: null, lastActivityAt: null },
    ], NOW)
    expect(agg.longestWaitMs).toBe(3 * 3_600_000)
  })

  it('零等待输入返回 0 / null', () => {
    const agg = aggregateInbox([{ status: 'completed', updatedAt: '2026-09-10T09:00:00Z' }], NOW)
    expect(agg.awaiting).toBe(0)
    expect(agg.longestWaitMs).toBeNull()
  })
})

// ── 关键指标（近 7 天）──
describe('aggregateMetrics — 成功率/平均耗时/熔断计数', () => {
  const NOW = Date.parse('2026-09-10T12:00:00Z')
  const DAY = 86_400_000
  const iso = (ms: number) => new Date(ms).toISOString()

  const run = (runId: string, status: string, updatedAtMs: number) => ({
    runId, graphId: 'loop-x', status, updatedAt: iso(updatedAtMs),
  })

  it('成功率 = 窗口内 completed/(completed+failed)；非终态与窗口外不计', () => {
    const raw: MetricsRaw = {
      runs: [
        run('r1', 'completed', NOW - 1 * DAY),
        run('r2', 'completed', NOW - 2 * DAY),
        run('r3', 'failed', NOW - 3 * DAY),
        run('r4', 'failed', NOW - 9 * DAY),   // 窗口外
        run('r5', 'running', NOW - 1 * DAY),   // 非终态
      ],
      replays: [], loopEvents: [], collectedAt: NOW,
    }
    const m = aggregateMetrics(raw, NOW)
    expect(m.completed).toBe(2)
    expect(m.failed).toBe(1)
    expect(m.successRate).toBeCloseTo(2 / 3)
  })

  it('窗口内零终态 run → successRate 为 null（不显示 0% 误导）', () => {
    const raw: MetricsRaw = { runs: [run('r1', 'running', NOW - DAY)], replays: [], loopEvents: [], collectedAt: NOW }
    expect(aggregateMetrics(raw, NOW).successRate).toBeNull()
  })

  it('null/无 updatedAt 的 run 不参与统计', () => {
    const raw: MetricsRaw = {
      runs: [
        { runId: 'r1', graphId: 'g', status: 'completed', updatedAt: null },
        run('r2', 'completed', NOW - DAY),
      ],
      replays: [], loopEvents: [], collectedAt: NOW,
    }
    expect(aggregateMetrics(raw, NOW).completed).toBe(1)
  })

  it('平均耗时 = 近窗终态 run 回放的首尾事件差均值（ISO 与 epoch ts 双词汇）', () => {
    const raw: MetricsRaw = {
      runs: [run('r1', 'completed', NOW - DAY), run('r2', 'completed', NOW - 2 * DAY)],
      replays: [
        { runId: 'r1', events: [{ type: 'graph.started', ts: iso(NOW - DAY) }, { type: 'graph.completed', ts: iso(NOW - DAY + 600_000) }] }, // 10min
        { runId: 'r2', events: [{ type: 'run.started', ts: NOW - 2 * DAY }, { kind: 'run.completed', ts: NOW - 2 * DAY + 1_800_000 }] },     // 30min（epoch ts）
      ],
      loopEvents: [], collectedAt: NOW,
    }
    const m = aggregateMetrics(raw, NOW)
    expect(m.avgDurationMs).toBe(1_200_000)
    expect(m.durationSamples).toBe(2)
  })

  it('耗时样本仅取 ≥2 个可解析 ts 的回放；单事件/坏 ts 回放跳过', () => {
    const raw: MetricsRaw = {
      runs: [run('r1', 'completed', NOW - DAY), run('r2', 'completed', NOW - DAY), run('r3', 'failed', NOW - DAY)],
      replays: [
        { runId: 'r1', events: [{ type: 'a', ts: iso(NOW - DAY) }, { type: 'b', ts: 'not-a-date' }, { type: 'c', ts: iso(NOW - DAY + 60_000) }] },
        { runId: 'r2', events: [{ type: 'a', ts: iso(NOW - DAY) }] },
        { runId: 'r3', events: [{ type: 'a', ts: 'bad' }, { type: 'b', ts: 'also-bad' }] },
      ],
      loopEvents: [], collectedAt: NOW,
    }
    const m = aggregateMetrics(raw, NOW)
    expect(m.durationSamples).toBe(1)
    expect(m.avgDurationMs).toBe(60_000)
  })

  it('熔断次数 = 各 loop 事件中 loop.stuck 计数（窗口外不计）；duration 样本外的 run 不影响', () => {
    const raw: MetricsRaw = {
      runs: [run('r1', 'completed', NOW - DAY)],
      replays: [],
      loopEvents: [
        { loopId: 'l1', events: [{ type: 'loop.stuck', ts: iso(NOW - DAY) }, { type: 'loop.stuck', ts: iso(NOW - 8 * DAY) }, { type: 'loop.tick-complete', ts: iso(NOW - DAY) }] },
        { loopId: 'l2', events: [{ type: 'loop.stuck', ts: iso(NOW - 2 * DAY) }] },
        { loopId: 'l3', events: [{ type: 'loop.created', ts: iso(NOW - DAY) }] },
      ],
      collectedAt: NOW,
    }
    expect(aggregateMetrics(raw, NOW).stuckCount).toBe(2)
  })

  it('自定义窗口（如 1 天）生效；null 输入返回全 null 指标', () => {
    const raw: MetricsRaw = {
      runs: [run('r1', 'failed', NOW - 3 * DAY)],
      replays: [], loopEvents: [{ loopId: 'l1', events: [{ type: 'loop.stuck', ts: iso(NOW - 3 * DAY) }] }],
      collectedAt: NOW,
    }
    const m = aggregateMetrics(raw, NOW, DAY)
    expect(m.successRate).toBeNull()
    expect(m.stuckCount).toBe(0)
    expect(aggregateMetrics(null, NOW)).toEqual({
      successRate: null, completed: 0, failed: 0, avgDurationMs: null, durationSamples: 0, stuckCount: 0,
    })
  })
})

// ── 今日计划 ──
describe('buildTodayPlan — 今日计划推导（到期未触发 idle loops + 待办）', () => {
  // 2026-09-10（周四）本地时区 12:00
  const now = new Date(2026, 8, 10, 12, 0, 0)
  const isoLocal = (y: number, mo: number, d: number, h: number, mi: number) =>
    new Date(y, mo, d, h, mi).toISOString()

  it('idle 且 nextTickAt 在今天（含已过期）进计划；overdue = 已过当前时刻', () => {
    const items = buildTodayPlan([
      { id: 'l1', name: '晨检循环', status: 'idle', nextTickAt: isoLocal(2026, 8, 10, 9, 0) },   // 今日已过 → 逾期
      { id: 'l2', name: '巡检循环', status: 'idle', nextTickAt: isoLocal(2026, 8, 10, 18, 0) },  // 今日晚些
    ], [], now)
    expect(items).toHaveLength(2)
    expect(items.find(i => i.id === 'l1')?.overdue).toBe(true)
    expect(items.find(i => i.id === 'l2')?.overdue).toBe(false)
    expect(items.every(i => i.kind === 'loop')).toBe(true)
  })

  it('非 idle（running/paused/completed…）与明日 nextTickAt 不进计划', () => {
    const items = buildTodayPlan([
      { id: 'r', name: '运行中', status: 'running', nextTickAt: isoLocal(2026, 8, 10, 13, 0) },
      { id: 'p', name: '已暂停', status: 'paused', nextTickAt: isoLocal(2026, 8, 10, 13, 0) },
      { id: 'tm', name: '明日循环', status: 'idle', nextTickAt: isoLocal(2026, 8, 11, 9, 0) },
      { id: 'nt', name: '无排期', status: 'idle', nextTickAt: null },
      { id: 'bad', name: '坏时间', status: 'idle', nextTickAt: 'not-a-date' },
    ], [], now)
    expect(items).toEqual([])
  })

  it('今日待办进计划（闹钟时刻排序用）；非今日待办与无闹钟待办 at 为 null 但保留', () => {
    const items = buildTodayPlan([], [
      { id: 'td1', title: '评审 PR', date: '2026-09-10', remindAt: Date.parse(isoLocal(2026, 8, 10, 15, 0)) },
      { id: 'td2', title: '无闹钟待办', date: '2026-09-10', remindAt: null },
      { id: 'td3', title: '昨日待办', date: '2026-09-09', remindAt: 1 },
    ], now)
    expect(items.filter(i => i.kind === 'todo')).toHaveLength(2)
    const withAlarm = items.find(i => i.id === 'td1')
    expect(withAlarm?.at).toBe(Date.parse(isoLocal(2026, 8, 10, 15, 0)))
    expect(items.find(i => i.id === 'td2')?.at).toBeNull()
  })

  it('过期待办 overdue=true（闹钟时刻已过）；无闹钟不判逾期', () => {
    const items = buildTodayPlan([], [
      { id: 'past', title: '过期', date: '2026-09-10', remindAt: Date.parse(isoLocal(2026, 8, 10, 8, 0)) },
      { id: 'noalarm', title: '无闹钟', date: '2026-09-10', remindAt: null },
    ], now)
    expect(items.find(i => i.id === 'past')?.overdue).toBe(true)
    expect(items.find(i => i.id === 'noalarm')?.overdue).toBe(false)
  })

  it('loop 与待办合并按时刻升序，无时刻排末尾', () => {
    const items = buildTodayPlan(
      [{ id: 'loop-9', name: '九点循环', status: 'idle', nextTickAt: isoLocal(2026, 8, 10, 9, 0) },
       { id: 'loop-17', name: '十七点循环', status: 'idle', nextTickAt: isoLocal(2026, 8, 10, 17, 0) }],
      [{ id: 'todo-14', title: '十四点评审', date: '2026-09-10', remindAt: Date.parse(isoLocal(2026, 8, 10, 14, 0)) },
       { id: 'todo-x', title: '无闹钟', date: '2026-09-10', remindAt: null }],
      now,
    )
    expect(items.map(i => i.id)).toEqual(['loop-9', 'todo-14', 'loop-17', 'todo-x'])
  })

  it('日切边界：23:59:59.999 的循环算今日，00:00:00 次日不算', () => {
    const items = buildTodayPlan([
      { id: 'edge-in', name: '当日末班', status: 'idle', nextTickAt: isoLocal(2026, 8, 10, 23, 59) },
      { id: 'edge-out', name: '次日头班', status: 'idle', nextTickAt: isoLocal(2026, 8, 11, 0, 0) },
    ], [], now)
    expect(items.map(i => i.id)).toEqual(['edge-in'])
  })
})

// ── 耗时格式化 ──
describe('formatDuration — 耗时人性化（单位字母 locale 中立）', () => {
  it('分桶：<1s / 秒 / 分秒 / 时分 / 天时', () => {
    expect(formatDuration(0)).toBe('<1s')
    expect(formatDuration(38_000)).toBe('38s')
    expect(formatDuration(65_000)).toBe('1m 05s')
    expect(formatDuration(3_600_000 * 2 + 60_000 * 5)).toBe('2h 05m')
    expect(formatDuration(86_400_000 + 3_600_000 * 2)).toBe('1d 02h')
  })

  it('null / 负值返回 null（卡片落 —）', () => {
    expect(formatDuration(null)).toBeNull()
    expect(formatDuration(-5)).toBeNull()
  })
})
