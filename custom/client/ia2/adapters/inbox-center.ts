// overlay/custom/client/ia2/adapters/inbox-center.ts
// P3 Task 5 — 介入中心投影层（五源聚合收件箱 + Triage 分诊 + 自动归档）。
//
// 五源与优先级模型（收编 cockpit inbox-adapter / CockpitNotifyModal 的权重思想，
// 词表收窄为介入五源；模型收编不复制组件）：
//   approval(0) 审批/中断 > blocked(1) 阻塞任务 > review(2) 待审任务
//   > alarm(3) 熔断/停滞告警 > reminder(4) 待办提醒
// Triage 排序 = 等待时长 × 严重度（brief §7B.4）：score = waitMs × severityFactor，
// 同分回源权重（优先级模型保底）→ ts 升序 → id（确定性排序）。
// 严重度由源归一：approval/blocked → high、review/stuck 告警 → medium、
// escalated 告警 → high（升级已耗尽重试，语义高于停滞）、reminder → low。
//
// 两个本地 kv（cockpit-kv / runcenter inbox 同款纪律：safe get/set（quota/异常
// 静默）、JSON 畸形按空兜底、storage 可注入；显式传 null 退化纯内存不落盘）：
// - 已分诊：entryId → 日切键（YYYY-MM-DD）。读取只认当日键 = 日切自动重置；
// - 自动归档：entryId → { ts, entry 快照 }。完成态条目（如审批 run 恢复离场）由
//   视图层记录快照，已分诊视图展示 ≤7 天的归档，超期读取时过滤（7 天衰减）。
//
// 全部纯函数、零 store、零 DOM；路由深链只产 RouteLocationRaw 描述（vue-router
// 类型），不触发导航。日期词表复用 overview.ts localDateStr（单一事实源）。
import type { RouteLocationRaw } from 'vue-router'
import type { RunSummary } from '@/custom/loop/runcenter/types'
import type { KvStorage } from '@/custom/loop/runcenter/adapters/inbox'
import { parseApprovalInterrupt } from '@/custom/loop/runcenter/adapters/intervention'
import { localDateStr } from './overview'

// ---------------------------------------------------------------------------
// 词表与条目形状
// ---------------------------------------------------------------------------

/** 介入五源 kind（顺序即源优先级） */
export type TriageKind = 'approval' | 'blocked' | 'review' | 'alarm' | 'reminder'

export type TriageSeverity = 'high' | 'medium' | 'low'

/** 源优先级权重（越小越前；同分排序保底） */
export const TRIAGE_KIND_WEIGHT: Record<TriageKind, number> = {
  approval: 0,
  blocked: 1,
  review: 2,
  alarm: 3,
  reminder: 4,
}

/** 严重度系数（triageScore = waitMs × factor） */
export const SEVERITY_FACTOR: Record<TriageSeverity, number> = {
  high: 4,
  medium: 2,
  low: 1,
}

/** 归一后条目（统一形状：{kind,severity,waitMs,title,route,ts}） */
export interface TriageEntry {
  /** 稳定 id：`<kind>:<源内唯一键>`（kv 标记/归档的键） */
  id: string
  kind: TriageKind
  severity: TriageSeverity
  title: string
  /** 副标题（审批 = graphId；其余省略） */
  subtitle?: string
  /** 可考时刻 epoch ms（排序输入；无可考为 0） */
  ts: number
  /** 已等待毫秒 = max(0, now - ts)；ts 不可考为 0 */
  waitMs: number
  /** 深链（RouteLocationRaw 描述，视图层负责导航） */
  route: RouteLocationRaw
  /** approval：runId（内联 ApprovalPanel 定位 RunSummary） */
  runId?: string
  /** alarm：loopId */
  loopId?: string
  /** blocked/review：kanban taskId */
  taskId?: string
}

/** triageScore — 等待时长 × 严重度（Triage 排序主键，越大越急） */
export function triageScore(e: Pick<TriageEntry, 'waitMs' | 'severity'>): number {
  return e.waitMs * SEVERITY_FACTOR[e.severity]
}

/** sortTriage — score 降序 → 源权重升序 → ts 升序 → id（确定性，不改入参） */
export function sortTriage<T extends TriageEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) =>
    triageScore(b) - triageScore(a)
    || TRIAGE_KIND_WEIGHT[a.kind] - TRIAGE_KIND_WEIGHT[b.kind]
    || a.ts - b.ts
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** epoch ms / ISO 双词汇解析（坏值 null）；0/负值视为不可考 */
function tsMsOf(value: string | number | null | undefined): number {
  if (value == null || value === '') return 0
  const t = typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(t) && t > 0 ? t : 0
}

// ---------------------------------------------------------------------------
// 五源归一
// ---------------------------------------------------------------------------

