// 分派预演守门（写读共用谓词：四因子拦截/预演卡）。
import { describe, it, expect } from 'vitest'
import { willEnqueueRun, dispatchPreview, type DispatchFacts } from '../dispatch-preview'

const facts = (over: Partial<DispatchFacts> = {}): DispatchFacts => ({
  inProgress: 1, maxInProgress: 3, taskAlreadyRunning: false, paused: false,
  dedupeKey: 'k1', runningDedupeKeys: ['k2'], ...over,
})

describe('willEnqueueRun（写读共用谓词）', () => {
  it('干净入队；四因子任一拦即拒并全列 reasons', () => {
    expect(willEnqueueRun(facts())).toEqual({ willEnqueue: true, reasons: [] })
    const d = willEnqueueRun(facts({ paused: true, taskAlreadyRunning: true, inProgress: 3, runningDedupeKeys: ['k1'] }))
    expect(d.willEnqueue).toBe(false)
    expect(d.reasons).toHaveLength(4)
    expect(d.reasons.some((r) => r.startsWith('paused'))).toBe(true)
    expect(d.reasons.some((r) => r.startsWith('dedupe'))).toBe(true)
  })
})

describe('dispatchPreview（预演卡=同一谓词）', () => {
  it('yes/no 文案随谓词', () => {
    expect(dispatchPreview(facts())).toBe('WillEnqueueRun：yes')
    expect(dispatchPreview(facts({ paused: true }))).toContain('no — paused')
  })
})
