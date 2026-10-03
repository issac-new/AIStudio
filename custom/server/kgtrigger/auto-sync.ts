/**
 * KG 自动同步执行面（A1，2026-10-02）——kg-trigger 状态机 + mtime 观测 + syncAllBoardGraphs
 * 的副作用接线。
 *
 * startKgAutoSync()：60s setInterval（unref，不挡进程退出）枚举各板 kanban.db mtime，
 * 变化者进 pending；攒批/窗口触发才真同步。单飞锁（进行中跳过本轮）；env
 * KG_AUTO_SYNC=0 整体关闭（默认开）；成功同步后 5min 节流。手动兜底：tickKgAutoSync
 * （POST /api/kg-evolution/tick）立即推进一轮（force 绕过节流与攒批等待，但仍要求
 * pending 非空——没变化硬同步是空转）。
 *
 * 测试注入：setAutoSyncRunnerForTests 替换真同步（照抄 semantica-client
 * setBridgeRunnerForTests 的注入点模式）。
 */
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { kanbanDbFiles, openReadonly } from '../governance/governance-analytics'
import { syncAllBoardGraphs, type BoardSyncResult } from '../knowledge/board-graph'
import {
  advanceTick, emptyTriggerState, markSyncSuccess, readTriggerState, writeTriggerState,
  DEFAULT_BATCH_SIZE, DEFAULT_BATCH_WINDOW_MS, DEFAULT_MIN_SYNC_INTERVAL_MS,
  type BoardObservation, type TriggerState,
} from './kg-trigger'

const TICK_INTERVAL_MS = 60_000

let timer: ReturnType<typeof setInterval> | null = null
let syncing = false
let armed = true

/** env 总闸：KG_AUTO_SYNC=0 关闭（默认开）。 */
export function autoSyncEnvEnabled(): boolean {
  return process.env.KG_AUTO_SYNC !== '0'
}

// ---- 同步执行器注入（测试用；默认真跑 syncAllBoardGraphs） ----
type SyncRunner = () => Promise<BoardSyncResult[] | null>
let syncRunner: SyncRunner = () => syncAllBoardGraphs()

export function setAutoSyncRunnerForTests(runner: SyncRunner | null): void {
  syncRunner = runner ?? (() => syncAllBoardGraphs())
}

/** 观测各板：slug + kanban.db mtime + 结案任务数（sqlite 只读，失败按 count=1 计）。 */
export async function observeBoards(): Promise<BoardObservation[]> {
  const out: BoardObservation[] = []
  for (const file of kanbanDbFiles()) {
    // Windows 反斜杠路径归一后再取 slug，否则所有板并成 'main'（与 board-graph.syncAllBoardGraphs 同修）
    const m = file.split('\\').join('/').match(/boards\/([^/]+)\/kanban\.db$/)
    const slug = m ? m[1] : 'main'
    try {
      const mtimeMs = Math.round(statSync(file).mtimeMs)
      let count = 1
      let db: Awaited<ReturnType<typeof openReadonly>> | undefined
      try {
        db = await openReadonly(file)
        const row = db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE status IN ('done','archived')").get() as { c: number } | undefined
        if (row && Number.isFinite(row.c)) count = row.c
      } catch { /* 读不出如实按 1 计（有变化但任务数未知） */ }
      finally { try { db?.close() } catch { /* 已关 */ } }
      out.push({ slug, mtimeMs, count })
    } catch { /* stat 失败（文件刚被删）跳过该板 */ }
  }
  return out
}

export interface TickReport {
  ok: boolean
  /** 本轮是否真正执行了同步（false=观望：idle/节流/未攒够/单飞跳过/env 关）。 */
  synced: boolean
  reason: 'batch' | 'window' | 'throttled' | 'idle' | 'forced' | 'in-flight' | 'disarmed' | 'env-off'
  pendingCount: number
  results?: BoardSyncResult[]
  state: TriggerState
}

