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
import { appendContractsById, type GateCommand } from './phase-nodes'
import { computeNextTick } from './next-tick'
import { createGraphRunRouter, GraphSpecStore, resumeApprovalForContract } from './graph-rest'
import { CustomSpecRuntime, createSpecRuntimeRegistry } from './spec-runtime'
import { setupGraphSocketNamespace, type SocketIOLike } from './graph-socket'
import { ShadowRunner } from './shadow-runner'
import { InterruptTimeoutScanner, DEFAULT_INTERRUPT_TIMEOUT_MS, ESCALATION_RESEND_INTERVAL_MS } from './interrupt-timeout'
import { DailyBriefJob, readBriefConfig } from './daily-brief'
import { resolveBriefRoom } from './brief-matrix-delivery'
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
  /**
   * R1 每日 Brief 的 Matrix 传输（宿主注入：把文本以 m.loop.notification 发到房间）。
   * 房间 LOOP_BRIEF_ROOM → gateway MATRIX_HOME_ROOM 回落（resolveBriefRoom）；
   * 房间已配置但未注入传输 → brief 只落事件日志。
   */
  briefDelivery?: (roomId: string, text: string) => Promise<void>
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
  /** interrupt 超时扫描器（P2 台账 h，仅 mode=on 装配）：审批超时 escalate/auto-approve/fail */
  interruptScanner: InterruptTimeoutScanner | null
  /** R1 每日 Brief 任务（仅 mode=on 装配）：三段式结构化汇总 + Matrix 投递（零 LLM 依赖） */
  briefJob: DailyBriefJob | null
  /** loop REST tick/webhook/schedule 的图引擎分流目标（patch 在 mode=on 时用它替换 legacy scheduler 入参） */
  loopTickTarget: {
    manualTick(loopId: string): Promise<unknown>
    scheduleLoop(loop: LoopInstance): void
    handleWebhook(loopId: string, source: string, eventType: string, payload?: unknown): void
  }
  /** 旧审批端点桥接：契约 id → pendingInterrupt approval:<id> → resume。
   *  approver 由 REST 层从认证主体（ctx.state.user.username）注入，服务端不信任客户端自报身份。 */
  resumeApproval(contractId: string, decision: 'approved' | 'rejected' | 'changes-requested', approver?: string): Promise<{ ok: boolean; runId?: string }>
  /** /graph namespace 是否已绑定（惰性绑定就绪即 true；供装配诊断/测试） */
  socketConnected(): boolean
  /** 启动轮询器 + 崩溃恢复（幂等）。legacy 模式无轮询器，仅做注册表重建（REST 只读面受益） */
  start(): Promise<GraphAssembly>
  stop(): void
}

/** T5（模板语义随实例化，2026-09-11）：loop.template.meta.gateCommands（模板白名单，
 *  创建时经 body.template 落进 loop 配置）并入编译 deps——compileLoopToDef 的 opts
 *  链路：deps.gateCommands → makeLoopNodeRegistry → createGateNode 命令白名单（可达的
 *  最深消费点）。与装配缺省取并集（模板叠加全局白名单，不缩减既有面），按 cmd 去重。
 *  导出供装配单测直接断言合并语义。 */
