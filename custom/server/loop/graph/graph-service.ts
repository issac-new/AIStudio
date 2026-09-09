// overlay/custom/server/loop/graph/graph-service.ts
// GraphService — 进程内 Run 注册表 + start/resume/fork 闭环 + 事件订阅 + 回放数据层
//
// 职责边界：
// - 每个 run 持有一个 GraphRuntime 实例（构造注入 { checkpointManager, eventLog, runId }，
//   runId 即 threadId）；CheckpointManager 与事件日志共用同一 EventLogStore 实例（装配约束），
//   checkpoint 真快照（含 joinLedger）与 append-only 事件同源落地
// - resumeRun 走 runtime.resumeFromCheckpoint（真恢复续跑，Task 4）；
//   interruptId 必须 ∈ 最新 checkpoint 的 pendingInterrupts，否则抛 Unknown interrupt（P1 台账 c-2）
// - forkRun 经 CheckpointManager.fork 以指定 superStep 的 checkpoint 为基底派生独立 run
//   （paused 入注册表，不自动执行，P2 UI 决定何时 startRun(forkedId) 续跑）
// - fork 续跑显式语义（P1 台账 a 裁决）：startRun 消费 forkBase 时不自动应答 interrupt——
//   基底 checkpoint 有 pendingInterrupts 时 run 直接进 awaiting-input 等真人 resume（payload 原样保留）；
//   无则经 runtime.continueFromCheckpoint 从基底 nextNodes 续跑（不发 interrupt.resumed）
// - rebuildRegistryFromLog：进程重启后从事件日志重建注册表（P1 生产切换前提）
// - replayRun 为 UI 回放数据层（P2 用）
// - 本模块不含 HTTP；P1 装配 Koa 时由 controllers 薄壳调用

import type {
  GraphDef, GraphInstance, GraphStatus, StateValues, GraphEvent, GraphDeps,
} from './types'
import { GraphRuntime } from './graph-runtime'
import { CheckpointManager } from './checkpoint-manager'
import type { EventLogStore, GraphLogEvent, StoredCheckpoint } from './event-log-store'

export interface GraphServiceOptions {
  eventLog: EventLogStore
  deps?: Partial<GraphDeps>
}

export interface RunInfo {
  runId: string
  graphId: string
  instance: GraphInstance
  status: GraphStatus
}

interface RunRecord {
  runId: string
  graphId: string
  instance: GraphInstance
  runtime: GraphRuntime
  /** fork 产物：基底 checkpoint，startRun(forkedId) 时一次性消费（显式语义，不带预定应答） */
  forkBase?: { checkpoint: StoredCheckpoint }
}

export class GraphService {
  private graphs = new Map<string, GraphDef>()
  private runs = new Map<string, RunRecord>()
  private seqCounters = new Map<string, number>()
  private listeners: Array<(e: GraphEvent) => void> = []
  private checkpointManager: CheckpointManager

  constructor(private opts: GraphServiceOptions) {
    // checkpoint 与事件日志同实例（装配约束）
    this.checkpointManager = new CheckpointManager(opts.eventLog)
  }

  private get eventLog(): EventLogStore {
    return this.opts.eventLog
  }

  /** 注册图定义（重复注册同 id 覆盖） */
  registerGraph(def: GraphDef): void {
    this.graphs.set(def.id, def)
  }

  /** 事件订阅（runtime 事件 + service 事件同一出口） */
  onEvent(cb: (e: GraphEvent) => void): void {
    this.listeners.push(cb)
  }

