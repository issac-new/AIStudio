// overlay/custom/client/loop/graph/__tests__/predicate.test.ts
import { describe, it, expect } from 'vitest'
import { evaluatePredicate, getPath } from '../../../../server/loop/graph/predicate'
import type { PredicateExpr } from '../../../../server/loop/graph/predicate'

describe('getPath', () => {
  it('resolves dot paths including array index', () => {
    const s = { a: { b: [{ c: 42 }] }, x: 0, y: false, z: null }
    expect(getPath(s, 'a.b.0.c')).toBe(42)
    expect(getPath(s, 'x')).toBe(0)
    expect(getPath(s, 'y')).toBe(false)
    expect(getPath(s, 'missing.deep')).toBeUndefined()
  })
})

describe('evaluatePredicate', () => {
  const state = { count: 3, name: 'loop', tags: ['a'], verdict: { passed: true } }

  it('cmp operators', () => {
    expect(evaluatePredicate({ op: 'cmp', path: 'count', cmp: 'gte', value: 3 }, state)).toBe(true)
    expect(evaluatePredicate({ op: 'cmp', path: 'count', cmp: 'gt', value: 3 }, state)).toBe(false)
    expect(evaluatePredicate({ op: 'cmp', path: 'name', cmp: 'eq', value: 'loop' }, state)).toBe(true)
    expect(evaluatePredicate({ op: 'cmp', path: 'name', cmp: 'ne', value: 'loop' }, state)).toBe(false)
    expect(evaluatePredicate({ op: 'cmp', path: 'count', cmp: 'lt', value: 5 }, state)).toBe(true)
  })

  it('and / or / not composition', () => {
    const andExpr: PredicateExpr = {
      op: 'and',
      exprs: [
        { op: 'cmp', path: 'count', cmp: 'gte', value: 3 },
        { op: 'truthy', path: 'verdict.passed' },
      ],
    }
    expect(evaluatePredicate(andExpr, state)).toBe(true)
    expect(evaluatePredicate({ op: 'not', expr: andExpr }, state)).toBe(false)
    const orExpr: PredicateExpr = {
      op: 'or',
      exprs: [
        { op: 'cmp', path: 'count', cmp: 'gt', value: 100 },
        { op: 'exists', path: 'tags' },
      ],
    }
    expect(evaluatePredicate(orExpr, state)).toBe(true)
  })

  it('truthy treats 0/false/null/undefined as false', () => {
    expect(evaluatePredicate({ op: 'truthy', path: 'count' }, { count: 0 })).toBe(false)
    expect(evaluatePredicate({ op: 'truthy', path: 'count' }, { count: 1 })).toBe(true)
    expect(evaluatePredicate({ op: 'truthy', path: 'nope' }, {})).toBe(false)
  })

  it('missing path in cmp returns false (never throws)', () => {
    expect(evaluatePredicate({ op: 'cmp', path: 'a.b.c', cmp: 'eq', value: 1 }, {})).toBe(false)
  })

  it('malformed expr throws PredicateError with op name', () => {
    expect(() => evaluatePredicate({ op: 'cmp', path: 'x', cmp: 'bad' as never, value: 1 }, {}))
      .toThrow(/cmp/)
  })
})
