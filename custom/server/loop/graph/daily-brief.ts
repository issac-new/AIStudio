// overlay/custom/server/loop/graph/daily-brief.ts
// P2 Task 8 — R1 每日 Brief：每日定时三段式结构化简报（进展 / 等你决策 / 今日计划），
// 经 Matrix 房间投递（m.loop.notification 通道）。**结构化汇总版，零 LLM 依赖**——
// 人话化摘要标注为 P3+。
//
// 数据源（全持久，重启自然恢复）：
// - 主事件日志：run.completed / run.failed 按 24h 窗口聚合；awaiting-input 是当前态
//   快照、无窗口（未应答的审批无论挂起多久都属"等你决策"，不随 24h 窗口滑出）。
//   跨 run 聚合走 listRuns() + 逐 run query——P2 量级（数十 run/日）足够，
//   不给 EventLogStore 加 querySince（awaiting-input 判定本就需逐 run 读 checkpoint）。
// - loop 台账：loop.stuck / loop.escalated 告警（熔断/升级）、idle 且 nextTickAt 已过
//   的到期 loop（今日计划）、loop 名解析。
// - 等待时长：checkpoint.pendingInterrupts[].raisedAtMs（A2），缺省回退 checkpoint.createdAt。
//
// 触发：挂 RunSpawner 同款 30s 轮询（本 job 自持 interval）。到期判定 =
// "cron 最近一次触发点落在今天（本地时区）&& 今天还没发过"——发送水位直接复用
// 事件日志里 graphId='daily-brief' 的 run.started 记录，不新增存储。
// 当天首轮到期评估后（无论发送还是零数据跳过）即标记当日已处理：
// 每日固定时刻语义，错过不补发，零数据日免整天重复聚合。
//
// 审计：brief 自身作为一条 run 落事件日志（runId=`run-daily-brief-<ts>`，
// graphId='daily-brief'，append run.started + run.completed），可回放可审计。
// 零数据日不投递、不落任何记录（防刷屏）。
//
// 投递：deliver 由装配层注入（LOOP_BRIEF_ROOM 配置 + 宿主提供 Matrix 传输时）；
// 未注入/未配置只落事件日志。投递失败不影响审计落账（run.completed payload
// 带 delivered:false + error）。

import * as cronParserModule from 'cron-parser'
import type { EventLogStore } from './event-log-store'
import type { LoopStateStore } from '../store/state-store'

// cron-parser 5.x ESM 下 default import 的形状不稳定（vitest ESM interop 时
// default.CronExpressionParser 为 undefined）——双形状兼容取 parse（与 next-tick.ts 同款）。
// 经 unknown 转换绕开与官方类型的结构重叠检查（运行时形状由上方注释与测试钉住）。
type CronExpressionLite = { next: () => { toISOString(): string }; prev: () => { toISOString(): string } }
type CronParse = (expr: string, opts?: { currentDate?: Date; tz?: string }) => CronExpressionLite
const parseCron: CronParse | undefined =
  (cronParserModule as unknown as { CronExpressionParser?: { parse?: CronParse } }).CronExpressionParser?.parse
  ?? (cronParserModule as unknown as { default?: { CronExpressionParser?: { parse?: CronParse } } }).default?.CronExpressionParser?.parse

/** brief 审计 run 的 graphId（聚合与水位判定都按它排除/识别自身） */
export const BRIEF_GRAPH_ID = 'daily-brief'
/** 默认每日 09:00（本地时区） */
export const DEFAULT_BRIEF_CRON = '0 9 * * *'
/** 聚合窗口：过去 24h */
export const BRIEF_WINDOW_MS = 24 * 3_600_000
/** 失败错误摘要截断长度 */
const ERROR_MAX = 160

// ---------------------------------------------------------------- 配置 ----

export interface BriefConfig {
  /** 每日触发 cron（本地时区），默认 0 9 * * * */
  cron: string
  /** Matrix 投递房间；未配置 → 只落事件日志 */
  room?: string
}