  /** 启动 run；传 fork 产出的 runId 时按基底 checkpoint 续跑（消费 forkBase，显式语义见头部注释） */
  async startRun(
    graphId: string,
    initialState?: StateValues,
    runId?: string,
  ): Promise<{ runId: string; instance: GraphInstance }> {
    const def = this.graphs.get(graphId)
    if (!def) throw new Error(`Graph not registered: ${graphId}`)

    if (runId !== undefined) {
      const rec = this.runs.get(runId)
      if (!rec) throw new Error(`Run not found: ${runId}`)
      // 台账 c-1：fork runId 的 graphId 必须与参数一致，防串图续跑
      if (rec.graphId !== graphId) {
        throw new Error(`Run ${runId} belongs to graph ${rec.graphId}, not ${graphId}`)
      }
      if (!rec.forkBase) throw new Error(`Run already started: ${runId}`)
      const { checkpoint } = rec.forkBase
      rec.forkBase = undefined
      // 补发 run.started：fork 两条消费路径都不经 runtime.start，日志须留起跑事实——
      // rebuildRegistryFromLog 据此判别 fork 是否已消费（防重启后静默重跑），onEvent 订阅方同步可见
      rec.runtime.emitStarted(def, runId)
      if (checkpoint.pendingInterrupts.length > 0) {
        // 台账 a 裁决：不自动应答 interrupt——直接进入 awaiting-input 等真人 resume，
        // interrupt payload 原样保留在基底 checkpoint（fork 时已存为新 run 的起点 checkpoint）
        rec.instance.status = 'awaiting-input'
        rec.instance.currentStep = checkpoint.superStep
        rec.instance.state = { ...checkpoint.state }
        rec.instance.totalCost = checkpoint.totalCost
        rec.instance.updatedAt = new Date().toISOString()
        return { runId, instance: rec.instance }
      }
      // 无 pendingInterrupts：从基底 checkpoint 的 nextNodes 续跑（不发 interrupt.resumed）
      rec.instance = await rec.runtime.continueFromCheckpoint(def, checkpoint)
      return { runId, instance: rec.instance }
    }

    const seq = (this.seqCounters.get(graphId) ?? 0) + 1
    this.seqCounters.set(graphId, seq)
    const newRunId = `run-${graphId}-${seq}`
    const runtime = this.makeRuntime(newRunId)
    const instance = await runtime.start(def, newRunId, initialState)
    this.runs.set(newRunId, {
      runId: newRunId,
      graphId,
      instance,
      runtime,
    })
    return { runId: newRunId, instance }
  }

  /** resume 闭环：run 必须处于 awaiting-input，从最新 checkpoint 真恢复续跑 */
  async resumeRun(runId: string, interruptId: string, value: unknown): Promise<GraphInstance> {
    const rec = this.runs.get(runId)
    if (!rec) throw new Error(`Run not found: ${runId}`)
    if (rec.instance.status !== 'awaiting-input') {
      throw new Error(`Run ${runId} is not awaiting-input (status=${rec.instance.status})`)
    }
    const def = this.graphs.get(rec.graphId)
    if (!def) throw new Error(`Graph not registered: ${rec.graphId}`)
    const checkpoint = await this.eventLog.getLatestCheckpoint(runId)
    if (!checkpoint) throw new Error(`No checkpoint found for run: ${runId}`)
    // 台账 c-2：interruptId 必须 ∈ 最新 checkpoint 的 pendingInterrupts
    if (!checkpoint.pendingInterrupts.some(i => i.id === interruptId)) {
      throw new Error(`Unknown interrupt: ${interruptId}`)
    }
    rec.instance = await rec.runtime.resumeFromCheckpoint(def, checkpoint, value, interruptId)
    return rec.instance
  }

  /** fork：以指定 superStep 的 checkpoint 为基底派生独立 run（paused，不自动执行）。
   *  经 CheckpointManager.fork：新 runId 日志流写 run.forked + 基底 checkpoint 快照。 */
  async forkRun(runId: string, superStep: number): Promise<{ runId: string }> {
    const rec = this.runs.get(runId)
    if (!rec) throw new Error(`Run not found: ${runId}`)

    const seq = (this.seqCounters.get(rec.graphId) ?? 0) + 1
    this.seqCounters.set(rec.graphId, seq)
    const forkedId = `run-${rec.graphId}-fork-${seq}`
    const forkedCheckpoint = await this.checkpointManager.fork(runId, superStep, forkedId)

    const ts = new Date().toISOString()
    this.emitServiceEvent({
      type: 'graph.forked',
      graphId: rec.graphId,
      threadId: forkedId,
      parentThreadId: runId,
      ts,
    })

    const instance: GraphInstance = {
      id: `${rec.graphId}-${forkedId}`,
      graphDefId: rec.graphId,
      threadId: forkedId,
      status: 'paused',
      currentStep: forkedCheckpoint.superStep,
      state: { ...forkedCheckpoint.state },
      totalCost: forkedCheckpoint.totalCost,
      createdAt: ts,
      updatedAt: ts,
      parentThreadId: runId,
    }
    this.runs.set(forkedId, {
      runId: forkedId,
      graphId: rec.graphId,
      instance,
      runtime: this.makeRuntime(forkedId),
      forkBase: { checkpoint: forkedCheckpoint },
    })
    return { runId: forkedId }
  }

  getRun(runId: string): RunInfo | null {
    const rec = this.runs.get(runId)
    if (!rec) return null
    // 台账 c-3：显式挑选字段 + instance 浅拷贝——既不泄 runtime 活引用/forkBase，也防外部污染内部状态
    return { runId: rec.runId, graphId: rec.graphId, instance: { ...rec.instance }, status: rec.instance.status }
  }

