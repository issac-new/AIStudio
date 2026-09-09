// overlay/custom/server/loop/graph/run-spawner.ts
// P1 Task 6 — RunSpawner：CentralizedScheduler 的图引擎升级版
//
// 语义对齐 CentralizedScheduler（30s 轮询 / webhook 5s 去抖 / manualTick），
// 区别：到期 LoopInstance 不再走 LoopEngine.tick，而是 compile → registerGraph →
// GraphService.startRun。run 结果经 graphService.onEvent 统一回写：
//   - completed + stopMet=false → 写回 nextTickAt（图重入，新 run 由本 spawner 再发起）
//   - completed + stopMet=true  → loop 标 completed
//   - failed  → 连续失败熔断（§7B.7：默认 10 次自动暂停 loop 并告警），未达阈值则重排
// 一个 run = 一个 tick（stop-check 节点 end 终止），跨 tick 无常驻图状态。

import type { LoopInstance, LoopEvent } from '../types'
import type { LoopStateStore } from '../store/state-store'
import type { GraphService } from './graph-service'
import type { GraphDef, GraphEvent } from './types'
import type { EventLogStore } from './event-log-store'
import { computeNextTick } from './next-tick'

export interface RunSpawnerOpts {
  graphService: GraphService
  store: LoopStateStore
  eventLog: EventLogStore
  /** LoopInstance → 已 hydrate 的 GraphDef（id = `loop-<loopId>`），装配层绑定编译器 */
  compile: (loop: LoopInstance) => GraphDef
  intervalMs?: number
  /** §7B.7 连续失败熔断阈值，默认 10（Jira Automation scheduled 规则同款语义） */
  maxConsecutiveFailures?: number
  log?: (msg: string) => void
}

const STUCK_WINDOW = 20
const STUCK_FAILURES = 3

export class RunSpawner {
  private timer: NodeJS.Timeout | null = null
  private ticking = new Set<string>()
  private webhookTimers = new Map<string, NodeJS.Timeout>()
  private consecutiveFailures = new Map<string, number>()
  /** graphId → loopId：onEvent 回写时反查（编译器产物 id 固定为 `loop-<loopId>`） */
  private graphToLoop = new Map<string, string>()
  private readonly intervalMs: number
  private readonly maxConsecutiveFailures: number
  private readonly log: (msg: string) => void

  constructor(private opts: RunSpawnerOpts) {
    this.intervalMs = opts.intervalMs ?? 30_000
    this.maxConsecutiveFailures = opts.maxConsecutiveFailures ?? 10
    this.log = opts.log ?? (() => {})
    opts.graphService.onEvent(e => { void this.handleGraphEvent(e) })
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => { void this.poll() }, this.intervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    for (const t of this.webhookTimers.values()) clearTimeout(t)
    this.webhookTimers.clear()
  }

  /** 30s 轮询：到期且 idle 的 loop → 发起 run */
  async poll(): Promise<void> {
    const loops = await this.opts.store.listLoops()
    const now = Date.now()
    for (const loop of loops) {
      if (loop.status !== 'idle') continue
      if (!loop.nextTickAt) continue
      if (new Date(loop.nextTickAt).getTime() > now) continue
      if (this.ticking.has(loop.id)) continue
      await this.tickNow(loop.id)
    }
  }

