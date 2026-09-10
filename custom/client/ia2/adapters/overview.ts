// overlay/custom/client/ia2/adapters/overview.ts
// P3 Task 4 — 总览首屏纯函数投影层（组件薄壳化，同 runcenter/adapters 纪律）：
//   mergeAttention    注意力优先级归并（收编 cockpit CockpitAttention 的
//                     blocked/review/triage 梯队模型，纯函数化 + i18n 化——
//                     原实现对标题硬编码中文前缀，此处只归并结构、文案留给视图层）
//   aggregateActiveRuns / aggregateInbox   四卡片中两张的数字（复用 runs store 数据）
//   aggregateMetrics  关键指标（近 7 天成功率/平均耗时/熔断计数）——输入是 runs store
//                     fetchMetrics() 的原始采集包（store 只采集不计算，见 types.ts
//                     MetricsRaw 注释；服务端无现成 metrics 端点，前端聚合）
//   buildTodayPlan    今日计划推导（到期未触发 idle loops + 今日待办）
//   formatDuration    耗时人性化（单位字母 locale 中立：1h 23m / 4m 05s）
//
// 全部纯函数、零 store、零 DOM；相对时间 token 复用 runcenter relativeTime
// （单一事实源，组件层以 runcenter.time.* 文案渲染）。
import type {
  MetricsRaw, RelativeTimeToken, RunStatus,
} from '@/custom/loop/runcenter/types'
import { relativeTime } from '@/custom/loop/runcenter/adapters'

// ---------------------------------------------------------------------------
// 注意力优先级归并
// ---------------------------------------------------------------------------

/** 注意力梯队词表（与 cockpit attention-adapter 的 attentionTier 同权重：
 *  blocked=0 > review=1 > triage=2；todo 不进注意力条——与 CockpitAttention 一致，
 *  全量 todo 会淹没条；todo 提醒走今日计划与 Task 5 介入收件箱） */
export type AttentionTier = 'blocked' | 'review' | 'triage'

export const ATTENTION_TIER: Record<AttentionTier, number> = {
  blocked: 0,
  review: 1,
  triage: 2,
}

/** 注意力输入（cockpit 跨 board 聚合任务的结构化最小形状） */
export interface AttentionInput {
  id: string
  title: string
  status: string
  /** 数字词表（0 最高）与 P 字符串词表（'P0'..'P3'）双词汇；其余视为最低档 */
  priority?: number | string | null
  /** 创建时刻 epoch ms（缺省视为最旧） */
  createdAt?: number | null
}

export interface AttentionRow {
  /** 条目 id（att- 前缀避免与 taskId 混用） */
  id: string
  taskId: string
  title: string
  status: AttentionTier
  severity: 'high' | 'medium'
  priority: number
  createdAt: number
}

/** 优先级双词汇归一：数字直通；'P0'..'P3' → 0..3；其余回最低档 3 */
function normalizePriority(p: AttentionInput['priority']): number {
  if (typeof p === 'number' && Number.isFinite(p)) return p
  if (typeof p === 'string') {
    const m = /^P([0-3])$/i.exec(p.trim())
    if (m) return Number(m[1])
  }
  return 3
}

/**
 * 注意力归并：只取 blocked/review/triage，排序 = 梯队 → 优先级 → 创建时间降序。
 * 排序权重与 cockpit attention-adapter 完全一致（收编不变频）。
 */
export function mergeAttention(tasks: AttentionInput[]): AttentionRow[] {
  return tasks
    .map(t => {
      const status = t.status as AttentionTier
      if (!(status in ATTENTION_TIER)) return null
      return {
        id: `att-${t.id}`,
        taskId: t.id,
        title: t.title,
        status,
        severity: status === 'review' ? 'medium' as const : 'high' as const,
        priority: normalizePriority(t.priority),
        createdAt: typeof t.createdAt === 'number' ? t.createdAt : -1,
      }
    })
    .filter((x): x is AttentionRow => x !== null)
    .sort((a, b) =>
      ATTENTION_TIER[a.status] - ATTENTION_TIER[b.status]
      || a.priority - b.priority
      || b.createdAt - a.createdAt)
}