/** 推进一轮：观测 → 状态机 → （满足则）同步 → 持久化。force=手动兜底（绕节流/攒批）。 */
export async function tickKgAutoSync(opts: { force?: boolean } = {}): Promise<TickReport> {
  if (!autoSyncEnvEnabled()) {
    const st = readTriggerState()
    return { ok: false, synced: false, reason: 'env-off', pendingCount: Object.keys(st.pending).length, state: st }
  }
  if (syncing) {
    const st = readTriggerState()
    return { ok: true, synced: false, reason: 'in-flight', pendingCount: Object.keys(st.pending).length, state: st }
  }
  if (!armed && !opts.force) {
    // disarm 只停自动触发；手动 tick 仍可推进（兜底面独立于开关，如实在报告里体现）
    const st = readTriggerState()
    return { ok: true, synced: false, reason: 'disarmed', pendingCount: Object.keys(st.pending).length, state: st }
  }
  syncing = true
  try {
    const observed = await observeBoards()
    const now = Date.now()
    const advanced = advanceTick(readTriggerState(), observed, now)
    let state = advanced.state
    let report: TickReport = { ok: true, synced: false, reason: advanced.reason, pendingCount: Object.keys(state.pending).length, state }
    // force=手动兜底：绕过节流与攒批等待，但仍要求 pending 非空（没变化硬同步是空转）
    const forcedDue = Boolean(opts.force) && Object.keys(state.pending).length > 0
    if (advanced.triggered || forcedDue) {
      const results = await syncRunner()
      if (results) {
        state = markSyncSuccess(state, Date.now())
        report = { ok: true, synced: true, reason: opts.force && !advanced.triggered ? 'forced' : advanced.reason, pendingCount: 0, results, state }
      }
      // 同步失败（runner 返回 null）：pending 不动，下轮重试
    }
    writeTriggerState(state)
    return report
  } finally {
    syncing = false
  }
}

/** 启动自动同步（幂等）；env 关闭返回 null。返回 stop 句柄（进程退出靠 unref 自然停）。 */
export function startKgAutoSync(): { stop: () => void } | null {
  if (!autoSyncEnvEnabled()) return null
  if (timer) return { stop: stopKgAutoSync }
  armed = true
  timer = setInterval(() => { void tickKgAutoSync() }, TICK_INTERVAL_MS)
  timer.unref()
  return { stop: stopKgAutoSync }
}

export function stopKgAutoSync(): void {
  if (timer) { clearInterval(timer); timer = null }
}

/** arm/disarm：运行期开关（env 总闸关闭时 arm 拒绝——env 是硬闸）。 */
export function armKgAutoSync(on: boolean): { armed: boolean; envEnabled: boolean } {
  if (on && !autoSyncEnvEnabled()) return { armed: false, envEnabled: false }
  armed = on
  return { armed, envEnabled: autoSyncEnvEnabled() }
}

export interface AutoSyncStatus {
  envEnabled: boolean
  armed: boolean
  running: boolean
  intervalMs: number
  batchSize: number
  batchWindowMs: number
  minSyncIntervalMs: number
  pendingCount: number
  pending: Array<TriggerState['pending'][string] & { slug: string; ageMs: number }>
  lastSuccessAt: number
  /** 节流余量（ms）：距下次允许自动同步的剩余等待；0=已可触发。 */
  throttleRemainMs: number
}

export function kgAutoSyncStatus(): AutoSyncStatus {
  const state = readTriggerState()
  const now = Date.now()
  const remain = Math.max(0, DEFAULT_MIN_SYNC_INTERVAL_MS - (now - state.lastSuccessAt))
  return {
    envEnabled: autoSyncEnvEnabled(),
    armed,
    running: timer !== null,
    intervalMs: TICK_INTERVAL_MS,
    batchSize: DEFAULT_BATCH_SIZE,
    batchWindowMs: DEFAULT_BATCH_WINDOW_MS,
    minSyncIntervalMs: DEFAULT_MIN_SYNC_INTERVAL_MS,
    pendingCount: Object.keys(state.pending).length,
    pending: Object.entries(state.pending).map(([slug, e]) => ({ slug, ...e, ageMs: Math.max(0, now - e.firstSeenAt) })),
    lastSuccessAt: state.lastSuccessAt,
    throttleRemainMs: state.lastSuccessAt === 0 ? 0 : remain,
  }
}

export { emptyTriggerState }
