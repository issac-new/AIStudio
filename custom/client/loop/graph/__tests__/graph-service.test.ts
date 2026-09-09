// overlay/custom/client/loop/graph/__tests__/graph-service.test.ts
// Task 7 — GraphService：Run 注册表 + start/resume/fork 闭环 + 事件订阅 + 回放数据层
//
// 裁决说明（brief Step 3）：humanNode 生成的 interrupt id 为 `${id}-${threadId}-${superStep}`，
// 不写死 `__resume:gate-0`；finish 节点用 startsWith('__resume:') 取值断言 resume 值真的流入状态。
import { describe, it, expect } from 'vitest'
import { GraphService } from '../../../../server/loop/graph/graph-service'
import { InMemoryEventLogStore } from '../../../../server/loop/graph/event-log-store'
import { GraphBuilder, fnNode, humanNode } from '../../../../server/loop/graph/graph-definition'
import { reducers, type StateValues } from '../../../../server/loop/graph/types'

function approvalGraph() {
  return new GraphBuilder('approval-flow', 'Approval')
    .addChannel('steps', { reducer: reducers.append(), default: [] as string[] })
    .addNode(fnNode('work', async () => ({ update: { steps: ['work'] } })))
    .addNode(humanNode('gate', 'approve?'))
    .addNode(fnNode('finish', async (s: StateValues) => {
      const resumeKey = Object.keys(s).find(k => k.startsWith('__resume:'))
      return { update: { steps: [`finish:${String(resumeKey ? s[resumeKey] : 'ok')}`] } }
    }))
    .setEntry('work').addEdge('work', 'gate').addEdge('gate', 'finish')
    .build()
}

describe('GraphService', () => {
  it('start → awaiting-input → resume → completed, runs listed', async () => {
    const svc = new GraphService({ eventLog: new InMemoryEventLogStore() })
    svc.registerGraph(approvalGraph())
    const { runId, instance } = await svc.startRun('approval-flow')
    expect(instance.status).toBe('awaiting-input')
    expect(svc.getRun(runId)?.status).toBe('awaiting-input')

    const cp = await svc['eventLog'].getLatestCheckpoint(runId)
    const done = await svc.resumeRun(runId, cp!.pendingInterrupts[0].id, 'yes')
    expect(done.status).toBe('completed')
    // resume 值经 __resume:<interruptId> 通道真流入后续节点（走 CheckpointManager 分支续跑）
    expect(done.state['steps']).toContain('finish:yes')
    expect(svc.getRun(runId)?.status).toBe('completed')
    expect(svc.listRuns().map(r => r.runId)).toContain(runId)
  })

  it('resume on non-awaiting run throws', async () => {
    const svc = new GraphService({ eventLog: new InMemoryEventLogStore() })
    svc.registerGraph(new GraphBuilder('plain', 'P')
      .addChannel('x', { reducer: reducers.overwrite(), default: 0 })
      .addNode(fnNode('a', async () => ({})))
      .setEntry('a').build())
    const { runId } = await svc.startRun('plain')
    await expect(svc.resumeRun(runId, 'any', 1)).rejects.toThrow(/awaiting/)
  })

  it('forkRun creates an independent run from a past checkpoint', async () => {
    const svc = new GraphService({ eventLog: new InMemoryEventLogStore() })
    svc.registerGraph(approvalGraph())
    const { runId } = await svc.startRun('approval-flow')
    const { runId: forkedId } = await svc.forkRun(runId, 1)
    expect(forkedId).not.toBe(runId)
    // fork 产物以 paused 入注册表，不自动执行
    expect(svc.getRun(forkedId)?.status).toBe('paused')
    const evts = await svc.replayRun(forkedId)
    expect(evts.some(e => e.kind === 'run.forked')).toBe(true)
  })

  it('emits events to subscribers', async () => {
    const svc = new GraphService({ eventLog: new InMemoryEventLogStore() })
    const seen: string[] = []
    svc.onEvent(e => seen.push(e.type))
    svc.registerGraph(new GraphBuilder('g2', 'G2')
      .addChannel('x', { reducer: reducers.overwrite(), default: 0 })
      .addNode(fnNode('a', async () => ({})))
      .setEntry('a').build())
    await svc.startRun('g2')
    expect(seen).toContain('graph.started')
    expect(seen).toContain('graph.completed')
  })
})