/** GRAPH_ENGINE 同款环境变量模式：LOOP_BRIEF_CRON / LOOP_BRIEF_ROOM */
export function readBriefConfig(env: Record<string, string | undefined> = process.env): BriefConfig {
  const cron = env.LOOP_BRIEF_CRON?.trim() || DEFAULT_BRIEF_CRON
  const room = env.LOOP_BRIEF_ROOM?.trim() || undefined
  return { cron, room }
}

/** cron 表达式严格早于 now 的最近一次触发点（cron-parser prev() 为排他语义：
 *  now 恰落在触发点时刻时不含 now，下一轮 30s 轮询即命中）；表达式不可解析 → null。
 *  currentDate 显式注入：parse 不带 currentDate 时 cron-parser 从真实墙钟起算，
 *  fake clock（测试/回放）会完全失效。 */
export function lastOccurrenceMs(expr: string, nowMs: number): number | null {
  if (!parseCron) return null
  try {
    const exprObj = parseCron(expr, { currentDate: new Date(nowMs) })
    return new Date(exprObj.prev()!.toISOString()).getTime()
  } catch {
    return null
  }
}

// -------------------------------------------------------------- 聚合 ----

export interface CompletedLoopSummary {
  loopId: string
  loopName: string
  /** 窗口内完成的 run 数 */
  runs: number
  /** loop 台账累计迭代数（1 run = 1 tick）；loop 记录已删除时缺省 */
  totalIterations?: number
  lastAtMs: number
}

export interface FailedRunSummary {
  loopId: string
  loopName: string
  /** 错误摘要（超长截断） */
  error: string
  atMs: number
}

export interface AwaitingInputSummary {
  loopId: string
  loopName: string
  runId: string
  interruptId?: string
  /** 已等待毫秒数（raisedAtMs 起） */
  waitingMs: number
}

export interface AlertSummary {
  loopId: string
  loopName: string
  kind: 'stuck' | 'escalated'
  reason: string
  atMs: number
}

export interface PlanItem {
  loopId: string
  loopName: string
  dueIso: string
}

export interface DailyBriefAggregate {
  completed: CompletedLoopSummary[]
  failed: FailedRunSummary[]
  awaiting: AwaitingInputSummary[]
  alerts: AlertSummary[]
  plan: PlanItem[]
}

export function aggregateIsEmpty(agg: DailyBriefAggregate): boolean {
  return agg.completed.length === 0
    && agg.failed.length === 0
    && agg.awaiting.length === 0
    && agg.alerts.length === 0
    && agg.plan.length === 0
}

function truncate(text: string): string {
  return text.length > ERROR_MAX ? text.slice(0, ERROR_MAX) + '…' : text
}

/** graphId → loopId（编译器约定 `loop-<loopId>` 反解，与 interrupt-timeout 同款） */
function loopIdOfGraphId(graphId: string): string {
  return graphId.startsWith('loop-') ? graphId.slice('loop-'.length) : graphId
}

async function loopNameOf(store: LoopStateStore, loopId: string): Promise<string> {
  try {
    const loop = await store.getLoop(loopId)
    return loop?.name ?? loopId
  } catch {
    return loopId
  }
}

/**
 * 聚合过去 24h 的图引擎事实 + 当前时点的 loop 台账状态。
 * 纯读操作：事件日志 + loop 台账，不写任何状态。
 */
