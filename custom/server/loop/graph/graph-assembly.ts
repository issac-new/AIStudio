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
import type { LoopEvent } from '../types'

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

export interface GraphAssemblyOpts {
  io?: SocketIOInput
  engineDeps: CompileDeps
  mode?: GraphEngineMode
  eventLog?: EventLogStore
  shadowEventLog?: EventLogStore
  specStorePath?: string
  intervalMs?: number
  log?: (msg: string) => void
}

export interface GraphAssembly {
  mode: GraphEngineMode
  graphService: GraphService
  shadowGraphService: GraphService | null
  router: Router
  specStore: GraphSpecStore
  spawner: RunSpawner | null
  shadowRunner: ShadowRunner | null
  /** loop REST tick/webhook 的图引擎分流目标（patch 在 mode=on 时用它替换 legacy scheduler 入参） */
  loopTickTarget: { manualTick(loopId: string): Promise<unknown>; handleWebhook(loopId: string, source: string, eventType: string): void }
  /** 旧审批端点桥接：契约 id → pendingInterrupt approval:<id> → resume */
  resumeApproval(contractId: string, decision: 'approved' | 'rejected' | 'changes-requested'): Promise<{ ok: boolean; runId?: string }>
  start(): GraphAssembly
  stop(): void
}

export function createGraphAssembly(opts: GraphAssemblyOpts): GraphAssembly {
  const mode = opts.mode ?? readEngineMode()
  const log = opts.log ?? (() => {})
  const store: LoopStateStore = opts.engineDeps.store
  const eventLog = opts.eventLog ?? createEventLogStore('.loop/graph-events.db')
  const shadowEventLog = opts.shadowEventLog ?? createEventLogStore('.loop/graph-shadow.db')

  const graphService = new GraphService({
    eventLog,
    deps: {
      // loop.* 桥接事件分流：投影进 loop 事件存储 + loop socket 房间；graph.* 原样留给订阅方
      emitEvent: (e) => {
        const type = (e as { type: string }).type
        if (typeof type === 'string' && type.startsWith('loop.')) {
          void store.appendEvent(e as unknown as LoopEvent).catch(() => {})
          const ioNow = resolveIo(opts.io)
          if (ioNow) emitLoopEvent(ioNow as never, e as never)
        }
      },
    },
  })

  const specStore = new GraphSpecStore(opts.specStorePath)
  void specStore.load().catch(() => {})

  const spawner = mode === 'on'
    ? new RunSpawner({
        graphService, store, eventLog,
        compile: loop => compileLoopToDef(loop, opts.engineDeps, { appendById: appendContractsById }),
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

  const io = resolveIo(opts.io)
  if (io) {
    setupGraphSocketNamespace(io, graphService, eventLog)
  }

  const assembly: GraphAssembly = {
    mode,
    graphService,
    shadowGraphService,
    router,
    specStore,
    spawner,
    shadowRunner,
    loopTickTarget: {
      manualTick: (loopId) => (spawner ? spawner.tickNow(loopId) : Promise.resolve(null)),
      handleWebhook: (loopId, source, eventType) => { spawner?.handleWebhook(loopId, source, eventType) },
    },
    resumeApproval: (contractId, decision) => resumeApprovalForContract({ graphService, eventLog }, contractId, decision),
    start() {
      spawner?.start()
      shadowRunner?.start()
      log(`[graph] engine mode: ${mode}`)
      return assembly
    },
    stop() {
      spawner?.stop()
      shadowRunner?.stop()
    },
  }
  return assembly
}