// ---------------------------------------------------------------------------
// 卡片数字：活跃运行 / 等你决策
// ---------------------------------------------------------------------------

/** 卡片输入：runs store 的 RunSummary 结构化子集（status + 两个候选活动时刻） */
export type RunCardInput = {
  status: RunStatus
  updatedAt: string | null
  lastActivityAt?: string | null
}

export interface ActiveRunsAgg {
  running: number
  awaiting: number
  /** 活跃 run 的最近活动时刻（无活跃 run 为 null） */
  lastActivityAt: string | null
}

/** 活跃运行卡：running/awaiting-input 计数 + 最近活动（事件投影优先，REST 兜底） */
export function aggregateActiveRuns(runs: RunCardInput[]): ActiveRunsAgg {
  let running = 0
  let awaiting = 0
  let last: string | null = null
  for (const r of runs) {
    if (r.status === 'running') running++
    else if (r.status === 'awaiting-input') awaiting++
    else continue
    const ts = r.lastActivityAt ?? r.updatedAt
    if (ts && (last === null || ts > last)) last = ts
  }
  return { running, awaiting, lastActivityAt: last }
}

export interface InboxAgg {
  awaiting: number
  /** 最久等待毫秒（最早可考时刻距今）；无待决或无时刻为 null */
  longestWaitMs: number | null
}

/** 等你决策卡：awaiting-input 计数 + 最久等待时长 */
export function aggregateInbox(runs: RunCardInput[], now: number): InboxAgg {
  let awaiting = 0
  let earliest: number | null = null
  for (const r of runs) {
    if (r.status !== 'awaiting-input') continue
    awaiting++
    const ts = r.lastActivityAt ?? r.updatedAt
    if (!ts) continue
    const t = Date.parse(ts)
    if (!Number.isFinite(t)) continue
    if (earliest === null || t < earliest) earliest = t
  }
  return { awaiting, longestWaitMs: earliest === null ? null : Math.max(0, now - earliest) }
}

/** 相对时间 token 直通（复用 runcenter 单一事实源；组件以 runcenter.time.* 渲染） */
export function activeRunsLastActivityToken(
  agg: ActiveRunsAgg,
  now: number = Date.now(),
): RelativeTimeToken | null {
  return relativeTime(agg.lastActivityAt, now)
}

// ---------------------------------------------------------------------------
// 关键指标（近 7 天）：成功率 / 平均耗时 / 熔断计数
// ---------------------------------------------------------------------------

export interface OverviewMetrics {
  /** completed/(completed+failed)，窗口内零终态为 null（不显示误导性 0%） */
  successRate: number | null
  completed: number
  failed: number
  /** 回放首尾事件差的均值；无样本为 null */
  avgDurationMs: number | null
  durationSamples: number
  /** loop.stuck 事件计数（窗口内） */
  stuckCount: number
}

const DEFAULT_WINDOW_MS = 7 * 24 * 3_600_000

/** 事件 ts 双词汇解析：epoch ms 数字直通；ISO 字符串 Date.parse；坏值 null */
function tsOf(value: string | number | undefined | null): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const t = Date.parse(value)
    if (Number.isFinite(t)) return t
  }
  return null
}

/**
 * 指标聚合（输入 = runs store fetchMetrics() 的原始采集包）：
 * - 成功率：窗口内终态 run（updatedAt 落窗）按状态计数——listRuns 即可，无需回放；
 * - 平均耗时：近窗终态 run 的回放首尾事件差（ts 双词汇），≥2 个可解析 ts 才成样本；
 * - 熔断：各 loop 事件切片中 loop.stuck 计数（窗口内）。
 */
