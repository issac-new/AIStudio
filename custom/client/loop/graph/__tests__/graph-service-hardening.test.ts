// overlay/custom/client/loop/graph/__tests__/graph-service-hardening.test.ts
// P1 Task 1 — GraphService 加固：registry 从事件日志重建 / fork 显式语义 / 三处收紧
import { describe, it, expect } from 'vitest'
import { GraphService } from '../../../../server/loop/graph/graph-service'
import { InMemoryEventLogStore } from '../../../../server/loop/graph/event-log-store'
import { GraphBuilder, fnNode, humanNode } from '../../../../server/loop/graph/graph-definition'
import { reducers, type StateValues } from '../../../../server/loop/graph/types'

function approvalGraph(id = 'approval-flow') {
  return new GraphBuilder(id, 'Approval')
    .addChannel('steps', { reducer: reducers.append(), default: [] as string[] })
    .addNode(fnNode('work', async () => ({ update: { steps: ['work'] } })))
    .addNode(humanNode('gate', 'approve?'))
    .addNode(fnNode('finish', async (s: StateValues) => {
      const key = Object.keys(s).find(k => k.startsWith('__resume:'))
      return { update: { steps: [`finish:${String(key ? s[key] : 'no-resume')}`] } }
    }))
    .setEntry('work').addEdge('work', 'gate').addEdge('gate', 'finish')
    .build()
}

describe('registry rebuild from event log', () => {
  it('rebuilds run list with derived statuses after restart', async () => {
    const log = new InMemoryEventLogStore()
    const svc1 = new GraphService({ eventLog: log })
    svc1.registerGraph(approvalGraph())
    const { runId: doneRun } = await svc1.startRun('approval-flow')
    // 再跑一个并完成它（走无 interrupt 的图）
    svc1.registerGraph(new GraphBuilder('plain', 'P')
      .addChannel('x', { reducer: reducers.overwrite(), default: 0 })
      .addNode(fnNode('a', async () => ({}))).setEntry('a').build())
    const { runId: plainRun, instance } = await svc1.startRun('plain')
    expect(instance.status).toBe('completed')

    // 模拟进程重启：新 service、同一 eventLog
    const svc2 = new GraphService({ eventLog: log })
    svc2.registerGraph(approvalGraph())
    svc2.registerGraph(new GraphBuilder('plain', 'P')
      .addChannel('x', { reducer: reducers.overwrite(), default: 0 })
      .addNode(fnNode('a', async () => ({}))).setEntry('a').build())
    const rebuilt = await svc2.rebuildRegistryFromLog()
    expect(rebuilt).toBe(2)
    expect(svc2.getRun(doneRun)?.status).toBe('awaiting-input')
    expect(svc2.getRun(plainRun)?.status).toBe('completed')
  })
})

describe('resume/input validation', () => {
  it('rejects unknown interruptId', async () => {
    const svc = new GraphService({ eventLog: new InMemoryEventLogStore() })
    svc.registerGraph(approvalGraph())
    const { runId } = await svc.startRun('approval-flow')
    await expect(svc.resumeRun(runId, 'bogus-id', 'yes')).rejects.toThrow(/interrupt/i)
  })

  it('getRun returns a defensive copy', async () => {
    const svc = new GraphService({ eventLog: new InMemoryEventLogStore() })
    svc.registerGraph(approvalGraph())
    const { runId } = await svc.startRun('approval-flow')
    const rec = svc.getRun(runId)!
    rec.instance.status = 'failed' // 外部污染
    expect(svc.getRun(runId)?.status).toBe('awaiting-input')
  })
})

describe('fork resume semantics (fixed)', () => {
  it('fork of an interrupted run resumes as awaiting-input, never auto-answers', async () => {
    const svc = new GraphService({ eventLog: new InMemoryEventLogStore() })
    svc.registerGraph(approvalGraph())
    const { runId } = await svc.startRun('approval-flow')
    const { runId: forked } = await svc.forkRun(runId, 1)
    // fork 产物进入 awaiting-input（继承基底的 pendingInterrupt），不自动应答
    const started = await svc.startRun('approval-flow', undefined, forked)
    expect(started.instance.status).toBe('awaiting-input')
    // 真人 resume 后正常走完
    const cp = await svc['eventLog'].getLatestCheckpoint(forked)
    const done = await svc.resumeRun(forked, cp!.pendingInterrupts[0].id, 'human-yes')
    expect(done.status).toBe('completed')
    const steps = done.state.steps as string[]
    expect(steps.some(s => s.includes('human-yes'))).toBe(true)
  })

  it('startRun with mismatched graphId for fork runId throws', async () => {
    const svc = new GraphService({ eventLog: new InMemoryEventLogStore() })
    svc.registerGraph(approvalGraph())
    const { runId } = await svc.startRun('approval-flow')
    const { runId: forked } = await svc.forkRun(runId, 1)
    await expect(svc.startRun('plain', undefined, forked)).rejects.toThrow()
  })
})
