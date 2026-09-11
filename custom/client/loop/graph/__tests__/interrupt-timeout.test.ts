// P2 Task 2 — InterruptTimeoutScanner：interrupt 超时策略（P0 台账 h）
// 三策略：escalate（默认，24h 重发节流）/ auto-approve-with-log（auto 值透传）/ fail（run 置 failed）
// 判定数据源全持久：checkpoint.pendingInterrupts[].raisedAtMs，缺省回退 checkpoint.createdAt——
// 部分用例经 rebuildRegistryFromLog 从事件日志重建 run，顺带钉住"服务重启后扫描自然恢复"。
// fake clock 全程注入（clock: () => now），不 sleep 等真实时间。
import { describe, it, expect, vi } from 'vitest'
import { InterruptTimeoutScanner } from '../../../../server/loop/graph/interrupt-timeout'
import { GraphService } from '../../../../server/loop/graph/graph-service'
import { InMemoryEventLogStore } from '../../../../server/loop/graph/event-log-store'
import { GraphBuilder, fnNode } from '../../../../server/loop/graph/graph-definition'
import { reducers } from '../../../../server/loop/graph/types'
import type { StoredCheckpoint } from '../../../../server/loop/graph/event-log-store'
import type { LoopEvent } from '../../../../server/loop/types'

const HOUR = 3_600_000
/** 固定时钟基准（远早于当前真实时间，避免与真实 Date.now 混淆） */
const T0 = 1_700_000_000_000

function makeCheckpoint(over: Partial<StoredCheckpoint> = {}): StoredCheckpoint {
  return {
    id: 'cp-1', runId: 'run-g-1', graphId: 'loop-9', superStep: 0,
    state: {}, nextNodes: ['gate'], pendingInterrupts: [], iterCounters: {},
    totalCost: 0, startedAtMs: T0, createdAt: new Date(T0).toISOString(),
    ...over,
  }
}

/** 持久 seeded harness：事件 + checkpoint 直落 store，再经 rebuildRegistryFromLog 重建出
 *  awaiting-input 的 run——等价于"服务重启后扫描器面对的现场" */
async function seedAwaitingRun(
  eventLog: InMemoryEventLogStore,
  opts: {
    runId?: string
    graphId?: string
    interruptId?: string
    value?: unknown
    createdAtMs: number
    raisedAtMs?: number
  },
): Promise<string> {
  const runId = opts.runId ?? 'run-g-1'
  const graphId = opts.graphId ?? 'loop-9'
  const interruptId = opts.interruptId ?? 'gate-1'
  await eventLog.append({ runId, graphId, ts: opts.createdAtMs, kind: 'run.started', payload: {} })
  await eventLog.append({
    runId, graphId, ts: opts.createdAtMs, kind: 'interrupt.raised',
    payload: { interruptId, value: opts.value },
  })
  await eventLog.saveCheckpoint(makeCheckpoint({
    id: `cp-${runId}`, runId, graphId,
    createdAt: new Date(opts.createdAtMs).toISOString(),
    pendingInterrupts: [{
      nodeId: 'gate', value: opts.value, id: interruptId,
      ...(opts.raisedAtMs !== undefined ? { raisedAtMs: opts.raisedAtMs } : {}),
    }],
  }))
  return runId
}

interface ScannerHarness {
  eventLog: InMemoryEventLogStore
  graphService: GraphService
  clock: { now: number }
  bridged: LoopEvent[]
  scanner: InterruptTimeoutScanner
}

function makeHarness(
  over: Partial<ConstructorParameters<typeof InterruptTimeoutScanner>[0]> = {},
): ScannerHarness {
  const eventLog = new InMemoryEventLogStore()
  const graphService = new GraphService({ eventLog })
  const clock = { now: T0 }
  const bridged: LoopEvent[] = []
  const scanner = new InterruptTimeoutScanner({
    graphService,
    eventLog,
    clock: () => clock.now,
    emitLoopEvent: e => bridged.push(e),
    log: () => {},
    ...over,
  })
  return { eventLog, graphService, clock, bridged, scanner }
}

const escalationsInLog = async (eventLog: InMemoryEventLogStore, runId: string) =>
  (await eventLog.query(runId, { kind: 'loop.escalated' }))