export function withTemplateDeps(base: CompileDeps, loop: LoopInstance): CompileDeps {
  const tpl = loop.template?.meta.gateCommands
  if (!Array.isArray(tpl) || tpl.length === 0) return base
  const baseCmds = base.gateCommands ?? []
  const extra: GateCommand[] = tpl
    .filter((c): c is string => typeof c === 'string' && !!c)
    .filter(c => !baseCmds.some(b => b.cmd === c))
    .map(cmd => ({ name: cmd, kind: 'validator' as const, cmd }))
  if (extra.length === 0) return base
  return { ...base, gateCommands: [...baseCmds, ...extra] }
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
    // P2 台账②：兑现"首条 loop.* 事件补试 /graph 绑定"的承诺——定时重试封顶后，
    // 借本次事件再试一次 tryBindSocket（≥2s 时间戳节流，避免事件风暴空转）。
    if (!socketBound && Date.now() - lastEventBindRetryAt >= socketRetryMs) {
      lastEventBindRetryAt = Date.now()
      tryBindSocket()
    }
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
  /** 事件驱动的补试节流时间戳（P2 台账②）：上次借 loop.* 事件 tryBindSocket 的时刻 */
  let lastEventBindRetryAt = 0
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

  // P2 台账⑥：specs 持久化走 event-log 同库表；specStorePath 仅作旧 JSON 文件迁移兜底
  const specStore = new GraphSpecStore(eventLog, opts.specStorePath)
  void specStore.load().catch(() => {})

  // webhook payload 通路（2026-09-10 风险审查 #2）：legacy Scheduler.handleWebhook 把
  // payload enqueue 给 webhookConnector（discovery 经 connector discover 排空为契约），
  // 图引擎 spawner 原本只转发 3 参、payload 被静默丢弃。从 engineDeps.connectors 找出
  // 带 enqueue 的 webhook 连接器（Connector 接口只声明 discover，按方法 duck-type 判定），
  // patch 202 注入的 connectors: [loopWebhookConnector] 单例即命中。
  const connectors = opts.engineDeps.connectors ?? []
  const webhookConnector = connectors.find(
    c => typeof (c as { enqueue?: unknown }).enqueue === 'function',
  ) as { enqueue(loopId: string, entry: { source: string; eventType: string; payload: unknown }): void } | undefined

  const spawner = mode === 'on'
    ? new RunSpawner({
        graphService, store, eventLog,
        // T5：模板 gateCommands 逐 loop 并入编译 deps（见 withTemplateDeps）
        compile: loop => compileLoopToDef(loop, withTemplateDeps(opts.engineDeps, loop), { appendById: appendContractsById }),
        emitLoopEvent: bridgeLoopEvent,
        webhookEnqueue: webhookConnector
          ? (loopId, entry) => { webhookConnector.enqueue(loopId, entry) }
          : undefined,
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

  // P2 台账 h：审批 interrupt 超时策略扫描（escalate/auto-approve/fail，默认 72h）。
  // 仅 on 模式装配——shadow 只读不写（双跑护栏），legacy 无图引擎调度。
  const interruptScanner = mode === 'on'
    ? new InterruptTimeoutScanner({
        graphService, eventLog,
        emitLoopEvent: bridgeLoopEvent,
        intervalMs: opts.intervalMs, log,
      })
    : null

  // R1 每日 Brief（spec §7A）：三段式结构化汇总，零 LLM 依赖。仅 on 模式装配
  //（与 spawner/interruptScanner 同界——legacy 无图引擎 run 可聚合，shadow 只读不写）。
  // 投递通道仅在"LOOP_BRIEF_ROOM 配置 + 宿主注入 briefDelivery 传输"同时成立时接线：
  // 配了房间但缺传输时若接一个空实现闭包，dispatch 会把"什么都没发"记成
  // delivered:true（审计失真）——此处直接不传 deliver，job 走 event-log-only
  //（delivered:false）路径；装配时 warn 一次。
  const briefConfig = readBriefConfig()
  let briefJob: DailyBriefJob | null = null
  if (mode === 'on') {
    // R1 升级：房间 LOOP_BRIEF_ROOM → gateway MATRIX_HOME_ROOM 回落（resolveBriefRoom）。
    // 凭据链第三级（gateway dotenv）在 brief-matrix-delivery 内部解析；此处只判房间有无。
    const briefRoom = resolveBriefRoom()
    if (briefRoom && !opts.briefDelivery) {
      log(briefConfig.room
        ? '[graph] LOOP_BRIEF_ROOM is set but no briefDelivery transport injected — brief stays event-log only'
        : '[graph] brief room from gateway MATRIX_HOME_ROOM but no briefDelivery transport injected — brief stays event-log only')
    }
    briefJob = new DailyBriefJob({
      eventLog, store,
      cron: briefConfig.cron,
      deliver: briefRoom && opts.briefDelivery
        ? (text) => opts.briefDelivery!(briefRoom, text)
        : undefined,
      intervalMs: opts.intervalMs, log,
    })
  }

  // P4：自建 spec 起跑器（编辑器试跑链路）。gate 命令白名单来自
  // LOOP_GATE_COMMANDS（逗号分隔；未配置=空表，gate 节点带命令即拒——安全缺省）
  const specRuntime = mode === 'on'
    ? new CustomSpecRuntime({
        specStore,
        graphService,
        registry: createSpecRuntimeRegistry({
          gateCommands: (process.env.LOOP_GATE_COMMANDS ?? '').split(',').map(s => s.trim()).filter(Boolean),
        }),
        log,
      })
    : null

  const router = createGraphRunRouter({ graphService, eventLog, spawner, specStore, specRuntime })

  // P3 Task 8（spec §7B.4 最小版）：图引擎策略只读端点——设置页"图引擎策略"卡数据源。
  // 导出装配事实：当前模式 + 生效的默认审批超时/熔断阈值（只读展示；策略文件化
  // 可编辑下发随 P4）。阈值来源：RunSpawner 未注入阈值时用类内默认（10/10），
  // interrupt 超时用 InterruptTimeoutScanner 导出常量（72h / 24h 重发节流）。
  router.get('/api/graph/engine', async (ctx) => {
    ctx.body = {
      mode,
      policy: {
        failureBreakerLimit: spawner?.effectiveFailureBreakerLimit ?? 10,
        stagnationLimit: spawner?.effectiveStagnationLimit ?? 10,
        interruptTimeoutMs: DEFAULT_INTERRUPT_TIMEOUT_MS,
        escalationResendMs: ESCALATION_RESEND_INTERVAL_MS,
      },
    }
  })

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
    interruptScanner,
    briefJob,
    loopTickTarget: {
      manualTick: (loopId) => (spawner ? spawner.tickNow(loopId) : Promise.resolve(null)),
      // mode=on 时本对象作为 scheduler 传入 createLoopRouter：controllers/loop.ts 在
      // 创建/更新 loop 后调 scheduleLoop(loop)（legacy Scheduler 语义是挂 cron 定时器）。
      // 图引擎下立即评估到期情况：已到期 → 立刻发起 run；未到期 → spawner 30s 轮询兜底；
      // manual 模式无定时语义（REST manualTick / webhook 各自直连）。
      scheduleLoop: (loop) => {
        if (!spawner || loop.status !== 'idle') return
        if (loop.schedule?.mode === 'manual') return
        // P2 台账①：on 模式新建 cron loop（未手动 tick 过 → nextTickAt 为 null）原本
        // 对 null 取 NaN 直接跳过，poll 又因 !nextTickAt 永不命中 → loop 永不自启。
        // 此处复用共享 computeNextTick 算出首次时间、经 store 写回，再统一走到期判断。
        let dueIso = loop.nextTickAt
        if (!dueIso && loop.schedule?.mode === 'cron' && loop.schedule.cron) {
          dueIso = computeNextTick(loop)
          // 台账 #6（顺延 P4 清偿）：写回失败不再静默吞掉——首启时间落表失败会让
          // poll 永不命中（nextTickAt 仍为 null），log 一次留下排查线索
          store.updateLoop(loop.id, { nextTickAt: dueIso }).catch(err => {
            log(`[graph] scheduleLoop: persist nextTickAt for ${loop.id} failed: ${err instanceof Error ? err.message : err}`)
          })
        }
        const dueAt = dueIso ? new Date(dueIso).getTime() : NaN
        if (Number.isFinite(dueAt) && dueAt <= Date.now()) void spawner.tickNow(loop.id)
      },
      handleWebhook: (loopId, source, eventType, payload) => { spawner?.handleWebhook(loopId, source, eventType, payload) },
    },
    resumeApproval: (contractId, decision, approver) =>
      resumeApprovalForContract({ graphService, eventLog }, contractId, decision, approver),
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
      interruptScanner?.start()
      briefJob?.start()
      if (!tryBindSocket()) scheduleSocketRetry()
      log(`[graph] engine mode: ${mode}`)
      return assembly
    },
    stop() {
      spawner?.stop()
      shadowRunner?.stop()
      interruptScanner?.stop()
      briefJob?.stop()
      if (socketTimer) {
        clearTimeout(socketTimer)
        socketTimer = null
      }
    },
  }
  return assembly
}