/** 审批源输入：awaiting-input RunSummary 的结构化子集（直接喂 RunSummary 亦可；
 *  events 可选——提供时等待锚点取未决审批 interrupt 的 raisedAt，与行内
 *  ApprovalPanel 的"已等待"同一解析函数（parseApprovalInterrupt），行内外一致） */
export type ApprovalRunInput = Pick<RunSummary, 'runId' | 'graphId' | 'lastActivityAt' | 'updatedAt'>
  & Partial<Pick<RunSummary, 'events'>>

/** 源 ①——审批/中断：每个 awaiting run 一条（等待 = 挂起至今） */
export function normalizeApprovals(runs: readonly ApprovalRunInput[], now: number): TriageEntry[] {
  return runs.map(r => {
    const raisedAt = r.events ? parseApprovalInterrupt(r.events)?.raisedAt ?? null : null
    const ts = tsMsOf(raisedAt) || tsMsOf(r.lastActivityAt) || tsMsOf(r.updatedAt)
    return {
      id: `approval:${r.runId}`,
      kind: 'approval' as const,
      severity: 'high' as const,
      title: r.runId,
      subtitle: r.graphId || undefined,
      ts,
      waitMs: ts > 0 ? Math.max(0, now - ts) : 0,
      route: { name: 'ia2.runDetail', params: { runId: r.runId } },
      runId: r.runId,
    }
  })
}

/** 任务源输入：cockpit 跨 board 聚合任务的结构化子集 */
export interface TaskSourceInput {
  id: string
  title: string
  status: string
  /** 创建时刻 epoch ms（cockpit task createdAt 已是 ms；缺省视为不可考） */
  createdAt?: number | null
}

/** 源 ②③——阻塞/待审任务：其余状态不进收件箱（与注意力条同域不同责：
 *  这里是"可分诊"全量条目，注意力条只做首屏横条摘要） */
export function normalizeTasks(tasks: readonly TaskSourceInput[], now: number): TriageEntry[] {
  const out: TriageEntry[] = []
  for (const t of tasks) {
    if (t.status !== 'blocked' && t.status !== 'review') continue
    const ts = tsMsOf(t.createdAt ?? null)
    out.push({
      id: `task:${t.id}`,
      kind: t.status === 'blocked' ? 'blocked' : 'review',
      severity: t.status === 'blocked' ? 'high' : 'medium',
      title: t.title,
      ts,
      waitMs: ts > 0 ? Math.max(0, now - ts) : 0,
      route: { path: '/app/tasks' },
      taskId: t.id,
    })
  }
  return out
}

/** 告警源输入：runs store fetchMetrics 采集的 loop 事件切片
 *  （MetricsRaw['loopEvents']；既有通道复用，零新轮询） */
export interface AlarmSourceInput {
  loopId: string
  events: ReadonlyArray<{ type?: string; ts?: string | number }>
}

/** 源 ④——熔断/停滞告警：每 loop 取最近一条 loop.stuck / loop.escalated；
 *  escalated → high（升级 = 重试耗尽）、stuck → medium；无告警事件的 loop 不产条目 */
export function normalizeAlarms(
  slices: readonly AlarmSourceInput[],
  now: number,
  loopNames?: Record<string, string>,
): TriageEntry[] {
  const out: TriageEntry[] = []
  for (const slice of slices) {
    let latestTs = 0
    let escalated = false
    for (const e of slice.events) {
      if (e.type !== 'loop.stuck' && e.type !== 'loop.escalated') continue
      const t = tsMsOf(e.ts)
      if (t === 0) continue
      if (t > latestTs) { latestTs = t; escalated = e.type === 'loop.escalated' }
      else if (t === latestTs && e.type === 'loop.escalated') { escalated = true }
    }
    if (latestTs === 0) continue
    out.push({
      id: `alarm:${slice.loopId}`,
      kind: 'alarm',
      severity: escalated ? 'high' : 'medium',
      title: loopNames?.[slice.loopId] || slice.loopId,
      ts: latestTs,
      waitMs: Math.max(0, now - latestTs),
      route: { path: '/app/runs', query: { loop: slice.loopId } },
      loopId: slice.loopId,
    })
  }
  return out
}

/** 待办源输入：cockpit UserTodo 的结构化子集 */
export interface ReminderSourceInput {
  id: string
  title: string
  /** YYYY-MM-DD（本地日期，cockpit-kv 同词表） */
  date: string
  remindAt?: number | null
  createdAt?: number | null
}

