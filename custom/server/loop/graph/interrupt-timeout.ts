// overlay/custom/server/loop/graph/interrupt-timeout.ts
// P2 Task 2 — InterruptTimeoutScanner：interrupt 超时策略（P0 台账 h）
//
// awaiting-input 的 run 若审批 interrupt 长期无人应答，按策略处置（spec §4）：
// - escalate（默认）：发 loop.escalated 兼容事件（loop 台账 + socket/matrix-bot 通道）+
//   run 保持 awaiting-input（不自动决策）+ 每 24h 重发一次告警（节流）
// - auto-approve-with-log：自动 resume，值 { auto: true, decision: 'approved', reason: 'timeout' }
//   经审批通道消费（normalizeDecisions 识别 approved），resumed 事件 payload 带 autoApproved: true
// - fail：run 置 failed（graph.failed error 含 'interrupt timeout'）
//
// 判定数据源全持久（checkpoint）：raisedAtMs 由 runtime 记录 interrupt 时写入
// pendingInterrupts，旧 checkpoint 无此字段回退 checkpoint.createdAt——服务重启后
// 扫描自然恢复，本模块不持有任何内存态；24h 节流水印也落在事件日志（append-only）。
//
// 策略来源：节点发 interrupt 时把 approval config 的 timeout 挂进 interrupt value
// （phase-nodes），随 checkpoint 持久；value 无 timeout 时用 scanner 级默认（escalate + 72h）。

import type { GraphService } from './graph-service'
import type { EventLogStore, StoredCheckpoint } from './event-log-store'
import type { LoopEvent } from '../types'
import type { InterruptTimeoutAction, InterruptTimeoutConfig } from './phase-nodes'

/** 默认超时：72h（P0 台账 h 裁决值） */
export const DEFAULT_INTERRUPT_TIMEOUT_MS = 72 * 60 * 60 * 1000
/** escalate 重发节流窗口：24h */
export const ESCALATION_RESEND_INTERVAL_MS = 24 * 60 * 60 * 1000

/** 节流水印在 graph 事件日志中的 kind（与 loop.escalated 兼容事件同 id 体） */
const ESCALATION_KIND = 'loop.escalated'

/** auto-approve 的 resume 值：审批通道按 decision:'approved' 消费，
 *  auto/reason 说明来龙去脉，autoApproved 供日志 payload 顶层投影 */
const AUTO_APPROVE_VALUE = {
  auto: true,
  decision: 'approved' as const,
  reason: 'timeout',
  autoApproved: true,
}

export interface InterruptTimeoutScannerOpts {
  graphService: GraphService
  eventLog: EventLogStore
  /** value 无 timeout.ms 时的兜底超时，默认 72h */
  defaultTimeoutMs?: number
  /** 扫描周期，默认与 RunSpawner 同为 30s */
  intervalMs?: number
  /** 时钟注入（测试 fake clock 用），缺省 Date.now */
  clock?: () => number
  /** loop.* 兼容事件出口（装配层桥 bridgeLoopEvent：loop 台账 + socket），缺省仅落事件日志 */
  emitLoopEvent?: (event: LoopEvent) => void
  log?: (msg: string) => void
}

interface TimeoutCandidate {
  interrupt: StoredCheckpoint['pendingInterrupts'][number]
  raisedAtMs: number
  config: InterruptTimeoutConfig | null
}

/** interrupt value 里携带的超时策略（phase-nodes 写入；脏数据按缺省 escalate 处理） */
function timeoutConfigOf(value: unknown): InterruptTimeoutConfig | null {
  if (value == null || typeof value !== 'object') return null
  const raw = (value as { timeout?: unknown }).timeout
  if (raw == null || typeof raw !== 'object') return null
  const cfg = raw as InterruptTimeoutConfig
  const out: InterruptTimeoutConfig = {}
  if (typeof cfg.ms === 'number' && Number.isFinite(cfg.ms) && cfg.ms > 0) out.ms = cfg.ms
  if (cfg.onTimeout === 'escalate' || cfg.onTimeout === 'auto-approve-with-log' || cfg.onTimeout === 'fail') {
    out.onTimeout = cfg.onTimeout
  }
  return out.ms !== undefined || out.onTimeout !== undefined ? out : null
}

/** loopId：interrupt value 显式携带优先（validation 审批），否则从编译器约定 `loop-<loopId>` 反解 */
function loopIdOf(graphId: string, value: unknown): string {
  if (value != null && typeof value === 'object') {
    const v = (value as { loopId?: unknown }).loopId
    if (typeof v === 'string' && v) return v
  }
  return graphId.startsWith('loop-') ? graphId.slice('loop-'.length) : graphId
}

export class InterruptTimeoutScanner {
  private timer: ReturnType<typeof setInterval> | null = null
  /** 重入护栏：auto-approve 的 resume 会真实续跑图，扫描期内不允许二次进入 */
  private scanning = false
  private readonly defaultTimeoutMs: number
  private readonly intervalMs: number
  private readonly log: (msg: string) => void

  constructor(private opts: InterruptTimeoutScannerOpts) {
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? DEFAULT_INTERRUPT_TIMEOUT_MS
    this.intervalMs = opts.intervalMs ?? 30_000
    this.log = opts.log ?? (() => {})
  }