export async function collectAggregate(
  deps: { eventLog: EventLogStore; store: LoopStateStore },
  nowMs: number,
): Promise<DailyBriefAggregate> {
  const { eventLog, store } = deps
  const sinceMs = nowMs - BRIEF_WINDOW_MS

  const completedGroups = new Map<string, { runs: number; lastAtMs: number }>()
  const failed: FailedRunSummary[] = []
  const awaiting: AwaitingInputSummary[] = []

  // 跨 run 聚合：列出全部 run 逐个查（量级 P2 可接受，见文件头选型说明）
  const runs = await eventLog.listRuns()
  for (const { runId, graphId } of runs) {
    if (graphId === BRIEF_GRAPH_ID) continue // brief 自身审计 run 不进聚合
    const events = await eventLog.query(runId)
    if (!events.some(e => e.kind === 'run.started')) continue // fork 未起跑等非真实执行

    const completed = events.filter(e => e.kind === 'run.completed')
    const failedEvts = events.filter(e => e.kind === 'run.failed')

    for (const c of completed) {
      if (c.ts < sinceMs || c.ts > nowMs) continue
      const g = completedGroups.get(graphId) ?? { runs: 0, lastAtMs: 0 }
      completedGroups.set(graphId, { runs: g.runs + 1, lastAtMs: Math.max(g.lastAtMs, c.ts) })
    }
    for (const f of failedEvts) {
      if (f.ts < sinceMs || f.ts > nowMs) continue
      const loopId = loopIdOfGraphId(graphId)
      failed.push({
        loopId, loopName: await loopNameOf(store, loopId),
        error: truncate(String(f.payload.error ?? 'unknown error')), atMs: f.ts,
      })
    }

    // awaiting-input：无终态且 interrupt 未应答（raised > resumed）
    if (completed.length === 0 && failedEvts.length === 0) {
      const raised = events.filter(e => e.kind === 'interrupt.raised')
      const resumedCount = events.filter(e => e.kind === 'interrupt.resumed').length
      if (raised.length > resumedCount) {
        const lastRaised = raised[raised.length - 1]!
        let raisedAtMs = Number.isFinite(lastRaised.ts) ? lastRaised.ts : NaN
        try {
          const cp = await eventLog.getLatestCheckpoint(runId)
          if (cp && cp.pendingInterrupts.length > 0) {
            const pending = cp.pendingInterrupts
              .map(i => i.raisedAtMs ?? Date.parse(cp.createdAt))
              .filter(t => Number.isFinite(t))
            if (pending.length > 0) raisedAtMs = Math.min(...pending) // 等得最久的 interrupt
          }
        } catch { /* checkpoint 读不到 → 回退 interrupt.raised 事件 ts */ }
        const waitingMs = Number.isFinite(raisedAtMs) ? Math.max(0, nowMs - raisedAtMs) : 0
        const loopId = loopIdOfGraphId(graphId)
        awaiting.push({
          loopId, loopName: await loopNameOf(store, loopId), runId,
          interruptId: typeof lastRaised.payload.interruptId === 'string' ? lastRaised.payload.interruptId : undefined,
          waitingMs,
        })
      }
    }
  }

  const completed: CompletedLoopSummary[] = []
  for (const [graphId, g] of completedGroups) {
    const loopId = loopIdOfGraphId(graphId)
    let totalIterations: number | undefined
    try {
      const loop = await store.getLoop(loopId)
      totalIterations = loop?.stats?.totalIterations
    } catch { /* loop 记录读不到 → 缺省 */ }
    completed.push({ loopId, loopName: await loopNameOf(store, loopId), runs: g.runs, totalIterations, lastAtMs: g.lastAtMs })
  }
  completed.sort((a, b) => b.lastAtMs - a.lastAtMs)
  failed.sort((a, b) => b.atMs - a.atMs)
  awaiting.sort((a, b) => b.waitingMs - a.waitingMs)

  // loop 台账：告警（stuck/escalated）+ 今日计划（到期未触发的 idle loop）
  const alerts: AlertSummary[] = []
  const plan: PlanItem[] = []
  let loops: Array<{ id: string; name: string; status?: string; nextTickAt?: string | null }> = []
  try {
    loops = await store.listLoops()
  } catch { loops = [] }
  const sinceIso = new Date(sinceMs).toISOString()
  for (const loop of loops) {
    try {
      const events = await store.queryEvents(loop.id, sinceIso)
      for (const e of events) {
        if (e.type !== 'loop.stuck' && e.type !== 'loop.escalated') continue
        const atMs = Date.parse(e.ts)
        if (!Number.isFinite(atMs) || atMs < sinceMs || atMs > nowMs) continue
        alerts.push({
          loopId: loop.id, loopName: loop.name,
          kind: e.type === 'loop.stuck' ? 'stuck' : 'escalated',
          reason: truncate(String((e as { reason?: unknown }).reason ?? '')), atMs,
        })
      }
    } catch { /* 单 loop 台账读失败不拖垮聚合 */ }
    if (loop.status !== 'idle' || !loop.nextTickAt) continue
    const due = Date.parse(loop.nextTickAt)
    if (Number.isFinite(due) && due <= nowMs) {
      plan.push({ loopId: loop.id, loopName: loop.name, dueIso: loop.nextTickAt })
    }
  }
  alerts.sort((a, b) => b.atMs - a.atMs)
  plan.sort((a, b) => Date.parse(a.dueIso) - Date.parse(b.dueIso))

  return { completed, failed, awaiting, alerts, plan }
}

