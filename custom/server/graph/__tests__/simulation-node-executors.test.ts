// overlay/custom/server/graph/__tests__/simulation-node-executors.test.ts
// 一期对接层守门：六种节点类型注册 + 26 步模板可 hydrate + agent-task 建卡/等卡/幂等/阻塞语义
// （设计正本 2026-10-08-team-parallel-dev-capability.md §5 一期验收锚）

import { describe, expect, it } from 'vitest'
import { NodeRegistry } from '../../loop/graph/node-registry'
import { hydrateGraphSpec } from '../../loop/graph/graph-spec'
import {
  DryRunKanbanBridge,
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

  it('report-gen 未接 fnTable 时大声失败（不静默空跑）', async () => {
    const { registry } = makeRegistry()
    const node = registry.create('report-gen', { id: 'rep' })
    await expect(node.execute({}, { threadId: 't', deps: {} } as never)).rejects.toThrow(/fnTable/)
  })
})