describe('InterruptTimeoutScanner', () => {
  // -------------------------------------------------------------------------
  // escalate（默认策略）：loop.escalated 兼容事件 + run 保持 awaiting-input
  // -------------------------------------------------------------------------

  it('escalates a timed-out approval with the default policy and keeps the run awaiting-input', async () => {
    const h = makeHarness()
    // 旧 checkpoint：pendingInterrupts 无 raisedAtMs → 回退 checkpoint.createdAt（T0）
    const runId = await seedAwaitingRun(h.eventLog, {
      value: { kind: 'approval', prompt: 'approve?' }, createdAtMs: T0,
    })
    await h.graphService.rebuildRegistryFromLog()
    h.clock.now = T0 + 80 * HOUR // > 72h 默认超时

    await h.scanner.scan()

    // loop.* 兼容事件出站（matrix-bot 通道可消费的形状）
    const evt = h.bridged.find(e => e.type === 'loop.escalated') as
      | { loopId: string; runId?: string; interruptId?: string; reason: string; ts: string } | undefined
    expect(evt).toBeDefined()
    expect(evt!.loopId).toBe('9') // graphId `loop-9` 反解
    expect(evt!.runId).toBe(runId)
    expect(evt!.interruptId).toBe('gate-1')
    expect(evt!.reason).toContain('interrupt timeout')
    expect(evt!.ts).toBe(new Date(T0 + 80 * HOUR).toISOString())

    // 节流水印落事件日志（持久）
    const markers = await escalationsInLog(h.eventLog, runId)
    expect(markers).toHaveLength(1)
    expect(markers[0]!.payload.interruptId).toBe('gate-1')

    // run 保持 awaiting-input：不自动决策、不 resume、不置 failed
    expect(h.graphService.getRun(runId)!.status).toBe('awaiting-input')
    expect(await h.eventLog.query(runId, { kind: 'interrupt.resumed' })).toHaveLength(0)
    expect(await h.eventLog.query(runId, { kind: 'run.failed' })).toHaveLength(0)
  })

  it('re-sends the escalation at most once per 24h (throttle window persisted in the event log)', async () => {
    const h = makeHarness()
    const runId = await seedAwaitingRun(h.eventLog, { createdAtMs: T0 })
    await h.graphService.rebuildRegistryFromLog()

    h.clock.now = T0 + 80 * HOUR
    await h.scanner.scan()
    expect(await escalationsInLog(h.eventLog, runId)).toHaveLength(1)

    h.clock.now = T0 + 90 * HOUR // 距上次升级 10h < 24h → 节流
    await h.scanner.scan()
    expect(await escalationsInLog(h.eventLog, runId)).toHaveLength(1)
    expect(h.bridged.filter(e => e.type === 'loop.escalated')).toHaveLength(1)

    h.clock.now = T0 + 105 * HOUR // 距上次升级 25h ≥ 24h → 重发
    await h.scanner.scan()
    expect(await escalationsInLog(h.eventLog, runId)).toHaveLength(2)
    expect(h.bridged.filter(e => e.type === 'loop.escalated')).toHaveLength(2)
  })

  // -------------------------------------------------------------------------
  // raisedAtMs 优先 / createdAt 回退
  // -------------------------------------------------------------------------

  it('prefers pendingInterrupts[].raisedAtMs and falls back to checkpoint.createdAt for legacy checkpoints', async () => {
    const h = makeHarness()
    // run-old：旧 checkpoint（无 raisedAtMs）→ 回退 createdAt = T0 → 80h 后超时
    await seedAwaitingRun(h.eventLog, { runId: 'run-old', value: { kind: 'approval' }, createdAtMs: T0 })
    // run-fresh：raisedAtMs 更新（T0+79h）→ 80h 时仅挂起 1h，未超时
    await seedAwaitingRun(h.eventLog, {
      runId: 'run-fresh', value: { kind: 'approval' },
      createdAtMs: T0, raisedAtMs: T0 + 79 * HOUR,
    })
    await h.graphService.rebuildRegistryFromLog()

    h.clock.now = T0 + 80 * HOUR
    await h.scanner.scan()

    expect(h.bridged.filter(e => e.type === 'loop.escalated')).toHaveLength(1)
    expect((h.bridged[0] as { runId?: string }).runId).toBe('run-old')
    expect(h.graphService.getRun('run-fresh')!.status).toBe('awaiting-input')
    expect(await escalationsInLog(h.eventLog, 'run-fresh')).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  // auto-approve-with-log：自动 resume，auto 值透传到消费通道 + resumed payload 带 autoApproved
  // -------------------------------------------------------------------------

  /** 自路由审批图：interrupt 后 goto 回本节点消费 __resume 通道 */
  function approvalGraph(graphId: string, timeout: { ms: number; onTimeout: string }) {
    return new GraphBuilder(graphId, graphId)
      .addChannel('decision', { reducer: reducers.overwrite<string>(), default: '' })
      .addChannel('autoFlag', { reducer: reducers.overwrite<boolean>(), default: false })
      .addNode(fnNode('gate', async (state) => {
        const rv = state['__resume:gate-1'] as { decision?: string; auto?: boolean } | undefined
        if (rv !== undefined) {
          return { update: { decision: String(rv.decision ?? ''), autoFlag: rv.auto === true } }
        }
        return {
          interrupt: { id: 'gate-1', value: { kind: 'approval', timeout } },
          goto: ['gate'],
        }
      }))
      .setEntry('gate')
      .build()
  }

  it('auto-approves after the configured timeout and passes { auto, decision, reason } into the resume channel', async () => {
    const h = makeHarness()
    const def = approvalGraph('g-auto', { ms: 2 * HOUR, onTimeout: 'auto-approve-with-log' })
    h.graphService.registerGraph(def)
    const { runId } = await h.graphService.startRun('g-auto')
    expect(h.graphService.getRun(runId)!.status).toBe('awaiting-input')

    // interrupt 的 raisedAtMs 由 runtime 以真实时钟写入；fake clock 相对其前移 3h > 2h 配置
    h.clock.now = Date.now() + 3 * HOUR
    await h.scanner.scan()

    const run = h.graphService.getRun(runId)!
    expect(run.status).toBe('completed')
    // auto 值透传：消费节点从 __resume 通道读到 decision/auto
    expect(run.instance.state.decision).toBe('approved')
    expect(run.instance.state.autoFlag).toBe(true)

    // interrupt.resumed 事件 payload 带 autoApproved:true（顶层投影 + value 内标记）
    const resumed = await h.eventLog.query(runId, { kind: 'interrupt.resumed' })
    expect(resumed).toHaveLength(1)
    expect(resumed[0]!.payload.autoApproved).toBe(true)
    expect(resumed[0]!.payload.value).toEqual({
      auto: true, decision: 'approved', reason: 'timeout', autoApproved: true,
    })
    expect(await h.eventLog.query(runId, { kind: 'run.failed' })).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  // fail：run 置 failed，graph.failed error 含 'interrupt timeout'
  // -------------------------------------------------------------------------

  it('fails the run when the policy is fail, with an error mentioning interrupt timeout', async () => {
    const h = makeHarness()
    const def = approvalGraph('g-fail', { ms: 2 * HOUR, onTimeout: 'fail' })
    h.graphService.registerGraph(def)
    const { runId } = await h.graphService.startRun('g-fail')
    expect(h.graphService.getRun(runId)!.status).toBe('awaiting-input')

    h.clock.now = Date.now() + 3 * HOUR
    await h.scanner.scan()

    expect(h.graphService.getRun(runId)!.status).toBe('failed')
    const failed = await h.eventLog.query(runId, { kind: 'run.failed' })
    expect(failed).toHaveLength(1)
    expect(String(failed[0]!.payload.error)).toContain('interrupt timeout')
    // 未被自动审批
    expect(await h.eventLog.query(runId, { kind: 'interrupt.resumed' })).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  // 未超时 / start-stop interval
  // -------------------------------------------------------------------------

  it('leaves runs untouched before the timeout elapses', async () => {
    const h = makeHarness()
    const runId = await seedAwaitingRun(h.eventLog, { createdAtMs: T0 })
    await h.graphService.rebuildRegistryFromLog()

    h.clock.now = T0 + 72 * HOUR - 1 // 差 1ms 到点
    await h.scanner.scan()

    expect(h.bridged.filter(e => e.type === 'loop.escalated')).toHaveLength(0)
    expect(h.graphService.getRun(runId)!.status).toBe('awaiting-input')
    expect(await escalationsInLog(h.eventLog, runId)).toHaveLength(0)
  })

  it('start() scans on the interval and stop() cancels it', async () => {
    vi.useFakeTimers()
    try {
      const h = makeHarness({ intervalMs: 100 })
      const runId = await seedAwaitingRun(h.eventLog, { createdAtMs: T0 })
      await h.graphService.rebuildRegistryFromLog()
      h.clock.now = T0 + 80 * HOUR

      h.scanner.start()
      await vi.advanceTimersByTimeAsync(150)
      expect(await escalationsInLog(h.eventLog, runId)).toHaveLength(1)

      h.scanner.stop()
      await vi.advanceTimersByTimeAsync(1_000)
      // 24h 节流下也不会再发；stop 后扫描彻底停摆
      expect(await escalationsInLog(h.eventLog, runId)).toHaveLength(1)
      expect(h.bridged.filter(e => e.type === 'loop.escalated')).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  // -------------------------------------------------------------------------
  // 台账 #9（顺延 P4 清偿）：escalate 先落水印再出站——append 失败时兼容事件不发
  // -------------------------------------------------------------------------

  it('does not emit loop.escalated when the watermark append fails (台账 #9：append 先于出站)', async () => {
    const h = makeHarness()
    const runId = await seedAwaitingRun(h.eventLog, { createdAtMs: T0 })
    await h.graphService.rebuildRegistryFromLog()
    h.clock.now = T0 + 80 * HOUR

    // 水印 append 失败的 store：loop.escalated kind 的 append 抛错（其余 kind 经原型链正常）
    const flaky = Object.create(h.eventLog) as typeof h.eventLog
    flaky.append = async (e) => {
      if (e.kind === 'loop.escalated') throw new Error('watermark write failed')
      return h.eventLog.append(e)
    }
    const logs: string[] = []
    const flakyScanner = new InterruptTimeoutScanner({
      graphService: h.graphService,
      eventLog: flaky,
      clock: () => h.clock.now,
      emitLoopEvent: e => h.bridged.push(e),
      log: m => logs.push(m),
    })

    await flakyScanner.scan()

    // append 失败 → 不出站（防 24h 节流窗口内重发）；扫描不因单 run 失败中断
    expect(h.bridged.filter(e => e.type === 'loop.escalated')).toHaveLength(0)
    expect(logs.some(m => m.includes('watermark write failed'))).toBe(true)
    expect(h.graphService.getRun(runId)!.status).toBe('awaiting-input')

    // 水印恢复后下轮扫描自然重试 → 出站且水印在
    h.clock.now = T0 + 81 * HOUR
    await h.scanner.scan()
    expect(await escalationsInLog(h.eventLog, runId)).toHaveLength(1)
    expect(h.bridged.filter(e => e.type === 'loop.escalated')).toHaveLength(1)
  })

  it('watermark is persisted before the bridged event goes out (台账 #9 顺序不变量)', async () => {
    const h = makeHarness()
    await seedAwaitingRun(h.eventLog, { createdAtMs: T0 })
    await h.graphService.rebuildRegistryFromLog()
    h.clock.now = T0 + 80 * HOUR

    // 出站时刻水印必须已可见：出站回调内查询事件日志应能看到 loop.escalated 水印
    let watermarkVisibleAtEmit = false
    let emitProbe = Promise.resolve()
    const probeScanner = new InterruptTimeoutScanner({
      graphService: h.graphService,
      eventLog: h.eventLog,
      clock: () => h.clock.now,
      emitLoopEvent: () => {
        emitProbe = (async () => {
          watermarkVisibleAtEmit = (await escalationsInLog(h.eventLog, 'run-g-1')).length > 0
        })()
      },
      log: () => {},
    })
    await probeScanner.scan()
    await emitProbe
    expect(watermarkVisibleAtEmit).toBe(true)
  })
})
