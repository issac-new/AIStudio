// overlay/custom/server/loop/graph/graph-assembly.ts
// P1 Task 7 — 图引擎生产装配入口（patch 202 调用的唯一入口，factory-DI：
// io/store 等由 patch 注入，本模块不 import 任何上游代码）。
//
// GRAPH_ENGINE 三态：
// - legacy（默认）：patch 134 原装配，新引擎仅 REST 只读挂载，spawner/shadow 不启动
// - shadow：legacy 为主；ShadowRunner 以 dryRun deps 双跑到期 loop，事件写 shadow 日志
// - on：RunSpawner 接管调度（REST loop tick → spawner.tickNow），写回/熔断生效

import { createEventLogStore, type EventLogStore } from './event-log-store'
import { GraphService } from './graph-service'
import { RunSpawner } from './run-spawner'
import { compileLoopToDef, type CompileDeps } from './graph-compiler'
import { appendContractsById } from './phase-nodes'
import { createGraphRunRouter, GraphSpecStore, resumeApprovalForContract } from './graph-rest'
import { setupGraphSocketNamespace, type SocketIOLike } from './graph-socket'
import { ShadowRunner } from './shadow-runner'
import { emitLoopEvent } from '../services/loop-socket'
import type { Router } from '@koa/router'
import type { LoopStateStore } from '../store/state-store'
import type { LoopInstance, LoopEvent } from '../types'

export type GraphEngineMode = 'legacy' | 'shadow' | 'on'

export function readEngineMode(env: Record<string, string | undefined> = process.env): GraphEngineMode {
  const v = env.GRAPH_ENGINE
  if (v === 'on' || v === 'shadow') return v
  if (v !== undefined && v !== '' && v !== 'legacy') {
    console.warn(`[graph] unknown GRAPH_ENGINE="${v}" — falling back to legacy`)
  }
  return 'legacy'
}

/** io 可为实例或惰性工厂（上游 Socket.IO server 可能晚于装配就绪） */
export type SocketIOInput = SocketIOLike | null | (() => SocketIOLike | null)

function resolveIo(input?: SocketIOInput): SocketIOLike | null {
  if (!input) return null
  if (typeof input === 'function') {
    try { return input() } catch { return null }
  }
  return input
}

/** /graph namespace 惰性绑定：routes.ts 模块加载时 getGroupChatServer() 尚为 null，
 *  首次绑定必然失败（终审 Critical 4）。重试节奏：定时重试封顶后告警一次，
 *  之后由首条 loop.* 事件再补试（emitEvent 路径）。 */
const SOCKET_RETRY_MS = 2_000
const SOCKET_RETRY_MAX = 30

export interface GraphAssemblyOpts {
  io?: SocketIOInput
  engineDeps: CompileDeps
  mode?: GraphEngineMode
  eventLog?: EventLogStore
  shadowEventLog?: EventLogStore
  specStorePath?: string
  intervalMs?: number
  /** /graph namespace 绑定重试间隔（测试注快时钟用），默认 2s */
  socketRetryMs?: number
  /** /graph namespace 绑定重试封顶次数，默认 30（~60s）；超过后 warn 一次 */
  socketRetryMax?: number
  log?: (msg: string) => void
}

export interface GraphAssembly {
  mode: GraphEngineMode
  /** 主/影子事件日志（e2e 回放与 shadow 对比用） */
  eventLogs: { main: EventLogStore; shadow: EventLogStore }
  graphService: GraphService
  shadowGraphService: GraphService | null
  router: Router
  specStore: GraphSpecStore
  spawner: RunSpawner | null
  shadowRunner: ShadowRunner | null
  /** loop REST tick/webhook/schedule 的图引擎分流目标（patch 在 mode=on 时用它替换 legacy scheduler 入参） */
  loopTickTarget: {
    manualTick(loopId: string): Promise<unknown>
    scheduleLoop(loop: LoopInstance): void
    handleWebhook(loopId: string, source: string, eventType: string): void
  }
  /** 旧审批端点桥接：契约 id → pendingInterrupt approval:<id> → resume */
  resumeApproval(contractId: string, decision: 'approved' | 'rejected' | 'changes-requested'): Promise<{ ok: boolean; runId?: string }>
  /** /graph namespace 是否已绑定（惰性绑定就绪即 true；供装配诊断/测试） */
  socketConnected(): boolean
  /** 启动轮询器 + 崩溃恢复（幂等）。legacy 模式无轮询器，仅做注册表重建（REST 只读面受益） */
  start(): Promise<GraphAssembly>
  stop(): void
}

