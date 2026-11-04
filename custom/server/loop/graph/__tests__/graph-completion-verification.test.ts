// W1 执法轮：graph 终态事件携带 finishReason 与 verification（节点结局对账）——
// 「跑完」不再等价于「全绿」，失败被 onError 路由的 run 完成时质量面可见。
import { describe, it, expect } from 'vitest'
import { GraphRuntime } from '../graph-runtime'
import { GraphBuilder, fnNode } from '../graph-definition'
import { reducers } from '../types'
import type { GraphEvent } from '../types'

function builder(): GraphBuilder {
  return new GraphBuilder('verify-graph', 'Verify Graph', '终态对账测试')
    .addChannel('count', { reducer: reducers.overwrite(), default: 0 })
}

describe('graph 终态对账（W1）', () => {
  it('全绿完成：graph.completed 带 finishReason=no-next-nodes 与全零失败 verification', async () => {
    const events: GraphEvent[] = []
    const runtime = new GraphRuntime({ emitEvent: (e) => { events.push(e) } })
    const graph = builder()
      .addNode(fnNode('a', async () => ({ update: { count: 1 } })))
      .addNode(fnNode('b', async () => ({ update: { count: 2 } })))
      .setEntry('a')
      .addEdge('a', 'b')
      .build()

    const instance = await runtime.start(graph, 'th-1')
    expect(instance.status).toBe('completed')
    const completed = events.find((e) => e.type === 'graph.completed') as Extract<GraphEvent, { type: 'graph.completed' }>
    expect(completed).toBeDefined()
    expect(completed.finishReason).toBe('no-next-nodes')
    expect(completed.verification).toEqual({ nodesCompleted: 2, nodesFailed: 0, nodesErrorRouted: 0, interruptsRaised: 0 })
  })

  it('失败被 onError 路由：run 仍完成，但 verification.nodesErrorRouted>0（质量面可见）', async () => {
    const events: GraphEvent[] = []
    const runtime = new GraphRuntime({ emitEvent: (e) => { events.push(e) } })
    const graph = builder()
      .addNode({
        id: 'risky', type: 'function', label: 'risky',
        execute: async () => { throw new Error('boom') },
        onError: { type: 'goto', target: 'fallback' },
      })
      .addNode(fnNode('fallback', async () => ({ update: { count: 9 } })))
      .setEntry('risky')
      .addEdge('risky', 'fallback')
      .build()

    const instance = await runtime.start(graph, 'th-2')
    expect(instance.status).toBe('completed')
    const completed = events.find((e) => e.type === 'graph.completed') as Extract<GraphEvent, { type: 'graph.completed' }>
    expect(completed).toBeDefined()
    expect(completed.verification).toEqual({ nodesCompleted: 1, nodesFailed: 1, nodesErrorRouted: 1, interruptsRaised: 0 })
  })

  it('致命失败：graph.failed 带 finishReason=node-error 与 verification.nodesFailed>0', async () => {
    const events: GraphEvent[] = []
    const runtime = new GraphRuntime({ emitEvent: (e) => { events.push(e) } })
    const graph = builder()
      .addNode(fnNode('a', async () => ({ update: { count: 1 } })))
      .addNode({
        id: 'bad', type: 'function', label: 'bad',
        execute: async () => { throw new Error('fatal-boom') },
      })
      .setEntry('a')
      .addEdge('a', 'bad')
      .build()

    const instance = await runtime.start(graph, 'th-3')
    expect(instance.status).toBe('failed')
    const failed = events.find((e) => e.type === 'graph.failed') as Extract<GraphEvent, { type: 'graph.failed' }>
    expect(failed).toBeDefined()
    expect(failed.finishReason).toBe('node-error')
    expect(failed.verification).toEqual({ nodesCompleted: 1, nodesFailed: 1, nodesErrorRouted: 0, interruptsRaised: 0 })
  })
})
