import { describe, expect, it } from 'vitest'
import { buildMatrix, parseMatrix } from '../matrix'

const NOW = Date.parse('2026-10-31T12:00:00Z')
const DAY = 24 * 3600_000

function obs(over: Record<string, unknown> = {}) {
  return {
    model: 'strong-a',
    provider: 'p1',
    category: 'coding' as const,
    difficulty: 'P1',
    passed: 9,
    total: 10,
    setHash: 'set-1',
    at: new Date(NOW - DAY).toISOString(),
    ...over,
  }
}

describe('modelcap matrix', () => {
  it('aggregates passes/samples into pass@1', () => {
    const { matrix, rejected } = buildMatrix([obs(), obs({ passed: 8, total: 10 })], { minSamples: 5, now: NOW })
    expect(rejected).toBe(0)
    expect(matrix.cells).toHaveLength(1)
    expect(matrix.cells[0].samples).toBe(20)
    expect(matrix.cells[0].passes).toBe(17)
    expect(matrix.cells[0].passAt1).toBeCloseTo(0.85)
    expect(matrix.cells[0].stale).toBe(false)
    expect(matrix.cells[0].insufficient).toBe(false)
  })

  it('insufficient samples keep passAt1 null instead of fabricating a score', () => {
    const { matrix } = buildMatrix([obs({ passed: 2, total: 2 })], { minSamples: 5, now: NOW })
    expect(matrix.cells[0].samples).toBe(2)
    expect(matrix.cells[0].passAt1).toBeNull()
    expect(matrix.cells[0].insufficient).toBe(true)
  })

  it('marks stale evidence and mixed eval-set hashes honestly', () => {
    const { matrix } = buildMatrix([
      obs({ at: new Date(NOW - 30 * DAY).toISOString() }),
      obs({ setHash: 'set-2', at: new Date(NOW - 30 * DAY).toISOString() }),
    ], { minSamples: 5, staleDays: 14, now: NOW })
    expect(matrix.cells[0].stale).toBe(true)
    expect(matrix.cells[0].setHash).toBeNull()
  })

  it('rejects malformed observations without inventing cells', () => {
    const { matrix, rejected } = buildMatrix([
      obs({ passed: 11 }),
      obs({ total: 0, passed: 0 }),
      obs({ at: 'not-a-date' }),
      obs({ category: 'unknown' as never }),
    ], { now: NOW })
    expect(rejected).toBe(4)
    expect(matrix.cells).toHaveLength(0)
  })

  it('parses a valid matrix and rejects a drifted schema', () => {
    const { matrix } = buildMatrix([obs()], { minSamples: 5, now: NOW })
    expect(parseMatrix(JSON.parse(JSON.stringify(matrix)))).not.toBeNull()
    expect(parseMatrix({ ...matrix, version: 99 })).toBeNull()
    expect(parseMatrix({ ...matrix, cells: [{ model: 'x' }] })).toBeNull()
  })
})
