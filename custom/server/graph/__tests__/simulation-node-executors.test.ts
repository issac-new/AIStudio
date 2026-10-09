// overlay/custom/server/graph/__tests__/simulation-node-executors.test.ts
// 一期对接层守门：六种节点类型注册 + 26 步模板可 hydrate + agent-task 建卡/等卡/幂等/阻塞语义
// （设计正本 2026-10-08-team-parallel-dev-capability.md §5 一期验收锚）

import { describe, expect, it } from 'vitest'
import { NodeRegistry } from '../../loop/graph/node-registry'
import { hydrateGraphSpec } from '../../loop/graph/graph-spec'
import {
  DryRunKanbanBridge,
  HttpKanbanBridge,
  SIMULATION_NODE_TYPES,
  SIMULATION_REDUCERS,
  registerSimulationNodeTypes,
  type KanbanBridge,
} from '../node-executors'
import { defaultSimulationGraph } from '../simulation-graph-template'

/** 便捷：注册好六类型的 registry + 可断言的桥 */
function makeRegistry(bridge?: KanbanBridge) {
  const registry = new NodeRegistry()
  const dry = bridge ?? new DryRunKanbanBridge()
  registerSimulationNodeTypes(registry, { bridge: dry, pollIntervalMs: 1, pollMaxIntervalMs: 1, taskTimeoutMs: 50 })
  return { registry, dry: dry as DryRunKanbanBridge }
}

