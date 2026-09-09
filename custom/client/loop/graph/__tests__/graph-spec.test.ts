// overlay/custom/client/loop/graph/__tests__/graph-spec.test.ts
import { describe, it, expect } from 'vitest'
import {
  validateGraphSpec, hydrateGraphSpec, GraphSpecError,
  type GraphSpec,
} from '../../../../server/loop/graph/graph-spec'
import { NodeRegistry } from '../../../../server/loop/graph/node-registry'
import { reducers } from '../../../../server/loop/graph/types'

function baseSpec(): GraphSpec {
  return {
    id: 'g1', version: 1,
    channels: { count: { reducer: 'overwrite', default: 0 } },
    nodes: [
      { id: 'a', type: 'function', config: { execute: 'noop' } },
      { id: 'b', type: 'function', config: { execute: 'noop' } },
    ],
    edges: [{ from: 'a', to: 'b' }],
    entryNode: 'a',
    limits: { maxSteps: 50 },
  }
}

describe('validateGraphSpec', () => {
  it('accepts a valid DAG', () => {
    expect(() => validateGraphSpec(baseSpec())).not.toThrow()
  })

  it('rejects missing entry node', () => {
    const s = baseSpec(); s.entryNode = 'nope'
    expect(() => validateGraphSpec(s)).toThrow(GraphSpecError)
  })

  it('rejects edge referencing unknown node', () => {
    const s = baseSpec(); s.edges.push({ from: 'a', to: 'ghost' })
    expect(() => validateGraphSpec(s)).toThrow(/ghost/)
  })

  it('rejects unknown channel reducer name', () => {
    const s = baseSpec(); s.channels.bad = { reducer: 'nope' as never }
    expect(() => validateGraphSpec(s)).toThrow(GraphSpecError)
  })

  it('accepts a guarded back edge (cycle with guard)', () => {
    const s = baseSpec()
    s.edges.push({ from: 'b', to: 'a', guard: { maxIterations: 3 } })
    expect(() => validateGraphSpec(s)).not.toThrow()
  })

  it('rejects an unguarded back edge', () => {
    const s = baseSpec()
    s.edges.push({ from: 'b', to: 'a' })
    expect(() => validateGraphSpec(s)).toThrow(/guard/i)
  })

  it('rejects guard.maxIterations < 1', () => {
    const s = baseSpec()
    s.edges.push({ from: 'b', to: 'a', guard: { maxIterations: 0 } })
    expect(() => validateGraphSpec(s)).toThrow(GraphSpecError)
  })

  it('rejects unreachable node (not entry, no inbound)', () => {
    const s = baseSpec()
    s.nodes.push({ id: 'orphan', type: 'function', config: {} })
    expect(() => validateGraphSpec(s)).toThrow(/orphan/)
  })
})

describe('hydrateGraphSpec', () => {
  function registry(): NodeRegistry {
    const r = new NodeRegistry()
    r.register('function', (config) => ({
      id: config.id as string,
      type: 'function' as const,
      label: (config.id as string),
      execute: async () => ({ update: {} }),
    }))
    return r
  }

  it('produces GraphDef with compiled predicate edges', () => {
    const s = baseSpec()
    s.edges = [{ from: 'a', to: 'b', condition: { op: 'cmp', path: 'count', cmp: 'gte', value: 1 } }]
    s.endCondition = { op: 'truthy', path: 'done' }
    const def = hydrateGraphSpec(s, registry())
    expect(def.id).toBe('g1')
    expect(def.maxSteps).toBe(50)
    expect(def.nodes.has('a')).toBe(true)
    expect(def.stateSchema.count.reducer(1, 2)).toBe(2) // overwrite
    const edge = def.edges[0]
    expect(typeof edge.condition).toBe('function')
    expect(edge.condition!({ count: 1 })).toBe('b')
    expect(edge.condition!({ count: 0 })).toBe(null)
    expect(def.endCondition!({ done: true })).toBe(true)
    expect(def.endCondition!({})).toBe(false)
  })

  it('carries guard/onError/joinMode into runtime defs', () => {
    const s = baseSpec()
    s.edges.push({ from: 'b', to: 'a', guard: { maxIterations: 2 } })
    s.nodes[1].onError = { type: 'goto', target: 'a' }
    s.nodes[1].joinMode = 'any'
    const def = hydrateGraphSpec(s, registry())
    expect(def.edges[1].guard?.maxIterations).toBe(2)
    expect(def.nodes.get('b')!.onError).toEqual({ type: 'goto', target: 'a' })
    expect(def.nodes.get('b')!.joinMode).toBe('any')
  })

  it('throws for unknown node type', () => {
    const s = baseSpec(); s.nodes[0].type = 'mystery'
    expect(() => hydrateGraphSpec(s, registry())).toThrow(/mystery/)
  })
})