/** 源 ⑤——待办提醒：今日待办 ∪ 闹钟已到（含逾期）的待办；未来日程不进队列 */
export function normalizeReminders(
  todos: readonly ReminderSourceInput[],
  now: number,
  todayKey: string,
): TriageEntry[] {
  const out: TriageEntry[] = []
  for (const td of todos) {
    const remindAt = typeof td.remindAt === 'number' && Number.isFinite(td.remindAt) ? td.remindAt : null
    const due = td.date === todayKey || (remindAt !== null && remindAt <= now)
    if (!due) continue
    const ts = remindAt ?? tsMsOf(td.date) ?? 0
    out.push({
      id: `todo:${td.id}`,
      kind: 'reminder',
      severity: 'low',
      title: td.title,
      ts,
      waitMs: ts > 0 ? Math.max(0, now - ts) : 0,
      route: { path: '/app' },
    })
  }
  return out
}

/** 五源聚合输入（视图层从既有 store 投影，零新订阅） */
export interface TriageSources {
  approvals: readonly ApprovalRunInput[]
  tasks: readonly TaskSourceInput[]
  alarms: readonly AlarmSourceInput[]
  reminders: readonly ReminderSourceInput[]
}

/** 五源聚合 → 统一收件箱（归一 + 默认排序；调用方传 now/dayKey 保持可测） */
export function buildTriageEntries(
  sources: TriageSources,
  now: number,
  todayKey: string = localDateStr(new Date(now)),
  loopNames?: Record<string, string>,
): TriageEntry[] {
  return sortTriage([
    ...normalizeApprovals(sources.approvals, now),
    ...normalizeTasks(sources.tasks, now),
    ...normalizeAlarms(sources.alarms, now, loopNames),
    ...normalizeReminders(sources.reminders, now, todayKey),
  ])
}

// ---------------------------------------------------------------------------
// 本地 kv：已分诊（日切重置）∪ 自动归档（7 天衰减）
// ---------------------------------------------------------------------------

/** localStorage 键（ia2 域前缀，与 runcenter/cockpit kv 互不串扰） */
export const TRIAGED_KEY = 'ia2:inbox:triaged'
export const RESOLVED_KEY = 'ia2:inbox:resolved'

/** 自动归档衰减窗口：完成态条目 7 天后从列表消失 */
export const RESOLVE_DECAY_MS = 7 * 24 * 3_600_000

function resolveStorage(storage?: KvStorage | null): KvStorage | null {
  if (storage !== undefined) return storage
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

function readJsonMap<T>(store: KvStorage | null, key: string): Record<string, T> {
  if (!store) return {}
  let raw: string | null = null
  try { raw = store.getItem(key) } catch { return {} }
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, T>
  } catch {
    return {}
  }
}

function writeJsonMap(store: KvStorage | null, key: string, map: Record<string, unknown>): void {
  if (!store) return
  try { store.setItem(key, JSON.stringify(map)) } catch { /* quota 静默 */ }
}

// —— 已分诊：entryId → 日切键；读取只认当日键 = 日切自动重置 ——

export function loadTriagedMap(storage?: KvStorage | null): Record<string, string> {
  const map = readJsonMap<string>(resolveStorage(storage), TRIAGED_KEY)
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(map)) if (typeof v === 'string') out[k] = v
  return out
}

/** 标记已分诊（dayKey = 标记当日；次日读取不认 = 自动重置）；返回更新后映射 */
export function markTriaged(entryId: string, dayKey: string, storage?: KvStorage | null): Record<string, string> {
  const store = resolveStorage(storage)
  const next = { ...loadTriagedMap(store), [entryId]: dayKey }
  writeJsonMap(store, TRIAGED_KEY, next)
  return next
}

export function unmarkTriaged(entryId: string, storage?: KvStorage | null): Record<string, string> {
  const store = resolveStorage(storage)
  const next = { ...loadTriagedMap(store) }
  delete next[entryId]
  writeJsonMap(store, TRIAGED_KEY, next)
  return next
}

/** 丢弃非当日键（写回裁剪，防 kv 无界；读取层本就不认旧键） */
export function pruneTriaged(map: Record<string, string>, dayKey: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(map)) if (v === dayKey) out[k] = v
  return out
}

/** 整体写回已分诊映射（prune 后落盘；失败静默）。返回写回的映射 */
export function writeTriagedMap(map: Record<string, string>, storage?: KvStorage | null): Record<string, string> {
  writeJsonMap(resolveStorage(storage), TRIAGED_KEY, map)
  return map
}

// —— 自动归档：entryId → { ts, entry 快照 }；7 天衰减读取时过滤 ——

/** 归档快照（完成态条目离场时刻的全量拷贝，供已分诊视图在源消失后仍可渲染） */
export interface ResolvedRecord {
  /** 离场时刻 ISO */
  ts: string
  entry: TriageEntry
}

