/**
 * KG 自动同步触发状态机（A1，2026-10-02 动态本体三部曲调研落地）——纯计算 + 状态文件。
 *
 * 攒批触发窗口：攒够 N 个待同步板（batchSize，默认 3）或最早待同步项等够 T 秒
 * （batchWindowMs，默认 30s）先到先触发——防逐文件放大成本与本体震荡（每次 sync 都
 * 是一次 bridge 批量调用+治理分级）。节流：距上次成功同步 <5min 不触发（照抄
 * decisiongraph/replay.ts maybeSnapshot 的节流思想：成功动作本身有成本，风暴无益）。
 *
 * 状态文件：pending（各板 mtime/待办数+首见时间）+ baselines（各板上次观察 mtime，
 * 首次观察只建基线不进 pending——进程重启不会把既有板全误判为变化）+ lastSuccessAt；
 * env KG_TRIGGER_STATE > ~/.hermes-web-ui/overlay/kg-trigger-state.json，tmp+rename。
 * 纯函数与 IO 分离：advanceTick/shouldTrigger 不碰 fs，守门测试直接驱动。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export const DEFAULT_BATCH_SIZE = 3
export const DEFAULT_BATCH_WINDOW_MS = 30_000
/** 成功同步节流（照抄 replay.ts SNAPSHOT_THROTTLE_MS 的量级思想）。 */
export const DEFAULT_MIN_SYNC_INTERVAL_MS = 5 * 60 * 1000

export interface TriggerPendingEntry {
  /** 该板 kanban.db 当前观察到的 mtime（ms）。 */
  mtimeMs: number
  /** 进入 pending 的时间（ms）——攒批窗口的起算点。 */
  firstSeenAt: number
  /** 待办数（结案任务数，展示/决策参考）。 */
  count: number
}

export interface TriggerState {
  baselines: Record<string, number>
  pending: Record<string, TriggerPendingEntry>
  lastSuccessAt: number
}

export function emptyTriggerState(): TriggerState {
  return { baselines: {}, pending: {}, lastSuccessAt: 0 }
}

/** 攒批触发：攒够 N 条，或最早待同步项等够 T 秒（先到先触发）。 */
export function shouldTrigger(input: {
  pendingCount: number
  oldestPendingAgeMs: number
  batchSize?: number
  batchWindowMs?: number
}): boolean {
  if (input.pendingCount <= 0) return false
  const batchSize = input.batchSize ?? DEFAULT_BATCH_SIZE
  const batchWindowMs = input.batchWindowMs ?? DEFAULT_BATCH_WINDOW_MS
  if (input.pendingCount >= batchSize) return true  // 含等于：攒够 N 条即触发
  return input.oldestPendingAgeMs >= batchWindowMs  // 含等于：等够 T 秒即触发
}

export interface BoardObservation {
  slug: string
  mtimeMs: number
  count: number
}

/** 推进一轮状态机；不执行同步本身（副作用在 auto-sync 侧接线）。 */
export function advanceTick(
  state: TriggerState,
  observed: BoardObservation[],
  now: number,
  opts: { batchSize?: number; batchWindowMs?: number; minSyncIntervalMs?: number } = {},
): { state: TriggerState; triggered: boolean; reason: 'batch' | 'window' | 'throttled' | 'idle' } {
  const next: TriggerState = {
    baselines: { ...state.baselines },
    pending: { ...state.pending },
    lastSuccessAt: state.lastSuccessAt,
  }
  const seen = new Set<string>()
  for (const o of observed) {
    seen.add(o.slug)
    const base = next.baselines[o.slug]
    if (base === undefined) {
      // 首次观察：只建基线不进 pending（进程重启不误判既有板）
      next.baselines[o.slug] = o.mtimeMs
      continue
    }
    if (base !== o.mtimeMs) {
      const prev = next.pending[o.slug]
      next.pending[o.slug] = { mtimeMs: o.mtimeMs, firstSeenAt: prev?.firstSeenAt ?? now, count: o.count }
      next.baselines[o.slug] = o.mtimeMs
    } else if (next.pending[o.slug]) {
      next.pending[o.slug] = { ...next.pending[o.slug], count: o.count }  // 待办数刷新，窗口起算不变
    }
  }
  // 消失的板（被删）：pending 与基线一并清理
  for (const slug of [...Object.keys(next.pending), ...Object.keys(next.baselines)]) {
    if (!seen.has(slug)) {
      delete next.pending[slug]
      delete next.baselines[slug]
    }
  }

  const entries = Object.values(next.pending)
  if (!entries.length) return { state: next, triggered: false, reason: 'idle' }
  const oldest = Math.min(...entries.map((e) => e.firstSeenAt))
  const due = shouldTrigger({
    pendingCount: entries.length,
    oldestPendingAgeMs: now - oldest,
    batchSize: opts.batchSize,
    batchWindowMs: opts.batchWindowMs,
  })
  if (!due) return { state: next, triggered: false, reason: 'idle' }
  const minInterval = opts.minSyncIntervalMs ?? DEFAULT_MIN_SYNC_INTERVAL_MS
  if (next.lastSuccessAt > 0 && now - next.lastSuccessAt < minInterval) {
    return { state: next, triggered: false, reason: 'throttled' }  // 节流：pending 保留，窗口过后再触发（从未成功不节流）
  }
  const reason = entries.length >= (opts.batchSize ?? DEFAULT_BATCH_SIZE) ? 'batch' : 'window'
  return { state: next, triggered: true, reason }
}

/** 同步成功后：清 pending、记时间（失败不动——pending 继续等下轮）。 */
export function markSyncSuccess(state: TriggerState, now: number): TriggerState {
  return { baselines: state.baselines, pending: {}, lastSuccessAt: now }
}

// ---- 状态文件（tmp+rename；读失败 fail-soft 空态） ----

export function kgTriggerStatePath(): string {
  const env = process.env.KG_TRIGGER_STATE?.trim()
  if (env) return resolve(env)
  return resolve(homedir(), '.hermes-web-ui', 'overlay', 'kg-trigger-state.json')
}

export function readTriggerState(): TriggerState {
  try {
    const j = JSON.parse(readFileSync(kgTriggerStatePath(), 'utf8')) as Partial<TriggerState>
    if (!j || typeof j !== 'object') return emptyTriggerState()
    return {
      baselines: j.baselines && typeof j.baselines === 'object' ? j.baselines : {},
      pending: j.pending && typeof j.pending === 'object' ? j.pending : {},
      lastSuccessAt: typeof j.lastSuccessAt === 'number' ? j.lastSuccessAt : 0,
    }
  } catch { return emptyTriggerState() }
}

export function writeTriggerState(state: TriggerState): void {
  try {
    const file = kgTriggerStatePath()
    mkdirSync(join(file, '..'), { recursive: true })
    const tmp = `${file}.tmp-${process.pid}`
    writeFileSync(tmp, JSON.stringify(state))
    renameSync(tmp, file)
  } catch (err) {
    console.warn(`[kg-trigger] 状态文件写入失败（fail-soft）：${err instanceof Error ? err.message : String(err)}`)
  }
}

/** 状态文件是否已存在（巡检/测试用）。 */
export function triggerStateExists(): boolean {
  return existsSync(kgTriggerStatePath())
}
