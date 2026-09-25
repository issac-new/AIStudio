// 浏览器回路守门（antigravity：三阶段严格回路/录制回流计数/汇总）。
import { describe, it, expect } from 'vitest'
import { advanceLoop, loopSummary, type BrowserStep, type LoopState } from '../browser-loop'

const state = (over: Partial<LoopState> = {}): LoopState => ({ stage: 'screenshot', completedCycles: 0, recorded: 0, ...over })
const step = (stage: BrowserStep['stage'], over: Partial<BrowserStep> = {}): BrowserStep => ({ stepId: 's', stage, at: 1, ...over })

describe('浏览器回路（antigravity 语义）', () => {
  it('截图→动作→录制严格推进；录完一循环+1；有工件才计录制', () => {
    let s = state()
    s = advanceLoop(s, step('screenshot'))
    expect(s.stage).toBe('action')
    s = advanceLoop(s, step('action'))
    expect(s.stage).toBe('recording')
    s = advanceLoop(s, step('recording', { artifactRef: 'rec.webm' }))
    expect(s).toMatchObject({ stage: 'screenshot', completedCycles: 1, recorded: 1 })
    // 阶段错位不动（严格回路）
    expect(advanceLoop(state(), step('action')).stage).toBe('screenshot')
    // 无工件录制不计证据
    s = advanceLoop(state({ stage: 'recording' }), step('recording'))
    expect(s.recorded).toBe(0)
    expect(loopSummary([step('recording', { artifactRef: 'a' }), step('recording')])).toEqual({ cycles: 2, artifacts: 1 })
  })
})
