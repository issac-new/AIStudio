// overlay/custom/server/loop/graph/graph-service.ts
// GraphService — 进程内 Run 注册表 + start/resume/fork 闭环 + 事件订阅 + 回放数据层
//
// 职责边界：
// - 每个 run 持有一个 GraphRuntime 实例（构造注入 { checkpointManager, eventLog, runId }，
//   runId 即 threadId）；CheckpointManager 与事件日志共用同一 EventLogStore 实例（装配约束），
//   checkpoint 真快照（含 joinLedger）与 append-only 事件同源落地
// - resumeRun 走 runtime.resumeFromCheckpoint（真恢复续跑，Task 4）
// - forkRun 经 CheckpointManager.fork 以指定 superStep 的 checkpoint 为基底派生独立 run
//   （paused 入注册表，不自动执行，P2 UI 决定何时 startRun(forkedId) 续跑）
// - replayRun 为 UI 回放数据层（P2 用）
// - 本模块不含 HTTP；P1 装配 Koa 时由 controllers 薄壳调用

import type {
  GraphDef, GraphInstance, GraphStatus, StateValues, GraphEvent, GraphDeps,
} from './types'
import { GraphRuntime } from './graph-runtime'
import { CheckpointManager } from './checkpoint-manager'
import type { EventLogStore, GraphLogEvent } from './event-log-store'

export interface GraphServiceOptions {
  eventLog: EventLogStore
  deps?: Partial<GraphDeps>
}

export interface RunInfo {
  instance: GraphInstance
  status: GraphStatus
}

interface RunRecord {
  runId: string
  graphId: string
  instance: GraphInstance
  runtime: GraphRuntime
  /** fork 产物：基底 checkpoint + 预定 resumeValue，startRun(forkedId) 时一次性消费 */
  forkBase?: { checkpoint: import('./event-log-store').StoredCheckpoint; resumeValue: unknown }
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

  /** 启动 run；传 fork 产出的 runId 时按基底 checkpoint 续跑（消费 forkBase） */
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
      if (!rec.forkBase) throw new Error(`Run already started: ${runId}`)
      const { checkpoint, resumeValue } = rec.forkBase
      rec.forkBase = undefined
      rec.instance.status = 'running'
      rec.instance = await rec.runtime.resumeFromCheckpoint(
        def, checkpoint, resumeValue, checkpoint.pendingInterrupts[0]?.id ?? 'fork',
      )
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
      forkBase: { checkpoint: forkedCheckpoint, resumeValue: { forkedFrom: runId, superStep } },
    })
    return { runId: forkedId }
  }

  getRun(runId: string): RunInfo | null {
    const rec = this.runs.get(runId)
    if (!rec) return null
    return { instance: rec.instance, status: rec.instance.status }
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
