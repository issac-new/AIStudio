// S1 分层口径守门：fail-open 不得计入逃逸，各项相加不得超过总数。
import { describe, expect, it } from 'vitest'
import { summarizeS1Layer } from '../s1-layer'
import type { S1SurvivorVerdict } from '../types'

function v(verdict: S1SurvivorVerdict['verdict'], via: string, id = 'x'): S1SurvivorVerdict {
  return { id, preview: 'p', via, verdict, attackP: null, category: null, severity: null }
}

describe('summarizeS1Layer', () => {
  it('判定端全部离线：全进 failOpen，逃逸数为 0、比率为 null（不把 PASS 当逃逸）', () => {
    const vs = [v('PASS', 'fail-open-error: down', 'a'), v('PASS', 'fail-open-breaker', 'b')]
    const r = summarizeS1Layer(vs, 1)
    expect(r.failOpen).toBe(2)
    expect(r.passed).toBe(0)
    expect(r.available).toBe(false)
    expect(r.strictEscapeRate).toBeNull()
    expect(r.unavailableReason).toContain('判定端不可用')
  })

  it('部分可用：分档只统计可用样本，各档相加等于可用数', () => {
    const vs = [
      v('REWRITE', 's1', 'a'),
      v('CONFIRM', 's1', 'b'),
      v('PASS', 's1', 'c'),
      v('PASS', 'fail-open-error: down', 'd'),
    ]
    const r = summarizeS1Layer(vs, 1)
    expect(r.isolated).toBe(1)
    expect(r.confirmed).toBe(1)
    expect(r.passed).toBe(1)
    expect(r.failOpen).toBe(1)
    expect(r.isolated + r.confirmed + r.passed + r.failOpen).toBe(vs.length)
    expect(r.strictEscapeRate).toBeCloseTo(1 / 3)
    expect(r.softEscapeRate).toBeCloseTo(2 / 3)
    expect(r.available).toBe(true)
  })

  it('零幸存者：available=true 且无比率（不是判定端故障）', () => {
    const r = summarizeS1Layer([], 1)
    expect(r.failOpen).toBe(0)
    expect(r.strictEscapeRate).toBeNull()
    expect(r.available).toBe(false) // 空样本按「无可用判定」处理，调用方覆写 reason
  })

  it('BLOCK 计入隔离档（重处置不散落）', () => {
    const r = summarizeS1Layer([v('BLOCK', 's1')], 1)
    expect(r.isolated).toBe(1)
    expect(r.passed).toBe(0)
  })
})