export function aggregateMetrics(
  raw: MetricsRaw | null,
  now: number,
  windowMs: number = DEFAULT_WINDOW_MS,
): OverviewMetrics {
  const empty: OverviewMetrics = {
    successRate: null, completed: 0, failed: 0, avgDurationMs: null, durationSamples: 0, stuckCount: 0,
  }
  if (!raw) return empty
  const windowStart = now - windowMs

  let completed = 0
  let failed = 0
  for (const r of raw.runs) {
    if (r.status !== 'completed' && r.status !== 'failed') continue
    const t = r.updatedAt ? Date.parse(r.updatedAt) : NaN
    if (!Number.isFinite(t) || t < windowStart || t > now) continue
    if (r.status === 'completed') completed++
    else failed++
  }

  let totalMs = 0
  let samples = 0
  for (const replay of raw.replays) {
    let min: number | null = null
    let max: number | null = null
    for (const e of replay.events) {
      const t = tsOf(e.ts)
      if (t === null) continue
      if (min === null || t < min) min = t
      if (max === null || t > max) max = t
    }
    if (min === null || max === null || max <= min) continue
    totalMs += max - min
    samples++
  }

  let stuck = 0
  for (const slice of raw.loopEvents) {
    for (const e of slice.events) {
      if (e.type !== 'loop.stuck') continue
      const t = tsOf(e.ts)
      if (t === null || t < windowStart || t > now) continue
      stuck++
    }
  }

  return {
    successRate: completed + failed > 0 ? completed / (completed + failed) : null,
    completed,
    failed,
    avgDurationMs: samples > 0 ? totalMs / samples : null,
    durationSamples: samples,
    stuckCount: stuck,
  }
}

// ---------------------------------------------------------------------------
// 今日计划：到期未触发 idle loops + 今日待办
// ---------------------------------------------------------------------------

export interface TodayPlanLoopInput {
  id: string
  name: string
  status: string
  nextTickAt: string | null
}

export interface TodayPlanTodoInput {
  id: string
  title: string
  /** YYYY-MM-DD（本地日期，cockpit-kv UserTodo 同词表） */
  date: string
  remindAt?: number | null
}

export interface PlanItem {
  kind: 'loop' | 'todo'
  id: string
  title: string
  /** 排序/展示时刻（epoch ms）；无闹钟待办为 null（排末尾） */
  at: number | null
  /** loop：nextTickAt 已过当前时刻；待办：闹钟时刻已过（无闹钟不判逾期） */
  overdue: boolean
}

/** 本地日期串 YYYY-MM-DD（cockpit-kv UserTodo.date 同词表） */
export function localDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * 今日计划推导：
 * - loop：status === 'idle'（排期待触发；running=已触发本轮、paused/completed 不计）
 *   且 nextTickAt 落在今日（含已过时刻=到期未触发，overdue 标出）；
 * - 待办：cockpit-kv UserTodo.date === 今日；overdue = 闹钟时刻已过；
 * - 合并按 at 升序，null 排末尾。
 */
export function buildTodayPlan(
  loops: TodayPlanLoopInput[],
  todos: TodayPlanTodoInput[],
  now: Date,
): PlanItem[] {
  const nowMs = now.getTime()
  const today = localDateStr(now)
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime()

  const items: PlanItem[] = []
  for (const l of loops) {
    if (l.status !== 'idle' || !l.nextTickAt) continue
    const t = Date.parse(l.nextTickAt)
    if (!Number.isFinite(t) || t > endOfToday) continue
    items.push({ kind: 'loop', id: l.id, title: l.name, at: t, overdue: t < nowMs })
  }
  for (const td of todos) {
    if (td.date !== today) continue
    const at = typeof td.remindAt === 'number' && Number.isFinite(td.remindAt) ? td.remindAt : null
    items.push({
      kind: 'todo', id: td.id, title: td.title, at,
      overdue: at !== null && at < nowMs,
    })
  }
  return items.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity))
}

// ---------------------------------------------------------------------------
// 耗时人性化
// ---------------------------------------------------------------------------

/**
 * 毫秒 → 紧凑时长串（单位字母 locale 中立）：
 * <1s → '<1s'；<1m → '38s'；<1h → '4m 05s'；<1d → '2h 05m'；≥1d → '1d 02h'。
 * null/负值返回 null（卡片落 —）。
 */
export function formatDuration(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return null
  if (ms < 1_000) return '<1s'
  const pad = (n: number) => String(n).padStart(2, '0')
  if (ms < 60_000) return `${Math.floor(ms / 1_000)}s`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${pad(Math.floor((ms % 60_000) / 1_000))}s`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ${pad(Math.floor((ms % 3_600_000) / 60_000))}m`
  return `${Math.floor(ms / 86_400_000)}d ${pad(Math.floor((ms % 86_400_000) / 3_600_000))}h`
}
