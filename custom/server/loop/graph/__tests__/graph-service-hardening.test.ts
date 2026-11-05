// overlay/custom/server/loop/graph/__tests__/graph-service-hardening.test.ts
// P1 Task 1 — GraphService 加固：registry 从事件日志重建 / fork 显式语义 / 三处收紧
import { describe, it, expect } from 'vitest'
import { GraphService } from '../graph-service'
import { InMemoryEventLogStore } from '../event-log-store'
import { GraphBuilder, fnNode, humanNode } from '../graph-definition'
import { reducers, type StateValues } from '../types'

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

function plainGraph() {
  return new GraphBuilder('plain', 'P')
    .addChannel('x', { reducer: reducers.overwrite(), default: 0 })
    .addNode(fnNode('a', async () => ({}))).setEntry('a').build()
}

describe('registry rebuild from event log', () => {
  it('rebuilds run list with derived statuses after restart', async () => {
    const log = new InMemoryEventLogStore()
    const svc1 = new GraphService({ eventLog: log })
    svc1.registerGraph(approvalGraph())
    const { runId: doneRun } = await svc1.startRun('approval-flow')
    // 再跑一个并完成它（走无 interrupt 的图）
    svc1.registerGraph(plainGraph())
    const { runId: plainRun, instance } = await svc1.startRun('plain')
    expect(instance.status).toBe('completed')

    // 模拟进程重启：新 service、同一 eventLog
    const svc2 = new GraphService({ eventLog: log })
    svc2.registerGraph(approvalGraph())
    svc2.registerGraph(plainGraph())
    const rebuilt = await svc2.rebuildRegistryFromLog()
    expect(rebuilt).toBe(2)
    expect(svc2.getRun(doneRun)?.status).toBe('awaiting-input')
    expect(svc2.getRun(plainRun)?.status).toBe('completed')
  })

  it('consumed-and-completed fork run is not silently re-runnable after rebuild', async () => {
    const log = new InMemoryEventLogStore()
    const svc = new GraphService({ eventLog: log })
    svc.registerGraph(approvalGraph())
    // onEvent 订阅方能感知 fork run 启动（fork 消费路径补发 graph.started）
    const seen: string[] = []
    svc.onEvent(e => seen.push(e.type))
    const { runId } = await svc.startRun('approval-flow')
    const { runId: forked } = await svc.forkRun(runId, 1)
    seen.length = 0
    await svc.startRun('approval-flow', undefined, forked)
    expect(seen).toContain('graph.started')
    // fork run 完整走完
    const cp = await svc['eventLog'].getLatestCheckpoint(forked)
    const done = await svc.resumeRun(forked, cp!.pendingInterrupts[0].id, 'yes')
    expect(done.status).toBe('completed')

    // 模拟进程重启：重建后已完成 fork run 无 forkBase，startRun 必须抛错而非重跑
    const svc2 = new GraphService({ eventLog: log })
    svc2.registerGraph(approvalGraph())
    const rebuilt = await svc2.rebuildRegistryFromLog()
    expect(rebuilt).toBe(2)
    expect(svc2.getRun(forked)?.status).toBe('completed')
    await expect(svc2.startRun('approval-flow', undefined, forked)).rejects.toThrow(/already started/i)
  })

  it('consumed fork awaiting human input rebuilds as awaiting-input (resumable)', async () => {
    const log = new InMemoryEventLogStore()
    const svc = new GraphService({ eventLog: log })
    svc.registerGraph(approvalGraph())
    const { runId } = await svc.startRun('approval-flow')
    const { runId: forked } = await svc.forkRun(runId, 1)
    await svc.startRun('approval-flow', undefined, forked) // awaiting-input 等真人

    // 重启重建：fork 自身日志流无 interrupt.raised，须从 checkpoint pendingInterrupts 推导
    const svc2 = new GraphService({ eventLog: log })
    svc2.registerGraph(approvalGraph())
    await svc2.rebuildRegistryFromLog()
    expect(svc2.getRun(forked)?.status).toBe('awaiting-input')
    const cp = await log.getLatestCheckpoint(forked)
    const done = await svc2.resumeRun(forked, cp!.pendingInterrupts[0].id, 'after-restart')
    expect(done.status).toBe('completed')
    expect((done.state.steps as string[]).some(s => s.includes('after-restart'))).toBe(true)
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
    // plain 图必须注册，否则先撞 "Graph not registered" 而测不到 c-1 分支
    svc.registerGraph(plainGraph())
    const { runId } = await svc.startRun('approval-flow')
    const { runId: forked } = await svc.forkRun(runId, 1)
    await expect(svc.startRun('plain', undefined, forked)).rejects.toThrow(/belongs to graph/)
  })
})

