// 观测信号聚合守门（2026-10-19 观测层轮）：请求量/token 拆分/TTFT 分布/429 率/
// 工具成功率/按日分桶/按模型分组 + summarizeWindow 窗口汇总口径。
import { describe, expect, it } from 'vitest'
import { buildObsSignals, summarizeWindow, type ObsSpanRow } from '../signals'

const DAY1 = 1_760_000_000 // 固定 epoch 秒，落在某日
const H = 3600

function llmPost(over: Partial<ObsSpanRow> = {}): ObsSpanRow {
  return {
    type: 'chunk', kind: 'llm_span', phase: 'post', session_id: 's1',
    model: 'glm-5', started_at: DAY1, ended_at: DAY1 + 5, duration_ms: 5000,
    first_token_ms: 800,
    usage: { input_tokens: 100, output_tokens: 50, cache_read_tokens: 200, cache_write_tokens: 20, reasoning_tokens: 30 },
    ...over,
  }
}

describe('buildObsSignals', () => {
  it('聚合 LLM/工具/token 拆分/TTFT/会话与按日分桶', () => {
    const rows: ObsSpanRow[] = [
      { type: 'header', session_id: 's1', started_at: DAY1 },
      { type: 'header', session_id: 's2', started_at: DAY1 + 24 * H },
      llmPost(),
      llmPost({ session_id: 's2', model: 'kimi-k2', started_at: DAY1 + 24 * H, ended_at: DAY1 + 24 * H + 3, duration_ms: 3000, first_token_ms: 400, usage: { input_tokens: 10, output_tokens: 5 } }),
      { type: 'chunk', kind: 'llm_span', phase: 'error', session_id: 's2', model: 'glm-5', started_at: DAY1 + H, ended_at: DAY1 + H + 1, status_code: 429, error_type: 'rate_limit' },
      { type: 'chunk', kind: 'tool_span', session_id: 's1', tool_name: 'read_file', status: 'ok', started_at: DAY1, duration_ms: 10 },
      { type: 'chunk', kind: 'tool_span', session_id: 's1', tool_name: 'write_file', status: 'error', error_message: 'boom', started_at: DAY1 + 2 },
      { type: 'chunk', kind: 'llm_span', phase: 'pre', session_id: 's1', started_at: DAY1 }, // pre 不计
    ]
    const r = buildObsSignals(rows, { days: 7 })
    expect(r.available).toBe(true)
    expect(r.totals.sessions).toBe(2)
    expect(r.totals.llmCalls).toBe(3)
    expect(r.totals.llmErrors).toBe(1)
    expect(r.totals.rateLimit429).toBe(1)
    expect(r.totals.toolCalls).toBe(2)
    expect(r.totals.toolFailures).toBe(1)
    expect(r.totals.toolFailureRate).toBe(0.5)
    expect(r.totals.llmErrorRate).toBeCloseTo(1 / 3, 3)
    expect(r.totals.rateLimit429Rate).toBeCloseTo(1 / 3, 3)
    // token 拆分：两行 usage 求和
    expect(r.totals.tokens).toEqual({ input: 110, output: 55, cacheRead: 200, cacheWrite: 20, reasoning: 30 })
    // 缓存命中率 = 200 / (110+200+20)
    expect(r.totals.cacheHitRate).toBeCloseTo(200 / 330, 3)
    // TTFT：两个样本 400/800
    expect(r.totals.ttftMs.samples).toBe(2)
    expect(r.totals.ttftMs.p50).toBe(400)
    expect(r.totals.ttftMs.p95).toBe(800)
    // 按日分桶：DAY1 与 DAY1+24h 两桶
    expect(r.byDay.length).toBe(2)
    expect(r.byDay[0].llmCalls).toBe(2) // glm post + 429 error
    expect(r.byDay[1].llmCalls).toBe(1)
    expect(r.byDay[0].sessions).toBe(1)
    // 按模型分组：glm-5 两次（含 error），kimi-k2 一次
    expect(r.byModel[0]).toMatchObject({ model: 'glm-5', llmCalls: 2 })
    expect(r.byModel[1]).toMatchObject({ model: 'kimi-k2', llmCalls: 1 })
  })

  it('空行/缺字段如实降级：available=false、比率=null', () => {
    const r = buildObsSignals([], { days: 7 })
    expect(r.available).toBe(false)
    expect(r.totals.toolFailureRate).toBeNull()
    expect(r.totals.ttftMs.p95).toBeNull()
    expect(r.byDay).toEqual([])
  })

  it('非 chunk 行与未知 kind 不进入指标', () => {
    const rows: ObsSpanRow[] = [
      { type: 'trailer', session_id: 's1', ended_at: DAY1 },
      { type: 'chunk', kind: 'subagent_span', session_id: 's1', started_at: DAY1 },
    ]
    const r = buildObsSignals(rows, { days: 7 })
    expect(r.totals.llmCalls).toBe(0)
    expect(r.totals.toolCalls).toBe(0)
    expect(r.totals.sessions).toBe(0) // trailer 不计会话（只认 header）
  })

  it('工具 span 只带 ts 锚（插件 tool chunk 实际字段）也进入指标与分桶（2026-10-19 活体探针暴露的集成缺口）', () => {
    const rows: ObsSpanRow[] = [
      { type: 'chunk', kind: 'tool_span', session_id: 's1', tool_name: 'read_file', status: 'ok', ts: DAY1 + 10, duration_ms: 5 },
      { type: 'chunk', kind: 'tool_span', session_id: 's1', tool_name: 'write_file', status: 'error', error_message: 'x', ts: DAY1 + 20 },
    ]
    const r = buildObsSignals(rows, { days: 7 })
    expect(r.totals.toolCalls).toBe(2)
    expect(r.totals.toolFailures).toBe(1)
    expect(r.totals.toolFailureRate).toBe(0.5)
    expect(r.byDay.length).toBe(1)
    expect(r.byDay[0].toolCalls).toBe(2)
    // 告警窗汇总同样吃到 ts 锚
    const w = summarizeWindow(rows)
    expect(w.toolCalls).toBe(2)
    expect(w.errorRate).toBeCloseTo(0.5, 3)
  })
})

describe('summarizeWindow', () => {
  it('窗口汇总：错误率综合 LLM+工具，TTFT p95 按整窗算', () => {
    const rows: ObsSpanRow[] = [
      llmPost(),
      { type: 'chunk', kind: 'llm_span', phase: 'error', session_id: 's1', status_code: 500, started_at: DAY1 + H },
      { type: 'chunk', kind: 'tool_span', session_id: 's1', status: 'error', started_at: DAY1 + 2 * H },
    ]
    const w = summarizeWindow(rows)
    expect(w.llmCalls).toBe(2)
    expect(w.llmErrors).toBe(1)
    expect(w.toolCalls).toBe(1)
    expect(w.toolFailures).toBe(1)
    expect(w.errorRate).toBeCloseTo(2 / 3, 3)
    expect(w.totalTokens).toBe(100 + 50 + 200 + 20 + 30)
    expect(w.ttftP95).toBe(800)
  })

  it('无调用 → errorRate=null、ttftP95=null', () => {
    const w = summarizeWindow([])
    expect(w.errorRate).toBeNull()
    expect(w.ttftP95).toBeNull()
    expect(w.totalTokens).toBe(0)
  })
})