// -------------------------------------------------------------- 渲染 ----

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** 本地时区日期键（YYYY-MM-DD）——水位判定与去重都按本地日 */
export function dateKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 本地时区 HH:mm */
function timeLabel(ms: number): string {
  const d = new Date(ms)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 等待时长人话化：<1h 用分钟，其余用小时（1 位小数） */
function durationLabel(ms: number): string {
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))}m`
  return `${(ms / 3_600_000).toFixed(1)}h`
}

function section(title: string, lines: string[]): string[] {
  return lines.length > 0 ? [`【${title}】`, ...lines] : []
}

/**
 * 三段式纯函数渲染：进展（完成/失败/熔断升级告警）／等你决策（awaiting-input）／
 * 今日计划（到期未触发的 loop）。空段省略段标题；全空返回空串。
 */
export function renderBrief(agg: DailyBriefAggregate, opts?: { dateLabel?: string }): string {
  const progress: string[] = []
  for (const c of agg.completed) {
    progress.push(
      `✅ ${c.loopName}：完成 ${c.runs} 个 run${c.totalIterations !== undefined ? `（累计 ${c.totalIterations} 次迭代）` : ''}`,
    )
  }
  for (const f of agg.failed) progress.push(`❌ ${f.loopName}：${f.error}`)
  for (const a of agg.alerts) progress.push(`🚨 ${a.loopName}：${a.reason}`)

  const decisions = agg.awaiting.map(a => `⏸ ${a.loopName}：等待已 ${durationLabel(a.waitingMs)}（run ${a.runId}）`)

  const plan = agg.plan.map(p => `▶ ${p.loopName}：到期未触发（计划 ${timeLabel(Date.parse(p.dueIso))}）`)

  const header = opts?.dateLabel ? `📋 每日 Brief（${opts.dateLabel}）` : '📋 每日 Brief'
  const body = [
    ...section('进展', progress),
    ...section('等你决策', decisions),
    ...section('今日计划', plan),
  ]
  if (body.length === 0) return ''
  return [header, '', ...body].join('\n')
}

// ---------------------------------------------------------------- Job ----

export interface DailyBriefJobOpts {
  eventLog: EventLogStore
  store: LoopStateStore
  /** 每日触发 cron（本地时区），默认 0 9 * * *；不可解析 → 回退默认并 warn 一次 */
  cron?: string
  /**
   * Matrix 投递通道（装配层注入；宿主把 m.loop.notification 传输接到配置房间）。
   * 未注入 → 只落事件日志。
   */
  deliver?: (text: string) => Promise<void>
  /** 时钟注入（测试 fake clock 用），缺省 Date.now */
  clock?: () => number
  /** 轮询周期，默认与 RunSpawner 同为 30s */
  intervalMs?: number
  log?: (msg: string) => void
}

export class DailyBriefJob {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  /** 当日已评估标记（本地日期键）：固定时刻语义——当天首轮到期评估后不再整天重试 */
  private evaluatedDateKey: string | null = null
  private readonly cron: string
  private readonly intervalMs: number
  private readonly log: (msg: string) => void

  constructor(private opts: DailyBriefJobOpts) {
    this.intervalMs = opts.intervalMs ?? 30_000
    this.log = opts.log ?? (() => {})
    const requested = opts.cron?.trim() || DEFAULT_BRIEF_CRON
    if (lastOccurrenceMs(requested, Date.now()) === null && requested !== DEFAULT_BRIEF_CRON) {
      this.log(`[graph] invalid LOOP_BRIEF_CRON="${requested}" — falling back to "${DEFAULT_BRIEF_CRON}"`)
      this.cron = DEFAULT_BRIEF_CRON
    } else {
      this.cron = requested
    }
  }

  private now(): number {
    return this.opts.clock?.() ?? Date.now()
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => { void this.poll() }, this.intervalMs)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /**
   * 到期判定：cron 最近触发点落在今天（本地日）&& 今天还没发过（事件日志水位）
   * && 今天还没评估过（内存标记，零数据日免整天重复聚合）。均按本地日期键比较。
   */
  async isDue(nowMs: number): Promise<boolean> {
    const today = dateKey(nowMs)
    if (this.evaluatedDateKey === today) return false
    const fireMs = lastOccurrenceMs(this.cron, nowMs)
    if (fireMs === null || dateKey(fireMs) !== today) return false
    const lastSentAtMs = await this.lastSentAtMs()
    if (lastSentAtMs !== null && dateKey(lastSentAtMs) === today) {
      this.evaluatedDateKey = today // 水位已判今日已发，标记免重复查
      return false
    }
    return true
  }

  /** 30s 轮询入口：到期才聚合/投递/落账。聚合失败不标记当日，下轮重试。 */
  async poll(): Promise<void> {
    if (this.running) return
    const nowMs = this.now()
    if (!(await this.isDue(nowMs))) return
    this.running = true
    try {
      const agg = await collectAggregate({ eventLog: this.opts.eventLog, store: this.opts.store }, this.now())
      this.evaluatedDateKey = dateKey(nowMs) // 固定时刻语义：当天只评估一次（成败均不再补发）
      await this.dispatch(agg, nowMs)
    } catch (err) {
      this.log(`[graph] daily brief failed: ${err instanceof Error ? err.message : err}`)
      this.evaluatedDateKey = null // 下轮重试
    } finally {
      this.running = false
    }
  }

  /** 手动/测试入口：跳过到期判定立即执行一轮（零数据日仍不投递不落账）。 */
  async runOnce(): Promise<DailyBriefAggregate> {
    const agg = await collectAggregate({ eventLog: this.opts.eventLog, store: this.opts.store }, this.now())
    await this.dispatch(agg, this.now())
    return agg
  }

  // ------------------------------------------------------------------

  /** 发送水位：事件日志中 brief 审计 run 的最近一次 run.started（持久，重启不丢） */
  private async lastSentAtMs(): Promise<number | null> {
    const runs = await this.opts.eventLog.listRuns()
    let last: number | null = null
    for (const r of runs) {
      if (r.graphId !== BRIEF_GRAPH_ID) continue
      const started = await this.opts.eventLog.query(r.runId, { kind: 'run.started', limit: 1 })
      if (started.length === 0) continue
      last = last === null ? started[0]!.ts : Math.max(last, started[0]!.ts)
    }
    return last
  }

  /** 零数据 → 直接返回（不投递不落账）；否则投递 + 审计落账（run.started + run.completed） */
  private async dispatch(agg: DailyBriefAggregate, nowMs: number): Promise<void> {
    if (aggregateIsEmpty(agg)) return

    const text = renderBrief(agg, { dateLabel: dateKey(nowMs) })
    const runId = `run-${BRIEF_GRAPH_ID}-${nowMs}`
    const audit = { runId, graphId: BRIEF_GRAPH_ID }
    await this.opts.eventLog.append({ ...audit, ts: this.now(), kind: 'run.started', payload: { trigger: 'daily' } })

    let delivered = false
    let error: string | undefined
    if (this.opts.deliver) {
      try {
        await this.opts.deliver(text)
        delivered = true
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
        this.log(`[graph] daily brief delivery failed: ${error}`)
      }
    }
    await this.opts.eventLog.append({
      ...audit, ts: this.now(), kind: 'run.completed',
      payload: {
        delivered, ...(error !== undefined ? { error } : {}),
        sections: {
          progress: agg.completed.length + agg.failed.length,
          decisions: agg.awaiting.length,
          alerts: agg.alerts.length,
          plan: agg.plan.length,
        },
      },
    })
  }
}
