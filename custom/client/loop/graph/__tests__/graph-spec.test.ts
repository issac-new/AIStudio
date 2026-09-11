// overlay/custom/client/loop/graph/__tests__/graph-spec.test.ts
import { describe, it, expect } from 'vitest'
import {
  validateGraphSpec, hydrateGraphSpec, analyzeGraphSpec, GraphSpecError,
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

  // 台账 f1：reducer 判定按自有属性——'constructor'/'toString' 等原型链键必须拒绝
  it('rejects prototype-chain reducer names like "constructor"', () => {
    const s = baseSpec(); s.channels.evil = { reducer: 'constructor' }
    expect(() => validateGraphSpec(s)).toThrow(GraphSpecError)
    expect(() => validateGraphSpec(s)).toThrow(/constructor/)
    const s2 = baseSpec(); s2.channels.evil2 = { reducer: 'toString' }
    expect(() => validateGraphSpec(s2)).toThrow(GraphSpecError)
  })

  // 台账 f4：onError.goto / retry-goto 的 target 必须是已知节点
  it('rejects onError.goto target pointing at unknown node', () => {
    const s = baseSpec()
    s.nodes[1].onError = { type: 'goto', target: 'ghost' }
    expect(() => validateGraphSpec(s)).toThrow(/ghost/)
  })

  it('rejects onError.retry-goto target pointing at unknown node', () => {
    const s = baseSpec()
    s.nodes[1].onError = { type: 'retry-goto', target: 'ghost', maxAttempts: 2 }
    expect(() => validateGraphSpec(s)).toThrow(/ghost/)
  })

  it('accepts onError routes to known nodes', () => {
    const s = baseSpec()
    s.nodes[1].onError = { type: 'goto', target: 'a' }
    expect(() => validateGraphSpec(s)).not.toThrow()
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

  // ── P4：元数据字段（description / meta / containers / origin）──

  it('accepts description/meta/containers/origin metadata', () => {
    const s = baseSpec()
    s.description = '可编排模板'
    s.origin = 'editor'
    s.meta = {
      goal: '交付特性', cron: '0 9 * * *', permissionLevel: 'auto-edit',
      sensitivePaths: ['secrets/**'], worktreePolicy: 'manual', gateCommands: ['npm test'],
    }
    s.containers = [{ id: 'loop-1', label: '迭代环', nodeIds: ['a', 'b'] }]
    expect(() => validateGraphSpec(s)).not.toThrow()
  })

  it('rejects container referencing unknown node', () => {
    const s = baseSpec()
    s.containers = [{ id: 'c1', nodeIds: ['a', 'ghost'] }]
    expect(() => validateGraphSpec(s)).toThrow(/ghost/)
  })

  it('rejects duplicate container id and multi-container node membership', () => {
    const s = baseSpec()
    s.containers = [
      { id: 'c1', nodeIds: ['a'] },
      { id: 'c1', nodeIds: ['b'] },
    ]
    expect(() => validateGraphSpec(s)).toThrow(/c1/)
    const s2 = baseSpec()
    s2.containers = [
      { id: 'c1', nodeIds: ['a'] },
      { id: 'c2', nodeIds: ['a'] },
    ]
    expect(() => validateGraphSpec(s2)).toThrow(/a.*c(1|2)/i)
  })

  it('rejects invalid origin value', () => {
    const s = baseSpec()
    ;(s as { origin?: string }).origin = 'mystery'
    expect(() => validateGraphSpec(s)).toThrow(/origin/i)
  })
})

describe('analyzeGraphSpec（P4 死图检测，spec §7B.3 分支铁律四条）', () => {
  /** 菱形分叉：f → b1/b2 → join → end；endCondition 就位避免 no-end 噪音 */
  function diamondSpec(): GraphSpec {
    return {
      id: 'g', version: 1,
      channels: { done: { reducer: 'overwrite', default: false } },
      nodes: ['f', 'b1', 'b2', 'join', 'end'].map(id => ({ id, type: 'function', config: { execute: 'noop' } })),
      edges: [
        { from: 'f', to: 'b1' }, { from: 'f', to: 'b2' },
        { from: 'b1', to: 'join' }, { from: 'b2', to: 'join' },
        { from: 'join', to: 'end' },
      ],
      entryNode: 'f',
      endCondition: { op: 'truthy', path: 'done' },
      limits: { maxSteps: 50 },
    }
  }

  it('clean diamond produces zero warnings', () => {
    expect(analyzeGraphSpec(diamondSpec())).toEqual([])
  })

  it('flags cross-branch edge（分支间互依）', () => {
    const s = diamondSpec()
    s.edges.push({ from: 'b1', to: 'b2' })
    const w = analyzeGraphSpec(s)
    expect(w.some(x => x.code === 'branch-cross-edge' && x.edgeIndex === 5)).toBe(true)
  })

  it('flags branch escape edge（绕过 join 回主流程）', () => {
    const s = diamondSpec()
    s.nodes.push({ id: 'late', type: 'function', config: { execute: 'noop' } })
    s.edges.push({ from: 'join', to: 'late' })
    s.edges.push({ from: 'b1', to: 'late' }) // 逃逸：b1 直连 join 下游
    const w = analyzeGraphSpec(s)
    expect(w.some(x => x.code === 'branch-escape-edge' && x.edgeIndex === 6)).toBe(true)
  })

  it('flags fan-out without convergence（分支必须收敛）', () => {
    const s = diamondSpec()
    s.nodes.push(
      { id: 'e1', type: 'function', config: { execute: 'noop' } },
      { id: 'e2', type: 'function', config: { execute: 'noop' } },
    )
    s.edges = [
      { from: 'f', to: 'b1' }, { from: 'f', to: 'b2' },
      { from: 'b1', to: 'e1' }, { from: 'b2', to: 'e2' }, // 两条分支各奔终点，无公共后代
    ]
    const w = analyzeGraphSpec(s)
    expect(w.some(x => x.code === 'fanout-no-converge' && x.nodeId === 'f')).toBe(true)
  })

  it('flags mainline-to-branch edge（主流程上下文不进分支）', () => {
    const s = diamondSpec()
    // 条件路由旁路 s（条件边不构成分叉）无条件直入分支 b1——绕过 fan-out 上下文边界
    s.nodes.push({ id: 's', type: 'function', config: { execute: 'noop' } })
    s.edges.push(
      { from: 'f', to: 's', condition: { op: 'truthy', path: 'done' } },
      { from: 's', to: 'b1' },
    )
    const w = analyzeGraphSpec(s)
    expect(w.some(x => x.code === 'mainline-to-branch')).toBe(true)
  })

  it('guarded join→branch back edge is a repair loop, not a violation', () => {
    const s = diamondSpec()
    // join 回指 b1 构成环 → DFS 回边 → 必须带 guard（repair 语义），不参与铁律告警
    s.edges.push({ from: 'join', to: 'b1', guard: { maxIterations: 2 } })
    const w = analyzeGraphSpec(s)
    expect(w.filter(x => x.code !== 'no-end-condition')).toEqual([])
  })

  it('warns no-end-condition when neither endCondition nor guarded cycle', () => {
    const s = diamondSpec()
    delete s.endCondition
    const w = analyzeGraphSpec(s)
    expect(w.some(x => x.code === 'no-end-condition')).toBe(true)
  })

  it('guarded loop cycle satisfies termination without endCondition', () => {
    const s = diamondSpec()
    delete s.endCondition
    s.edges.push({ from: 'end', to: 'f', guard: { maxIterations: 3 } })
    const w = analyzeGraphSpec(s)
    expect(w.some(x => x.code === 'no-end-condition')).toBe(false)
  })

  it('excludes guarded back edges from branch analysis（守卫回边不算分叉）', () => {
    const s = diamondSpec()
    // f 的第三条出边是守卫回边（自环语义）——不计入 fan-out 判定
    s.edges.push({ from: 'f', to: 'f', guard: { maxIterations: 2 } })
    const w = analyzeGraphSpec(s)
    expect(w.filter(x => x.code !== 'no-end-condition')).toEqual([])
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