  private now(): number {
    return this.opts.clock?.() ?? Date.now()
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => { void this.scan() }, this.intervalMs)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** 单轮扫描：注册表中 awaiting-input 的 run → 最新 checkpoint 的 pendingInterrupts。
   *  一个 run 一轮至多处置一个 interrupt（resume/fail 都会改变 run 现场），其余下轮再看。 */
  async scan(): Promise<void> {
    if (this.scanning) return
    this.scanning = true
    try {
      const now = this.now()
      for (const run of this.opts.graphService.listRuns()) {
        if (run.status !== 'awaiting-input') continue
        try {
          await this.handleRun(run.runId, run.graphId, now)
        } catch (err) {
          // 单 run 处置失败（如图 def 未注册、resume 竞态）不拖垮整轮扫描
          this.log(`interrupt-timeout scan failed for ${run.runId}: ${err instanceof Error ? err.message : err}`)
        }
      }
    } finally {
      this.scanning = false
    }
  }

  // ---------------------------------------------------------------------------

  private async handleRun(runId: string, graphId: string, now: number): Promise<void> {
    const checkpoint = await this.opts.eventLog.getLatestCheckpoint(runId)
    if (!checkpoint || checkpoint.pendingInterrupts.length === 0) return

    for (const interrupt of checkpoint.pendingInterrupts) {
      // 旧 checkpoint 无 raisedAtMs → 回退 checkpoint.createdAt（ISO 时间串）
      const raisedAtMs = interrupt.raisedAtMs ?? Date.parse(checkpoint.createdAt)
      const config = timeoutConfigOf(interrupt.value)
      const timeoutMs = config?.ms ?? this.defaultTimeoutMs
      if (!Number.isFinite(raisedAtMs) || now - raisedAtMs < timeoutMs) continue
      await this.applyPolicy(runId, graphId, checkpoint, { interrupt, raisedAtMs, config }, timeoutMs, now)
      return
    }
  }

  private async applyPolicy(
    runId: string,
    graphId: string,
    checkpoint: StoredCheckpoint,
    candidate: TimeoutCandidate,
    timeoutMs: number,
    now: number,
  ): Promise<void> {
    const { interrupt, raisedAtMs, config } = candidate
    const action: InterruptTimeoutAction = config?.onTimeout ?? 'escalate'
    const loopId = loopIdOf(graphId, interrupt.value)
    const pendingFor = now - raisedAtMs

    if (action === 'fail') {
      const error = `interrupt timeout: approval '${interrupt.id}' pending for ${pendingFor}ms (>${timeoutMs}ms, onTimeout=fail)`
      const failed = this.opts.graphService.failRun(runId, error)
      if (failed === null) this.log(`interrupt-timeout: run ${runId} not in registry for fail policy`)
      return
    }

    if (action === 'auto-approve-with-log') {
      await this.opts.graphService.resumeRun(runId, interrupt.id, { ...AUTO_APPROVE_VALUE })
      this.log(`interrupt-timeout: auto-approved '${interrupt.id}' for run ${runId} after ${pendingFor}ms`)
      return
    }

    // escalate（默认）：24h 节流窗口以事件日志水印为准（持久，重启不丢）
    const lastEscalatedAtMs = await this.lastEscalatedAtMs(runId, interrupt.id)
    if (lastEscalatedAtMs !== null && now - lastEscalatedAtMs < ESCALATION_RESEND_INTERVAL_MS) {
      return
    }
    await this.escalate(runId, graphId, loopId, interrupt.id, interrupt.nodeId, timeoutMs, pendingFor, now)
  }

  /** 上次升级的水印：本 run 事件日志中该 interrupt 的最近一条 loop.escalated */
  private async lastEscalatedAtMs(runId: string, interruptId: string): Promise<number | null> {
    const events = await this.opts.eventLog.query(runId, { kind: ESCALATION_KIND })
    let last: number | null = null
    for (const e of events) {
      if ((e.payload as { interruptId?: unknown }).interruptId !== interruptId) continue
      last = last === null ? e.ts : Math.max(last, e.ts)
    }
    return last
  }

  /** 兼容事件出站（loop 台账 + socket/matrix-bot）+ 事件日志水印落盘（节流依据 + 回放可见）。
   *  台账 #9（顺延 P4 清偿）：先 eventLog.append 落水印、成功后才 emitLoopEvent 出站——
   *  原顺序先发后落，append 失败时水印缺失，下轮扫描在 24h 节流窗口内重复出站。
   *  对换后的失败语义：append 抛错 → 本次不出站（scan 的单 run try/catch 记日志），
   *  水印与出站保持"已出站必有水印"的不变量，重试由下轮扫描自然承接。 */
  private async escalate(
    runId: string,
    graphId: string,
    loopId: string,
    interruptId: string,
    nodeId: string,
    timeoutMs: number,
    pendingForMs: number,
    now: number,
  ): Promise<void> {
    const reason =
      `interrupt timeout: approval '${interruptId}' pending for ${pendingForMs}ms (>${timeoutMs}ms) — human decision required`
    const ts = new Date(now).toISOString()
    const event: LoopEvent = {
      type: 'loop.escalated', loopId, runId, interruptId, nodeId, reason, ts,
    }
    await this.opts.eventLog.append({
      runId, graphId, ts: now, kind: ESCALATION_KIND, nodeId,
      payload: { interruptId, loopId, reason },
    })
    this.opts.emitLoopEvent?.(event)
    this.log(`interrupt-timeout: escalated '${interruptId}' for run ${runId} (pending ${pendingForMs}ms)`)
  }
}
