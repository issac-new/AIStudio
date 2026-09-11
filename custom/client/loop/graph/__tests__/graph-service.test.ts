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

  // -------------------------------------------------------------------------
  // P3 台账（T2 顺延 P4 清偿）：graph.forked / graph.failed 直发事件补 eid——
  // 与 runtime 回填同格式 `<runId>-<seq>`，graph-socket 下发副本携带 eid，
  // 前端按 eid 去重不再依赖 type+ts+nodeId 复合键兜底。
  // -------------------------------------------------------------------------

  it('graph.forked carries eid = <forkedId>-<seq of run.forked> (P3 台账 T2)', async () => {
    const svc = new GraphService({ eventLog: new InMemoryEventLogStore() })
    const captured: Array<{ type: string; eid?: string }> = []
    svc.onEvent(e => { captured.push({ type: (e as { type: string }).type, eid: (e as { eid?: string }).eid }) })
    svc.registerGraph(approvalGraph())
    const { runId } = await svc.startRun('approval-flow')
    const { runId: forkedId } = await svc.forkRun(runId, 1)

    const forked = captured.find(e => e.type === 'graph.forked')!
    // eid 格式 <forkedId>-<seq>（seq 为 store 全局计数器，不假定从 1 起）
    expect(forked.eid?.startsWith(`${forkedId}-`)).toBe(true)
    // eid 与 graph:history 同源：回放该流，run.forked 日志事件携带同一 eid 与 seq
    const replay = await svc.replayRun(forkedId)
    const forkedLog = replay.find(e => e.kind === 'run.forked')!
    expect(forked.eid).toBe(forkedLog.eid)
    expect(forked.eid).toBe(`${forkedId}-${forkedLog.seq}`)
  })

  it('graph.failed carries eid = <runId>-<seq of run.failed> after the append settles (P3 台账 T2)', async () => {
    const eventLog = new InMemoryEventLogStore()
    const svc = new GraphService({ eventLog })
    // 捕获事件引用（非快照）——eid 回填发生在 append resolve 的微任务里，
    // 引用 held 的对象随后被 mutate，graph-socket 正是靠延迟快照读到它
    const captured: unknown[] = []
    svc.onEvent(e => { captured.push(e) })
    // awaiting-input 的 run 才能 failRun（终态 run 直接返回 null）
    svc.registerGraph(approvalGraph())
    const { runId } = await svc.startRun('approval-flow')

    svc.failRun(runId, 'interrupt timeout: test')
    // eid 回填在 append resolve 的微任务里——两步微任务后（graph-socket 同款等待）可读
    await new Promise(r => queueMicrotask(() => queueMicrotask(r)))
    const failed = captured.find(e => (e as { type: string }).type === 'graph.failed') as { type: string; eid?: string }
    expect(failed.eid?.startsWith(`${runId}-`)).toBe(true)
    // 与日志侧 eid 同源：run.failed 日志事件携带同一 eid 与 seq
    const replay = await svc.replayRun(runId)
    const failedLog = replay.find(e => e.kind === 'run.failed')!
    expect(failed.eid).toBe(failedLog.eid)
    expect(failed.eid).toBe(`${runId}-${failedLog.seq}`)
  })
})
