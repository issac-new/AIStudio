// overlay/custom/server/tokens/__tests__/context-trend.test.ts
// 逐轮组成趋势 fold 守门：run 分组累计快照/usage run 对齐/无 run_marker 时间序近似/
// 压缩事件/截断/估算标注。纯函数测试（不触 DB）。
import { describe, it, expect } from 'vitest'
import { foldContextTrend, STEPS_MAX, type TrendMessage, type TrendUsageRow } from '../context-trend'

function msg(id: number, role: string, tokens: number, run_marker?: string | null, extra?: Partial<TrendMessage>): TrendMessage {
  return { id, role, content: 'x'.repeat(tokens * 4), token_count: tokens, run_marker: run_marker ?? null, ...extra }
}

const RUN_MSGS: TrendMessage[] = [
  msg(1, 'system', 100, 'run-a'),
  msg(2, 'user', 200, 'run-a'),
  msg(3, 'assistant', 300, 'run-a'),
  msg(4, 'tool', 400, 'run-b'),
  msg(5, 'assistant', 100, 'run-b'),
]

const RUN_USAGE: TrendUsageRow[] = [
  { run_id: 'run-a', input_tokens: 300, output_tokens: 300, cache_read_tokens: 100, cache_write_tokens: 0, model: 'm1', created_at: 1 },
  { run_id: 'run-a', input_tokens: 50, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 20, model: 'm1', created_at: 2 },
  { run_id: 'run-b', input_tokens: 700, output_tokens: 100, cache_read_tokens: 0, cache_write_tokens: 0, model: 'm2', created_at: 3 },
]

describe('foldContextTrend run 对齐', () => {
  it('每个 run 收口一柱，桶值为该时点四桶累计', () => {
    const r = foldContextTrend(RUN_MSGS, RUN_USAGE)
    expect(r.usageAligned).toBe('run')
    expect(r.steps).toHaveLength(2)
    // run-a 柱：system100+user200+assistant300 = 600
    expect(r.steps[0]).toMatchObject({
      seq: 3, turn: 1, runId: 'run-a',
      buckets: { system: 100, user: 200, assistant: 300, tool: 0 },
      total: 600,
    })
    // run-b 柱：累计 tool400+assistant100 追加
    expect(r.steps[1]).toMatchObject({
      seq: 5, turn: 2, runId: 'run-b',
      buckets: { system: 100, user: 200, assistant: 400, tool: 400 },
      total: 1100,
    })
  })

  it('usage 按 run_id 合并多行后挂柱', () => {
    const r = foldContextTrend(RUN_MSGS, RUN_USAGE)
    expect(r.steps[0]!.usage).toEqual({ input: 350, output: 300, cacheRead: 100, cacheWrite: 20, model: 'm1' })
    expect(r.steps[1]!.usage).toEqual({ input: 700, output: 100, cacheRead: 0, cacheWrite: 0, model: 'm2' })
  })

  it('压缩事件单点入列（表只存最新快照）', () => {
    const r = foldContextTrend(RUN_MSGS, RUN_USAGE, { throughMessageId: 3, foldedMessages: 2 })
    expect(r.events).toEqual([{ kind: 'compaction', throughMessageId: 3, foldedMessages: 2 }])
  })
})

describe('foldContextTrend 旧会话回退', () => {
  const OLD_MSGS: TrendMessage[] = [
    msg(1, 'user', 100, null),
    msg(2, 'assistant', 200, null),
    msg(3, 'user', 100, null),
    msg(4, 'assistant', 300, null),
  ]

  it('无 run_marker：assistant 逐条开柱，usage 时间序近似对齐并显式标注', () => {
    const usage: TrendUsageRow[] = [
      { run_id: 'u2', input_tokens: 10, output_tokens: 10, cache_read_tokens: 0, cache_write_tokens: 0, model: 'm', created_at: 2 },
      { run_id: 'u1', input_tokens: 20, output_tokens: 20, cache_read_tokens: 0, cache_write_tokens: 0, model: 'm', created_at: 1 },
    ]
    const r = foldContextTrend(OLD_MSGS, usage)
    expect(r.usageAligned).toBe('order-approx')
    expect(r.steps).toHaveLength(2)
    // created_at 升序对齐：第 1 柱=usage u1(20)，第 2 柱=u2(10)
    expect(r.steps[0]!.usage?.input).toBe(20)
    expect(r.steps[1]!.usage?.input).toBe(10)
  })

  it('空消息 → 零柱', () => {
    expect(foldContextTrend([], []).steps).toEqual([])
  })
})

describe('foldContextTrend 估算与截断', () => {
  it('无 token_count 走 chars/4 估算，isEstimate=true', () => {
    const msgs: TrendMessage[] = [
      { id: 1, role: 'user', content: 'x'.repeat(40), token_count: null, run_marker: 'r1' },
    ]
    const r = foldContextTrend(msgs, [])
    expect(r.isEstimate).toBe(true)
    expect(r.steps[0]!.buckets.user).toBe(10)
  })

  it('超 STEPS_MAX 截断保最近', () => {
    const msgs: TrendMessage[] = []
    for (let i = 1; i <= STEPS_MAX + 30; i++) msgs.push(msg(i, 'assistant', 1, `run-${i}`))
    const r = foldContextTrend(msgs, [])
    expect(r.truncated).toBe(true)
    expect(r.steps).toHaveLength(STEPS_MAX)
    expect(r.steps[0]!.runId).toBe(`run-31`)
    expect(r.steps.at(-1)!.runId).toBe(`run-${STEPS_MAX + 30}`)
  })
})
