import { describe, expect, it } from 'vitest'
import { buildMatrix } from '../matrix'
import { routeModel, routeHint } from '../route'
import type { CapabilityMatrix } from '../types'

const NOW = Date.parse('2026-10-31T12:00:00Z')
const DAY = 24 * 3600_000

function matrixOf(rows: Array<Record<string, unknown>>): CapabilityMatrix {
  return buildMatrix(rows.map((row) => ({
    category: 'coding' as const,
    difficulty: 'P1',
    at: new Date(NOW - DAY).toISOString(),
    ...row,
  })), { minSamples: 3, now: NOW }).matrix
}

describe('modelcap route', () => {
  it('high risk picks a model only with enough evidence above threshold', () => {
    const matrix = matrixOf([
      { model: 'strong-a', passed: 19, total: 20 },
      { model: 'weak-b', passed: 8, total: 10 },
    ])
    const decision = routeModel({ risk: 'high', category: 'coding', difficulty: 'P1' }, matrix)
    expect(decision.ok).toBe(true)
    expect(decision.model).toBe('strong-a')
    expect(decision.unknown).toBe(false)
    expect(decision.requiresHuman).toBe(false)
  })

  it('high risk never silently downgrades when evidence is below threshold', () => {
    const matrix = matrixOf([{ model: 'weak-b', passed: 8, total: 10 }])
    const decision = routeModel(
      { risk: 'high', category: 'coding', difficulty: 'P1', defaultModel: 'strong-a' },
      matrix,
    )
    expect(decision.ok).toBe(false)
    expect(decision.model).toBeNull()
    expect(decision.requiresHuman).toBe(true)
    expect(decision.unknown).toBe(true)
  })

  it('high risk does not borrow evidence from another difficulty', () => {
    const matrix = matrixOf([{ model: 'strong-a', passed: 19, total: 20, difficulty: 'P2' }])
    const decision = routeModel({ risk: 'high', category: 'coding', difficulty: 'P1' }, matrix)
    expect(decision.ok).toBe(false)
    expect(decision.requiresHuman).toBe(true)
  })

  it('low risk may fall back to the explicit default model', () => {
    const decision = routeModel(
      { risk: 'low', category: 'coding', defaultModel: 'baseline' },
      null,
    )
    expect(decision.ok).toBe(true)
    expect(decision.model).toBe('baseline')
    expect(decision.unknown).toBe(false)
    expect(decision.reason).toContain('回落默认模型')
  })

  it('medium risk without evidence and without default needs a human', () => {
    const decision = routeModel({ risk: 'medium', category: 'review' }, null)
    expect(decision.ok).toBe(false)
    expect(decision.requiresHuman).toBe(true)
    expect(decision.unknown).toBe(true)
  })

  it('stale evidence is disqualified even if the score is high', () => {
    const matrix = matrixOf([{
      model: 'strong-a', passed: 20, total: 20,
      at: new Date(NOW - 60 * DAY).toISOString(),
    }])
    const decision = routeModel({ risk: 'high', category: 'coding', difficulty: 'P1' }, matrix)
    expect(decision.ok).toBe(false)
    expect(decision.candidates[0]?.stale).toBe(true)
    expect(decision.candidates[0]?.qualifies).toBe(false)
  })

  it('routeHint explains unknown and human-gate outcomes', () => {
    const matrix = matrixOf([{ model: 'weak-b', passed: 8, total: 10 }])
    const decision = routeModel({ risk: 'high', category: 'coding', difficulty: 'P1' }, matrix)
    expect(routeHint(decision)).toContain('需人工裁决')
  })
})
