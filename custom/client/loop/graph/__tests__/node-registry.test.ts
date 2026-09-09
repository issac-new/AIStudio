// overlay/custom/client/loop/graph/__tests__/node-registry.test.ts
import { describe, it, expect } from 'vitest'
import { createDefaultRegistry } from '../../../../server/loop/graph/node-registry'
import type { NodeContext } from '../../../../server/loop/graph/types'

const ctx = (deps = {}): NodeContext => ({
  graphId: 'g', threadId: 't', nodeId: 'n', superStep: 0,
  deps: { emitEvent: () => {}, ...deps },
})

describe('createDefaultRegistry', () => {
  it('human node returns interrupt with prompt', async () => {
    const r = createDefaultRegistry()
    const n = r.create('human', { id: 'h', prompt: 'approve?' })
    const res = await n.execute({}, ctx())
    expect(res.interrupt?.value).toMatchObject({ prompt: 'approve?' })
  })

  it('function node resolves execute from fnTable when config.execute is a string', async () => {
    const r = createDefaultRegistry()
    const n = r.create('function', { id: 'f', execute: 'noop' })
    const res = await n.execute({}, ctx({ fnTable: { noop: async () => ({ update: { done: 1 } }) } }))
    expect(res.update).toEqual({ done: 1 })
  })

  it('function node throws when no execute available', async () => {
    const r = createDefaultRegistry()
    const n = r.create('function', { id: 'f' })
    await expect(n.execute({}, ctx())).rejects.toThrow(/execute/)
  })

  it('subgraph delegates to deps.subgraphRunner', async () => {
    const r = createDefaultRegistry()
    const n = r.create('subgraph', { id: 's', subgraphId: 'child' })
    const res = await n.execute({ x: 1 }, ctx({
      subgraphRunner: async (id: string) => ({ update: { from: id } }),
    }))
    expect(res.update).toEqual({ from: 'child' })
  })

  it('subgraph without runner throws actionable error', async () => {
    const r = createDefaultRegistry()
    const n = r.create('subgraph', { id: 's', subgraphId: 'child' })
    await expect(n.execute({}, ctx())).rejects.toThrow(/subgraphRunner/)
  })

  it('loop and retrieval nodes throw not-implemented (P1) instead of silent noop', async () => {
    const r = createDefaultRegistry()
    await expect(r.create('loop', { id: 'l' }).execute({}, ctx())).rejects.toThrow(/P1/)
    await expect(r.create('retrieval', { id: 'r' }).execute({}, ctx())).rejects.toThrow(/P1/)
  })
})