function isResolvedRecord(v: unknown): v is ResolvedRecord {
  if (v == null || typeof v !== 'object') return false
  const r = v as Partial<ResolvedRecord>
  return typeof r.ts === 'string' && r.entry != null && typeof r.entry === 'object'
    && typeof r.entry.id === 'string'
}

export function loadResolvedMap(storage?: KvStorage | null): Record<string, ResolvedRecord> {
  const map = readJsonMap<unknown>(resolveStorage(storage), RESOLVED_KEY)
  const out: Record<string, ResolvedRecord> = {}
  for (const [k, v] of Object.entries(map)) if (isResolvedRecord(v)) out[k] = v
  return out
}

/** 记录完成态条目离场（视图层在"条目从活源消失"时调用；重复记录只更新时刻） */
export function resolveEntry(
  entryId: string,
  entry: TriageEntry,
  ts: string,
  storage?: KvStorage | null,
): Record<string, ResolvedRecord> {
  const store = resolveStorage(storage)
  const next = { ...loadResolvedMap(store), [entryId]: { ts, entry } }
  writeJsonMap(store, RESOLVED_KEY, next)
  return next
}

/** 衰减过滤：ts 距 now 超过 maxAgeMs（缺省 7 天）的归档丢弃 */
export function pruneResolved(
  map: Record<string, ResolvedRecord>,
  now: number,
  maxAgeMs: number = RESOLVE_DECAY_MS,
): Record<string, ResolvedRecord> {
  const out: Record<string, ResolvedRecord> = {}
  for (const [k, r] of Object.entries(map)) {
    const t = Date.parse(r.ts)
    if (Number.isFinite(t) && now - t <= maxAgeMs) out[k] = r
  }
  return out
}

/** 整体写回归档映射（prune 后落盘；失败静默）。返回写回的映射 */
export function writeResolvedMap(
  map: Record<string, ResolvedRecord>,
  storage?: KvStorage | null,
): Record<string, ResolvedRecord> {
  writeJsonMap(resolveStorage(storage), RESOLVED_KEY, map)
  return map
}

// ---------------------------------------------------------------------------
// 分诊视图投影
// ---------------------------------------------------------------------------

export interface TriageProjection {
  /** 待分诊（默认视图「今日待分诊」）：未分诊且未归档，已排序 */
  pending: TriageEntry[]
  /** 已分诊：今日手动标记（origin triaged）∪ 未衰减归档快照（origin archived） */
  done: Array<{ entry: TriageEntry; origin: 'triaged' | 'archived' }>
}

export interface ProjectTriageOptions {
  /** 已分诊映射（entryId → dayKey） */
  triaged: Record<string, string>
  /** 归档映射（entryId → 快照） */
  resolved: Record<string, ResolvedRecord>
  /** 当日日切键 */
  dayKey: string
  now: number
  /** 衰减窗口（缺省 7 天；测试注入短窗） */
  maxAgeMs?: number
}

/**
 * projectTriage — 分诊两视图投影：
 * - pending：活条目去掉「今日已分诊」标记；归档条目若重现于活源（如同一 run
 *   reject 后 repair 重开 interrupt）照常回待处理；
 * - done：今日标记的活条目（origin triaged）∪ 未衰减归档快照（origin archived，
 *   源已消失仍可渲染）；活条目在场时其归档快照一律压制——否则同一 run 会同时
 *   出现在两个 tab（待处理可操作 ∖ 已归档显示已了结），状态自相矛盾；
 *   同 id 双态去重，手动标记优先（用户意图比自动归档新）。
 */
export function projectTriage(entries: readonly TriageEntry[], opts: ProjectTriageOptions): TriageProjection {
  const maxAgeMs = opts.maxAgeMs ?? RESOLVE_DECAY_MS
  const freshResolved = pruneResolved(opts.resolved, opts.now, maxAgeMs)

  const triagedToday = new Set<string>()
  for (const [id, day] of Object.entries(opts.triaged)) if (day === opts.dayKey) triagedToday.add(id)
  const liveIds = new Set(entries.map(e => e.id))

  const pending: TriageEntry[] = []
  const done: TriageProjection['done'] = []
  for (const e of entries) {
    if (triagedToday.has(e.id)) done.push({ entry: e, origin: 'triaged' })
    else pending.push(e)
  }
  for (const [id, r] of Object.entries(freshResolved)) {
    if (triagedToday.has(id) || liveIds.has(id)) continue // 手动标记优先 ∪ 活条目在场压制快照
    done.push({ entry: r.entry, origin: 'archived' })
  }
  return {
    pending: sortTriage(pending),
    done: [...done].sort((a, b) =>
      triageScore(b.entry) - triageScore(a.entry)
      || TRIAGE_KIND_WEIGHT[a.entry.kind] - TRIAGE_KIND_WEIGHT[b.entry.kind]
      || (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0)),
  }
}
