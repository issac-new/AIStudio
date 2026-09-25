// RunTrace timing overview 守门（dsh T6：llm/tool 分解/TTFT 不伪造/own-duration 防双计）。
import { describe, it, expect } from 'vitest'
import { buildTimingOverview, outputTps, type TimingEvent } from '../adapters/run-trace-timing'

const ev = (over: Partial<TimingEvent> & { kind: 'llm' | 'tool' }): TimingEvent => ({
  name: 'x', at: 0, durationMs: 100, ...over,
})

describe('timing overview（dsh 语义）', () => {
  it('llm/tool 分解+步骤时序；own-duration 防父子双计', () => {
    const events = [
      ev({ kind: 'llm', name: 'turn1', at: 0, durationMs: 1000, ttftMs: 200, outputTokens: 100 }),
      ev({ kind: 'tool', name: 'read', at: 1000, durationMs: 300 }),
      ev({ kind: 'tool', name: 'nested', at: 1050, durationMs: 250, parentOf: 'read' }),  // 子步不计总
    ]
    const o = buildTimingOverview(events)
    expect(o.totalMs).toBe(1300)  // 1000+300（嵌套 250 不双计）
    expect(o.llmMs).toBe(1000)
    expect(o.toolMs).toBe(300)
    expect(o.steps).toHaveLength(2)
    expect(o.steps[0]).toMatchObject({ kind: 'llm', ttftMs: 200, decodeMs: 800 })
  })

  it('TTFT 无流样本不伪造（null）；decode 台账有效样本才计', () => {
    const events = [ev({ kind: 'llm', name: 'a', durationMs: 500 })]  // 无 ttft
    const o = buildTimingOverview(events)
    expect(o.steps[0].ttftMs).toBeNull()
    expect(o.ttftSamplesMs).toEqual([])
    expect(outputTps(o)).toBeNull()  // 无有效 decode 样本
  })

  it('outputTps=decode tokens/s（dsh 输出速度口径）', () => {
    const o = buildTimingOverview([
      ev({ kind: 'llm', durationMs: 1200, ttftMs: 200, outputTokens: 500 }),  // decode 1000ms/500tok
    ])
    expect(outputTps(o)).toBe(500)
  })
})