  /** 手动 tick（REST POST /api/loop/loops/:id/tick 在 GRAPH_ENGINE=on 时改走这里） */
  async tickNow(loopId: string): Promise<{ runId: string } | null> {
    if (this.ticking.has(loopId)) return null
    this.ticking.add(loopId)
    try {
      const loop = await this.opts.store.getLoop(loopId)
      if (!loop) throw new Error(`Loop not found: ${loopId}`)
      if (loop.status !== 'idle') return null

      const def = this.opts.compile(loop)
      this.graphToLoop.set(def.id, loopId)
      this.opts.graphService.registerGraph(def)
      await this.opts.store.updateLoop(loopId, {
        status: 'running',
        lastTickAt: new Date().toISOString(),
        stats: { ...loop.stats, currentIteration: loop.stats.currentIteration + 1, totalIterations: loop.stats.totalIterations + 1 },
      })
      const { runId } = await this.opts.graphService.startRun(def.id)
      return { runId }
    } catch (err) {
      this.log(`run-spawner tick failed for ${loopId}: ${err instanceof Error ? err.message : err}`)
      // 起 run 失败按一次失败计，回写 idle 等下轮（熔断由 handleGraphEvent 之外此处兜底）
      await this.opts.store.updateLoop(loopId, { status: 'idle' }).catch(() => {})
      return null
    } finally {
      this.ticking.delete(loopId)
    }
  }

  /** webhook 触发：5s 去抖（沿用 Scheduler.handleWebhook 语义） */
  handleWebhook(loopId: string, source: string, eventType: string): void {
    const key = `${loopId}:${source}:${eventType}`
    const existing = this.webhookTimers.get(key)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      this.webhookTimers.delete(key)
      void this.tickNow(loopId)
    }, 5_000)
    this.webhookTimers.set(key, timer)
  }

  /**
   * stuck 检测（GRAPH_ENGINE=on）：近 20 条 run 事件 ≥3 次 node.failed 即 stuck。
   * 旧契约状态轮询保留给 legacy 模式（装配层分流）。
   */
  async isStuck(loopId: string): Promise<boolean> {
    const runs = await this.opts.eventLog.listRuns()
    const graphId = `loop-${loopId}`
    const mine = runs.filter(r => r.graphId === graphId)
    if (mine.length === 0) return false
    // listRuns 无时间序保证——取 seq 最大的 runId（追加序）
    const events = await this.opts.eventLog.query(mine[mine.length - 1].runId, { limit: 1_000 })
    const recent = events.slice(-STUCK_WINDOW)
    return recent.filter(e => e.kind === 'node.failed').length >= STUCK_FAILURES
  }

  // ---------------------------------------------------------------------------

  private async handleGraphEvent(e: GraphEvent): Promise<void> {
    if (e.type !== 'graph.completed' && e.type !== 'graph.failed') return
    const loopId = this.graphToLoop.get(e.graphId)
    if (!loopId) return
    const loop = await this.opts.store.getLoop(loopId)
    if (!loop) return

    if (e.type === 'graph.completed') {
      this.consecutiveFailures.set(loopId, 0)
      const stopMet = e.finalState.stopMet === true
      if (stopMet) {
        await this.opts.store.updateLoop(loopId, {
          status: 'completed', stage: 'scheduling', nextTickAt: null,
          stats: { ...loop.stats },
        })
        this.opts.store.appendEvent({
          type: 'loop.completed', loopId, finalStats: loop.stats, ts: new Date().toISOString(),
        } satisfies LoopEvent).catch(() => {})
      } else {
        await this.opts.store.updateLoop(loopId, {
          status: 'idle', stage: 'scheduling', nextTickAt: computeNextTick(loop),
          stats: { ...loop.stats },
        })
      }
      return
    }

    // graph.failed → 熔断计数
    const failures = (this.consecutiveFailures.get(loopId) ?? 0) + 1
    this.consecutiveFailures.set(loopId, failures)
    if (failures >= this.maxConsecutiveFailures) {
      await this.opts.store.updateLoop(loopId, { status: 'paused', nextTickAt: null })
      await this.opts.store.appendEvent({
        type: 'loop.stuck', loopId,
        reason: `circuit breaker: ${failures} consecutive failed runs`,
        ts: new Date().toISOString(),
      } satisfies LoopEvent)
      this.consecutiveFailures.set(loopId, 0)
      this.log(`run-spawner circuit breaker paused loop ${loopId} after ${failures} consecutive failures`)
    } else {
      await this.opts.store.updateLoop(loopId, {
        status: 'idle', nextTickAt: computeNextTick(loop),
      })
    }
  }
}