describe('registerSimulationNodeTypes', () => {
  it('注册全部六种模板节点类型', () => {
    const { registry } = makeRegistry()
    for (const t of SIMULATION_NODE_TYPES) {
      expect(registry.listTypes()).toContain(t)
    }
    expect(registry.listTypes()).toHaveLength(6)
  })

  it('26 步模板 hydrate 不再 Unknown node type（一期核心验收）', () => {
    const { registry } = makeRegistry()
    const def = hydrateGraphSpec(defaultSimulationGraph(), registry, SIMULATION_REDUCERS)
    expect(def.nodes.size).toBe(26)
  })

  it('agent-task：建卡→等卡→通道写入完成信号；幂等键防重建', async () => {
    const { registry, dry } = makeRegistry()
    const node = registry.create('agent-task', {
      id: 'm1-coding',
      title: 'pay-core 编码',
      assignee: 'chen',
      estimateDays: 1,
      channel: 'm1.coding',
    })
    const r1 = await node.execute({}, { threadId: 'run-1' } as never)
    const r2 = await node.execute({}, { threadId: 'run-1' } as never)
    expect(dry.created).toHaveLength(1) // 同 threadId+node 幂等
    expect(dry.created[0].assignee).toBe('chen')
    expect(dry.created[0].body.estimate_days).toBe(1)
    expect(dry.created[0].idempotencyKey).toBe('graph_node:run-1:m1-coding')
    const upd = r1.update as unknown as Record<string, Array<{ node: string; task: string }>>
    expect(upd['m1.coding'][0].node).toBe('m1-coding')
    expect(upd['m1.coding'][0].task).toBe('dry-t1')
    expect(r2).toEqual(r1)
  })

  it('agent-review/agent-test 复用 agent-task 语义（kind 区分）', async () => {
    const { registry, dry } = makeRegistry()
    await registry.create('agent-review', { id: 'm1-review', title: 'r', channel: 'c1' }).execute({}, { threadId: 'r' } as never)
    await registry.create('agent-test', { id: 'm1-testing', title: 't', channel: 'c2' }).execute({}, { threadId: 'r' } as never)
    expect(dry.created.map((c) => c.body.graph_kind)).toEqual(['review', 'test'])
  })

  it('卡 blocked → 抛错（走 onError 路径），不静默成功', async () => {
    const bridge: KanbanBridge = {
      createTask: async (req) => ({ id: 'tk-1', status: 'running' }),
      getTask: async () => ({ id: 'tk-1', status: 'blocked' }),
    }
    const { registry } = makeRegistry(bridge)
    const node = registry.create('agent-task', { id: 'n', title: 'x', channel: 'c' })
    await expect(node.execute({}, { threadId: 't' } as never)).rejects.toThrow(/blocked/)
  })

  it('human-gate 返回 interrupt；dispatch 直通并记派发时刻', async () => {
    const { registry } = makeRegistry()
    const gate = registry.create('human-gate', { id: 'g1', gate: 'G2' })
    const gi = await gate.execute({}, { threadId: 't' } as never)
    expect(gi.interrupt?.id).toBe('g1-gate')

    const d = registry.create('dispatch', { id: 'dispatch', targets: '$modules' })
    const dr = await d.execute({}, { threadId: 't' } as never)
    const upd = dr.update as unknown as Record<string, Array<{ node: string; targets: string }>>
    expect(upd['dispatch.mark'][0].targets).toBe('$modules')
  })

  it('report-gen 默认建卡报告器：DryRun 桥建「报告编写」卡+完成信号+幂等（三期）', async () => {
    const { registry, dry } = makeRegistry()
    const node = registry.create('report-gen', { id: 'rep', format: 'html', output: 'final-report.html', channel: 'report.gen' })
    const r1 = await node.execute({}, { threadId: 't' } as never)
    const r2 = await node.execute({}, { threadId: 't' } as never)
    expect(dry.created).toHaveLength(1) // 幂等：graph_node:<threadId>:<nodeId>
    expect(dry.created[0].idempotencyKey).toBe('graph_node:t:rep')
    expect(dry.created[0].body.format).toBe('html')
    expect(dry.created[0].body.output).toBe('final-report.html')
    const upd = r1.update as unknown as Record<string, Array<{ node: string; task: string; format: string }>>
    expect(upd['report.gen'][0].node).toBe('rep')
    expect(upd['report.gen'][0].task).toBe('dry-t1')
    expect(upd['report.gen'][0].format).toBe('html')
    expect(r2).toEqual(r1)
  })

  it('report-gen 注入 reportFns 优先；deps.fnTable 次之（三层解析，三期）', async () => {
    const registry = new NodeRegistry()
    const calls: string[] = []
    registerSimulationNodeTypes(registry, {
      bridge: new DryRunKanbanBridge(),
      pollIntervalMs: 1, pollMaxIntervalMs: 1, taskTimeoutMs: 50,
      reportFns: { reportGen: async () => { calls.push('injected'); return { update: {} } as never } },
    })
    const node = registry.create('report-gen', { id: 'rep' })
    await node.execute({}, { threadId: 't', deps: { fnTable: { reportGen: async () => { calls.push('dyn'); return { update: {} } as never } } } } as never)
    expect(calls).toEqual(['injected']) // 注入表赢

    const registry2 = new NodeRegistry()
    registerSimulationNodeTypes(registry2, { bridge: new DryRunKanbanBridge(), pollIntervalMs: 1, pollMaxIntervalMs: 1, taskTimeoutMs: 50 })
    const node2 = registry2.create('report-gen', { id: 'rep2', command: 'custom' })
    await node2.execute({}, { threadId: 't', deps: { fnTable: { custom: async () => { calls.push('dyn2'); return { update: {} } as never } } } } as never)
    expect(calls).toEqual(['injected', 'dyn2']) // 未注入该 key 时动态表接管
  })

  it('HttpKanbanBridge：REST 建卡/查卡路径与响应归一（二期真桥）', async () => {
    const calls: Array<{ url: string; method?: string; body?: unknown }> = []
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url.endsWith('/api/hermes/kanban') && init?.method === 'POST') {
        return new Response(JSON.stringify({ task: { id: 'tk-9', status: 'todo' } }), { status: 200 })
      }
      if (url.includes('/api/hermes/kanban/tk-9')) {
        return new Response(JSON.stringify({ id: 'tk-9', status: 'done' }), { status: 200 })
      }
      return new Response('nope', { status: 404 })
    }) as unknown as typeof fetch
    const bridge = new HttpKanbanBridge({ baseUrl: 'http://127.0.0.1:8802/', fetchImpl, board: 'sim' })
    const ref = await bridge.createTask({
      title: 'pay-core', body: { estimate_days: 1 }, assignee: 'chen', board: 'sim',
      idempotencyKey: 'graph_node:r1:n1',
    })
    expect(ref).toEqual({ id: 'tk-9', status: 'todo' })
    expect(calls[0].url).toBe('http://127.0.0.1:8802/api/hermes/kanban')
    expect(calls[0].body).toMatchObject({ title: 'pay-core', assignee: 'chen', board: 'sim' })
    expect(await bridge.getTask('tk-9')).toEqual({ id: 'tk-9', status: 'done' })
    await expect(bridge.getTask('missing')).rejects.toThrow(/404/)
  })
})