export function createGraphAssembly(opts: GraphAssemblyOpts): GraphAssembly {
  const mode = opts.mode ?? readEngineMode()
  const log = opts.log ?? (() => {})
  const store: LoopStateStore = opts.engineDeps.store
  const eventLog = opts.eventLog ?? createEventLogStore('.loop/graph-events.db')
  const shadowEventLog = opts.shadowEventLog ?? createEventLogStore('.loop/graph-shadow.db')
  const autoResumeIds = new Set<string>()
  let started = false

  /** loop.* 事件统一出口：写 loop 状态台账 + 转发 loop socket 房间（前端/matrix-bot 消费）。
   *  phase 节点桥接事件与 spawner 兼容事件（completed/stuck/tick-complete）共用。 */
  const bridgeLoopEvent = (e: LoopEvent): void => {
    void store.appendEvent(e).catch(() => {})
    const ioNow = resolveIo(opts.io)
    if (ioNow) emitLoopEvent(ioNow as never, e as never)
  }

  const graphService = new GraphService({
    eventLog,
    deps: {
      // loop.* 桥接事件分流：投影进 loop 事件存储 + loop socket 房间；graph.* 原样留给订阅方
      emitEvent: (e) => {
        const type = (e as { type: string }).type
        if (typeof type === 'string' && type.startsWith('loop.')) {
          bridgeLoopEvent(e as unknown as LoopEvent)
        }
      },
    },
  })

  // --- /graph namespace 惰性绑定（终审 Critical 4）---
  let socketBound = false
  let socketAttempts = 0
  let socketTimer: ReturnType<typeof setTimeout> | null = null
  let socketGiveUpWarned = false
  const socketRetryMs = opts.socketRetryMs ?? SOCKET_RETRY_MS
  const socketRetryMax = opts.socketRetryMax ?? SOCKET_RETRY_MAX

  const tryBindSocket = (): boolean => {
    if (socketBound) return true
    const ioNow = resolveIo(opts.io)
    if (!ioNow) return false
    setupGraphSocketNamespace(ioNow, graphService, eventLog)
    socketBound = true
    return true
  }

  const scheduleSocketRetry = (): void => {
    if (socketBound || socketTimer) return
    if (socketAttempts >= socketRetryMax) {
      if (!socketGiveUpWarned) {
        socketGiveUpWarned = true
        log(`[graph] /graph namespace not bound after ${socketAttempts} retries (group chat io unavailable) — will retry on first loop event`)
      }
      return
    }
    socketAttempts++
    socketTimer = setTimeout(() => {
      socketTimer = null
      if (!tryBindSocket()) scheduleSocketRetry()
    }, socketRetryMs)
    socketTimer.unref?.()
  }

  const specStore = new GraphSpecStore(opts.specStorePath)
  void specStore.load().catch(() => {})

  const spawner = mode === 'on'
    ? new RunSpawner({
        graphService, store, eventLog,
        compile: loop => compileLoopToDef(loop, opts.engineDeps, { appendById: appendContractsById }),
        emitLoopEvent: bridgeLoopEvent,
        autoResumeIds,
        intervalMs: opts.intervalMs, log,
      })
    : null

  const shadowGraphService = mode === 'shadow' ? new GraphService({ eventLog: shadowEventLog }) : null
  const shadowRunner = mode === 'shadow'
    ? new ShadowRunner({
        graphService: shadowGraphService!,
        eventLog: shadowEventLog,
        store,
        engineDeps: opts.engineDeps,
        reportPath: '.loop/graph-shadow-report.jsonl',
        intervalMs: opts.intervalMs, log,
      })
    : null

  const router = createGraphRunRouter({ graphService, eventLog, spawner, specStore })

  if (!tryBindSocket()) scheduleSocketRetry()

  const assembly: GraphAssembly = {
    mode,
    eventLogs: { main: eventLog, shadow: shadowEventLog },
    graphService,
    shadowGraphService,
    router,
    specStore,
    spawner,
    shadowRunner,
    loopTickTarget: {
      manualTick: (loopId) => (spawner ? spawner.tickNow(loopId) : Promise.resolve(null)),
      // mode=on 时本对象作为 scheduler 传入 createLoopRouter：controllers/loop.ts 在
      // 创建/更新 loop 后调 scheduleLoop(loop)（legacy Scheduler 语义是挂 cron 定时器）。
      // 图引擎下立即评估到期情况：已到期 → 立刻发起 run；未到期 → spawner 30s 轮询兜底；
      // manual 模式无定时语义（REST manualTick / webhook 各自直连）。
      scheduleLoop: (loop) => {
        if (!spawner || loop.status !== 'idle') return
        if (loop.schedule?.mode === 'manual') return
        const dueAt = loop.nextTickAt ? new Date(loop.nextTickAt).getTime() : NaN
        if (Number.isFinite(dueAt) && dueAt <= Date.now()) void spawner.tickNow(loop.id)
      },
      handleWebhook: (loopId, source, eventType) => { spawner?.handleWebhook(loopId, source, eventType) },
    },
    resumeApproval: (contractId, decision) => resumeApprovalForContract({ graphService, eventLog }, contractId, decision),
    socketConnected: () => socketBound,
    async start() {
      if (started) return assembly
      started = true
      // 崩溃恢复（终审 Important 9）：从事件日志重建 run 注册表——重启前 awaiting-input
      // 的 run 仍可经 POST /api/graph/runs/:id/resume 应答，未消费 fork 产物仍可起跑。
      try {
        const rebuilt = await graphService.rebuildRegistryFromLog()
        if (rebuilt > 0) log(`[graph] rebuilt ${rebuilt} run(s) from event log`)
      } catch (err) {
        log(`[graph] rebuildRegistryFromLog failed: ${err instanceof Error ? err.message : err}`)
      }
      // running loop 恢复策略（on 模式）：重启瞬间不可能有活着的 run——重启前
      // status=running 的 loop 是崩溃孤儿，改写为 paused + 过期 nextTickAt（恢复标记）
      // 并加入白名单，spawner.poll 命中即自动重发一次 tick。用户主动 paused 的 loop
      // 不在白名单，不会被误恢复。shadow 模式只读不写（双跑护栏），不做改写。
      if (mode === 'on' && spawner) {
        try {
          for (const loop of await store.listLoops()) {
            if (loop.status !== 'running') continue
            // 本进程刚发起的 tick（start 与 REST tick 并发窗口）不算崩溃孤儿
            if (spawner.isTicking(loop.id)) continue
            await store.updateLoop(loop.id, { status: 'paused', nextTickAt: new Date().toISOString() })
            autoResumeIds.add(loop.id)
            bridgeLoopEvent({
              type: 'loop.stuck', loopId: loop.id,
              reason: 'restart-recovery: process restarted while loop was running; auto-resume scheduled',
              ts: new Date().toISOString(),
            })
            log(`[graph] loop ${loop.id} recovered from stale running state (paused, auto-resume armed)`)
          }
        } catch (err) {
          log(`[graph] running-loop recovery failed: ${err instanceof Error ? err.message : err}`)
        }
      }
      spawner?.start()
      shadowRunner?.start()
      if (!tryBindSocket()) scheduleSocketRetry()
      log(`[graph] engine mode: ${mode}`)
      return assembly
    },
    stop() {
      spawner?.stop()
      shadowRunner?.stop()
      if (socketTimer) {
        clearTimeout(socketTimer)
        socketTimer = null
      }
    },
  }
  return assembly
}