// ── P1 Task 8：图运行 UUID 化 + 旧序号记录兼容 ─────────────────────────────
// P0 审查实锤缺陷的反面：双 service 同 event log 重建后，进程内 seqCounters 归零
// 会让新 run 复用旧 runId（撞既有日志流）。UUID 化后新 run/fork 永不复用；
// 旧 run-<graph>-<seq> 记录（老构建写入）rebuild/resume 语义不回归。

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('run UUID identity (P1 Task 8)', () => {
  it('新 runId 形如 run-<graphId>-<uuid>；fork 形如 run-<graphId>-fork-<uuid>', async () => {
    const svc = new GraphService({ eventLog: new InMemoryEventLogStore() })
    svc.registerGraph(approvalGraph())
    const { runId } = await svc.startRun('approval-flow')
    const m = /^run-approval-flow-(.+)$/.exec(runId)
    expect(m).not.toBeNull()
    expect(UUID_RE.test(m![1])).toBe(true)
    const { runId: forked } = await svc.forkRun(runId, 1)
    const fm = /^run-approval-flow-fork-(.+)$/.exec(forked)
    expect(fm).not.toBeNull()
    expect(UUID_RE.test(fm![1])).toBe(true)
  })

  it('双 service 同 event log：重建后新 startRun 不复用旧 runId（P0 审查实锤缺陷的反面）', async () => {
    const log = new InMemoryEventLogStore()
    const svc1 = new GraphService({ eventLog: log })
    svc1.registerGraph(approvalGraph())
    const { runId: first } = await svc1.startRun('approval-flow')
    // 进程重启：新 service 重建（旧实现 seqCounters 归零 → 第二个 run 撞 first 的 id）
    const svc2 = new GraphService({ eventLog: log })
    svc2.registerGraph(approvalGraph())
    await svc2.rebuildRegistryFromLog()
    const { runId: second } = await svc2.startRun('approval-flow')
    expect(second).not.toBe(first)
    // 两个 run 同时可读可回放（不串流）
    expect(svc2.getRun(first)).not.toBeNull()
    expect(svc2.getRun(second)).not.toBeNull()
    expect((await svc2.replayRun(first)).length).toBeGreaterThan(0)
    expect((await svc2.replayRun(second)).length).toBeGreaterThan(0)
    // 事件流按 runId 分离：first 的事件不带 second 的 runId
    const firstEvents = await log.query(first)
    expect(firstEvents.every(e => e.runId === first)).toBe(true)
  })

  it('旧序号记录 run-<graph>-1：rebuild 可读、resume 真恢复、新 run 不复用其 id', async () => {
    const log = new InMemoryEventLogStore()
    const svc = new GraphService({ eventLog: log })
    svc.registerGraph(approvalGraph())
    const { runId: liveRun } = await svc.startRun('approval-flow')
    const cp = await log.getLatestCheckpoint(liveRun)
    expect(cp).not.toBeNull()

    // 种入老构建形态的序号 run：事件 + checkpoint 内容拷贝自真实 run（runId 改名），
    // 与旧服务写入的字节形状同构。
    const legacyId = 'run-approval-flow-1'
    await log.append({ runId: legacyId, graphId: 'approval-flow', ts: Date.now() - 5000, kind: 'run.started', payload: {} })
    await log.append({
      runId: legacyId, graphId: 'approval-flow', ts: Date.now() - 4000, kind: 'interrupt.raised',
      nodeId: 'gate', payload: { interruptId: cp!.pendingInterrupts[0].id, value: cp!.pendingInterrupts[0].value },
    })
    await log.saveCheckpoint({ ...cp!, id: `${legacyId}-cp`, runId: legacyId })

    // 重启重建：旧序号 run 与 UUID run 并存可读
    const svc2 = new GraphService({ eventLog: log })
    svc2.registerGraph(approvalGraph())
    const rebuilt = await svc2.rebuildRegistryFromLog()
    expect(rebuilt).toBe(2)
    expect(svc2.getRun(legacyId)?.status).toBe('awaiting-input')

    // resume 真恢复：从 checkpoint 应答 interrupt 走到 completed
    const legacyCp = await log.getLatestCheckpoint(legacyId)
    const done = await svc2.resumeRun(legacyId, legacyCp!.pendingInterrupts[0].id, 'legacy-resume')
    expect(done.status).toBe('completed')

    // 新 run 不复用旧序号 id
    const { runId: fresh } = await svc2.startRun('approval-flow')
    expect(fresh).not.toBe(legacyId)
    expect(UUID_RE.test(/^run-approval-flow-(.+)$/.exec(fresh)![1])).toBe(true)
  })
})