  listRuns(): Array<{ runId: string; graphId: string; status: GraphStatus; updatedAt: string }> {
    return [...this.runs.values()].map(r => ({
      runId: r.runId,
      graphId: r.graphId,
      status: r.instance.status,
      updatedAt: r.instance.updatedAt,
    }))
  }

  /** 回放数据层（P2 UI 用）：按 seq 返回该 run 的全部日志事件 */
  replayRun(runId: string): Promise<GraphLogEvent[]> {
    return this.eventLog.query(runId)
  }

  /**
   * 进程重启后从事件日志重建注册表，返回重建条数。
   * 状态推导：有 run.completed/run.failed → 对应终态；
   * 有未应答 interrupt → awaiting-input（未应答集合 = 本 run 日志的 interrupt.raised
   *   ∪ 最新 checkpoint 的 pendingInterrupts，减去 interrupt.resumed；fork 流的 interrupt
   *   事实在父 run 日志里，本流只有 checkpoint 承载 pendingInterrupts，两源并集缺一不可）；
   * 其余（含重启前 running）→ paused，由人工或调度器决定续跑（重启后不可能仍在跑）。
   * fork 产物（有 run.forked 无 run.started）重建 forkBase，保证 startRun(forkedId) 跨重启仍可消费；
   * fork 消费路径已补发 run.started，已起跑的 fork 不会带 forkBase 进注册表（防静默重跑）。
   * 已在注册表中的 runId 跳过不覆盖（本进程内活着的记录以内存为准）。
   */
  async rebuildRegistryFromLog(): Promise<number> {
    const loggedRuns = await this.eventLog.listRuns()
    let rebuilt = 0
    for (const { runId, graphId } of loggedRuns) {
      if (this.runs.has(runId)) continue
      const events = await this.eventLog.query(runId)
      const checkpoint = await this.eventLog.getLatestCheckpoint(runId)
      const hasCompleted = events.some(e => e.kind === 'run.completed')
      const hasFailed = events.some(e => e.kind === 'run.failed')
      let status: GraphStatus
      if (hasCompleted) {
        status = 'completed'
      } else if (hasFailed) {
        status = 'failed'
      } else {
        const pending = new Set(
          events.filter(e => e.kind === 'interrupt.raised').map(e => e.payload.interruptId),
        )
        for (const i of checkpoint?.pendingInterrupts ?? []) pending.add(i.id)
        const resumed = new Set(
          events.filter(e => e.kind === 'interrupt.resumed').map(e => e.payload.interruptId),
        )
        status = [...pending].some(id => !resumed.has(id)) ? 'awaiting-input' : 'paused'
      }
      const lastTs = events.length > 0 ? events[events.length - 1].ts : Date.now()
      const updatedAt = new Date(lastTs).toISOString()
      const forkEvent = events.find(e => e.kind === 'run.forked')
      const instance: GraphInstance = {
        id: `${graphId}-${runId}`,
        graphDefId: graphId,
        threadId: runId,
        status,
        currentStep: checkpoint?.superStep ?? 0,
        state: checkpoint ? { ...checkpoint.state } : {},
        totalCost: checkpoint?.totalCost ?? 0,
        createdAt: checkpoint?.createdAt ?? updatedAt,
        updatedAt,
        parentThreadId: forkEvent?.payload.fromRunId as string | undefined,
      }
      const rec: RunRecord = { runId, graphId, instance, runtime: this.makeRuntime(runId) }
      // fork 未起跑（无 run.started）→ 重建 forkBase，startRun 仍可按显式语义消费
      if (forkEvent && !events.some(e => e.kind === 'run.started') && checkpoint) {
        rec.forkBase = { checkpoint }
      }
      this.runs.set(runId, rec)
      rebuilt++
    }
    return rebuilt
  }

  // ============================================================================
  // 内部
  // ============================================================================

  private makeRuntime(runId: string): GraphRuntime {
    return new GraphRuntime(
      {
        ...this.opts.deps,
        emitEvent: (e: GraphEvent) => {
          for (const cb of this.listeners) {
            try { cb(e) } catch { /* 订阅者异常不影响图执行 */ }
          }
          return this.opts.deps?.emitEvent?.(e)
        },
      } as GraphDeps,
      { checkpointManager: this.checkpointManager, eventLog: this.eventLog, runId },
    )
  }

  private emitServiceEvent(e: GraphEvent): void {
    for (const cb of this.listeners) {
      try { cb(e) } catch { /* 订阅者异常不影响 service */ }
    }
    this.opts.deps?.emitEvent?.(e)
  }
}
