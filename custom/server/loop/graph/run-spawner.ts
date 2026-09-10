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

import type { LoopInstance, LoopEvent, LoopStats } from '../types'
import type { LoopStateStore } from '../store/state-store'
import type { GraphService } from './graph-service'
import type { GraphDef, GraphEvent, StateValues } from './types'
import type { EventLogStore } from './event-log-store'
import { computeNextTick } from './next-tick'
import { CH } from './phase-nodes'

export interface RunSpawnerOpts {
  graphService: GraphService
  store: LoopStateStore
  eventLog: EventLogStore
  /** LoopInstance → 已 hydrate 的 GraphDef（id = `loop-<loopId>`），装配层绑定编译器 */
  compile: (loop: LoopInstance) => GraphDef
  intervalMs?: number
  /** §7B.7 连续失败熔断阈值，默认 10（Jira Automation scheduled 规则同款语义） */
  maxConsecutiveFailures?: number
  /**
   * 停滞熔断阈值（P2 台账④）：run 正常完成但产出通道（contracts/verifications）
   * 无新增连续计次，达阈值即 paused + loop.stuck 告警。默认 = maxConsecutiveFailures。
   */
  stagnationLimit?: number
  /**
   * loop.* 兼容事件出口（装配层桥接：store 台账 + loop socket 房间，前端/matrix-bot 消费）。
   * 缺省直写 store（不走 socket）——仅为无装配的单测兜底。
   */
  emitLoopEvent?: (event: LoopEvent) => void
  /**
   * webhook payload 入队通道（2026-09-10 风险审查 #2 修复）：与 legacy Scheduler 对齐——
   * payload 先入队 webhookConnector（discovery 经 discover 排空为契约），再去抖 tick。
   * 缺省不注入时仅 tick（payload 无处可去，与 P1 行为一致）。
   */
  webhookEnqueue?: (loopId: string, entry: { source: string; eventType: string; payload: unknown }) => void
  /**
   * 崩溃恢复白名单（I9）：装配启动时由 status=running 重建为 paused 的 loop id。
   * poll 命中白名单且 nextTickAt 已过 → 自动恢复触发一次（触发后移除）。
   * 用户主动 paused 的 loop 永不入白名单，不会被误恢复。
   */
  autoResumeIds?: Set<string>
  log?: (msg: string) => void
}

const STUCK_WINDOW = 20
const STUCK_FAILURES = 3

export class RunSpawner {
  private timer: NodeJS.Timeout | null = null
  private ticking = new Set<string>()
  private webhookTimers = new Map<string, NodeJS.Timeout>()
  private consecutiveFailures = new Map<string, number>()
  /** loopId → 连续无产出完成的 run 数（台账④停滞熔断计数） */
  private stagnantCount = new Map<string, number>()
  /** graphId → loopId：onEvent 回写时反查（编译器产物 id 固定为 `loop-<loopId>`） */
  private graphToLoop = new Map<string, string>()
  private readonly intervalMs: number
  private readonly maxConsecutiveFailures: number
  private readonly stagnationLimit: number
  private readonly log: (msg: string) => void

  constructor(private opts: RunSpawnerOpts) {
    this.intervalMs = opts.intervalMs ?? 30_000
    this.maxConsecutiveFailures = opts.maxConsecutiveFailures ?? 10
    this.stagnationLimit = opts.stagnationLimit ?? this.maxConsecutiveFailures
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

  /** 30s 轮询：到期且 idle 的 loop → 发起 run；崩溃恢复白名单内的 paused loop 同判据自动恢复 */
  async poll(): Promise<void> {
    const loops = await this.opts.store.listLoops()
    const now = Date.now()
    for (const loop of loops) {
      if (loop.status === 'paused') {
        if (!this.opts.autoResumeIds?.has(loop.id)) continue
        if (!loop.nextTickAt) continue
        if (new Date(loop.nextTickAt).getTime() > now) continue
        this.opts.autoResumeIds.delete(loop.id)
        await this.tickNow(loop.id, { resumePaused: true })
        continue
      }
      if (loop.status !== 'idle') continue
      if (!loop.nextTickAt) continue
      if (new Date(loop.nextTickAt).getTime() > now) continue
      if (this.ticking.has(loop.id)) continue
      await this.tickNow(loop.id)
    }
  }

  /** 该 loop 是否正有 run 在本进程内执行——崩溃恢复扫描据此跳过本进程刚发起的 tick */
  isTicking(loopId: string): boolean {
    return this.ticking.has(loopId)
  }

  /** 手动 tick（REST POST /api/loop/loops/:id/tick 在 GRAPH_ENGINE=on 时改走这里）。
   *  resumePaused：崩溃恢复专用——poll 从白名单触发时放行 paused 状态（用户主动暂停
   *  的 loop 走不到这条路径，见 autoResumeIds 注释）。 */
  async tickNow(loopId: string, opts?: { resumePaused?: boolean }): Promise<{ runId: string } | null> {
    if (this.ticking.has(loopId)) return null
    this.ticking.add(loopId)
    try {
      const loop = await this.opts.store.getLoop(loopId)
      if (!loop) throw new Error(`Loop not found: ${loopId}`)
      const tickable = loop.status === 'idle' || (opts?.resumePaused === true && loop.status === 'paused')
      if (!tickable) return null

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

  /** webhook 触发：5s 去抖（沿用 Scheduler.handleWebhook 语义）。
   *  payload 先入队 webhookConnector（legacy scheduler.ts:64 同款：入队后去抖 tick，
   *  discovery 经 discover 排空为契约）——缺 enqueue 通道时仅 tick（payload 丢弃，P1 原行为）。 */
  handleWebhook(loopId: string, source: string, eventType: string, payload?: unknown): void {
    this.opts.webhookEnqueue?.(loopId, { source, eventType, payload })
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

  /** loop.* 兼容事件出口：装配桥（store 台账 + loop socket）优先，缺省直写 store */
  private emitCompat(event: LoopEvent): void {
    if (this.opts.emitLoopEvent) {
      this.opts.emitLoopEvent(event)
      return
    }
    this.opts.store.appendEvent(event).catch(() => {})
  }

  /**
   * 旧引擎 loop.tick-complete 兼容补发（I10）：legacy LoopEngine 每个 tick 结束都发
   * `loop.tick-complete`（loopId/iteration/stats/ts），前端 LoopDetailView/store 与
   * matrix-bot 消费它刷新 stats。图引擎一个 run = 一个 tick，run 落终态
   * （completed/failed）时在此补发同形状事件，消费方零改动。
   */
  private emitTickComplete(loopId: string, stats: LoopStats): void {
    this.emitCompat({
      type: 'loop.tick-complete', loopId,
      iteration: stats.currentIteration,
      stats, ts: new Date().toISOString(),
    })
  }

  /** 熔断共用出口（§7B.7）：paused + loop.stuck 告警 + 双计数清零。
   *  失败熔断与停滞熔断（台账④）走同一条路径，前端/bot 消费零差异。 */
  private async tripBreaker(loopId: string, reason: string): Promise<void> {
    await this.opts.store.updateLoop(loopId, { status: 'paused', nextTickAt: null })
    this.emitCompat({
      type: 'loop.stuck', loopId,
      reason, ts: new Date().toISOString(),
    })
    this.consecutiveFailures.set(loopId, 0)
    this.stagnantCount.set(loopId, 0)
    this.log(`run-spawner circuit breaker paused loop ${loopId}: ${reason}`)
  }

  /** run 是否有新增产出：finalState 的 contracts/verifications 通道任一非空。
   *  一个 run = 一个 tick，通道从默认空值起步，run 结束仍为空 = 本轮零产出。 */
  private runProducedOutput(finalState: StateValues): boolean {
    const produced = (v: unknown): boolean => Array.isArray(v) && v.length > 0
    return produced(finalState[CH.contracts]) || produced(finalState[CH.verifications])
  }

  private async handleGraphEvent(e: GraphEvent): Promise<void> {
    if (e.type !== 'graph.completed' && e.type !== 'graph.failed') return
    const loopId = this.graphToLoop.get(e.graphId)
    if (!loopId) return
    const loop = await this.opts.store.getLoop(loopId)
    if (!loop) return

    if (e.type === 'graph.completed') {
      this.consecutiveFailures.set(loopId, 0)
      const stopMet = e.finalState.stopMet === true
      if (!stopMet) {
        // 台账④：正常完成但不收敛的 run（stopMet 永假且 contracts/verifications
        // 双空）原来只重置失败计数、无限重排。此处计入停滞，达阈值走与失败
        // 熔断同一条 paused 路径；有产出（任一通道非空）即清零。
        const stagnant = this.runProducedOutput(e.finalState)
          ? 0
          : (this.stagnantCount.get(loopId) ?? 0) + 1
        this.stagnantCount.set(loopId, stagnant)
        if (stagnant >= this.stagnationLimit) {
          await this.tripBreaker(
            loopId,
            `circuit breaker: ${stagnant} consecutive stagnant runs (completed with no new contracts/verifications)`)
          this.emitTickComplete(loopId, loop.stats)
          return
        }
      } else {
        this.stagnantCount.set(loopId, 0)
      }
      if (stopMet) {
        await this.opts.store.updateLoop(loopId, {
          status: 'completed', stage: 'scheduling', nextTickAt: null,
          stats: { ...loop.stats },
        })
        this.emitCompat({
          type: 'loop.completed', loopId, finalStats: loop.stats, ts: new Date().toISOString(),
        })
      } else {
        await this.opts.store.updateLoop(loopId, {
          status: 'idle', stage: 'scheduling', nextTickAt: computeNextTick(loop),
          stats: { ...loop.stats },
        })
      }
      this.emitTickComplete(loopId, loop.stats)
      return
    }

    // graph.failed → 熔断计数
    const failures = (this.consecutiveFailures.get(loopId) ?? 0) + 1
    this.consecutiveFailures.set(loopId, failures)
    if (failures >= this.maxConsecutiveFailures) {
      await this.tripBreaker(loopId, `circuit breaker: ${failures} consecutive failed runs`)
    } else {
      await this.opts.store.updateLoop(loopId, {
        status: 'idle', nextTickAt: computeNextTick(loop),
      })
    }
    this.emitTickComplete(loopId, loop.stats)
  }
}
