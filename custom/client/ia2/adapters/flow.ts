// overlay/custom/client/ia2/adapters/flow.ts
// v12 工作流纯投影（2026-09-19 统一视图）：会话∪循环统一列表 / 过滤 /
// 任务挂接（tenant 六段式 + session_id + 契约 persistedTaskId 三路）/
// 动态流归并。纪律：纯函数零 IO，视图不自算；展示文案一律 i18n key（titleKey/
// statusKey/key + params），适配器不产中文。
import { parseTenant } from '@/custom/kanban/utils/tenant-parser'
import type { LoopInstance, TaskContract } from '@/custom/loop/types'
import type { CockpitTask } from '@/custom/cockpit/adapters/task-adapter'

export type StreamKind = 'room' | 'chat' | 'loop'

/** 工作台当前选择（左栏点击 → 中栏画布分派依据） */
export interface StreamSelection {
  kind: StreamKind
  id: string
}

// ── 会话行（房间 ∪ agent 会话，同列不分类）──

export interface FlowSessionRow {
  kind: 'room' | 'chat'
  id: string
  name: string
  unread: number
  /** 挂接任务 id 列表（📋N 徽章 = taskIds.length；过滤按任务号匹配） */
  taskIds: string[]
  /** 团队标签（duty/编制派生，无则空串） */
  teamTag: string
  /** 值守人（matrix-teams duty，无则 null） */
  dutyName: string | null
  lastActivityAt: number | null
}

/** 视图侧把 SDK Room / chat Session 归一成最小源行，适配器不耦合 SDK 形状 */
export interface SessionSourceRow {
  kind: 'room' | 'chat'
  id: string
  name: string
  lastActivityAt: number | null
}

export interface SessionRowHooks {
  unreadOf(id: string, kind: 'room' | 'chat'): number
  taskIdsOf(id: string, kind: 'room' | 'chat'): string[]
  teamTagOf(id: string): string
  dutyNameOf(id: string): string | null
}

export function buildSessionRows(
  sources: readonly SessionSourceRow[],
  hooks: SessionRowHooks,
): FlowSessionRow[] {
  return sources
    .map(s => ({
      kind: s.kind,
      id: s.id,
      name: s.name,
      unread: hooks.unreadOf(s.id, s.kind),
      taskIds: hooks.taskIdsOf(s.id, s.kind),
      teamTag: hooks.teamTagOf(s.id),
      dutyName: hooks.dutyNameOf(s.id),
      lastActivityAt: s.lastActivityAt,
    }))
    .sort((a, b) => {
      if (a.lastActivityAt === null && b.lastActivityAt === null) return 0
      if (a.lastActivityAt === null) return 1
      if (b.lastActivityAt === null) return -1
      return b.lastActivityAt - a.lastActivityAt
    })
}

// ── 循环行（阶段指针 + 门等待 + 阻塞 + 进度）──

/** 阶段序（①-⑤ 词表；服务端 loop-to-graph 同序，客户端本地声明避免跨层 import） */
export const LOOP_STAGE_ORDER: readonly string[] = [
  'discovery', 'handoff', 'validation', 'persistence', 'scheduling',
]

export type LoopStageTone = 'done' | 'run' | 'err' | 'todo'

export interface FlowLoopRow {
  kind: 'loop'
  id: string
  name: string
  stageIndex: number
  stageTotal: number
  stageTone: LoopStageTone
  progressPct: number
  /** 状态文案 i18n key 后缀（ia2.loop.status.<statusKey>） */
  statusKey: string
  /** 门=等你决策（awaiting-review） */
  awaitingYou: boolean
  blocked: boolean
  updatedAt: number | null
}

const LOOP_STATUS_TONE: Record<string, { tone: LoopStageTone; statusKey: string; awaitingYou?: boolean; blocked?: boolean }> = {
  completed: { tone: 'done', statusKey: 'completed' },
  failed: { tone: 'err', statusKey: 'failed' },
  blocked: { tone: 'err', statusKey: 'blocked', blocked: true },
  'awaiting-review': { tone: 'run', statusKey: 'awaitingYou', awaitingYou: true },
  running: { tone: 'run', statusKey: 'running' },
  paused: { tone: 'run', statusKey: 'paused' },
  idle: { tone: 'todo', statusKey: 'idle' },
}

export function buildLoopRows(loops: readonly LoopInstance[], _now: number): FlowLoopRow[] {
  return loops.map(l => {
    const idx = Math.max(0, LOOP_STAGE_ORDER.indexOf(l.stage))
    const total = LOOP_STAGE_ORDER.length
    const meta = LOOP_STATUS_TONE[l.status] ?? { tone: 'todo' as LoopStageTone, statusKey: 'idle' }
    const progress = l.status === 'completed'
      ? 100
      : Math.round(((idx + (meta.tone === 'run' ? 0.5 : 1)) / total) * 100)
    return {
      kind: 'loop' as const,
      id: l.id,
      name: l.name,
      stageIndex: idx,
      stageTotal: total,
      stageTone: meta.tone,
      progressPct: progress,
      statusKey: meta.statusKey,
      awaitingYou: meta.awaitingYou === true,
      blocked: meta.blocked === true,
      updatedAt: l.updatedAt ? Date.parse(l.updatedAt) : null,
    }
  })
}

// ── 过滤（类型 chips + 名称/任务号搜索）──

export interface FlowFilter {
  kind: 'all' | 'session' | 'loop'
  query: string
}

export interface FilterableRow {
  kind: StreamKind
  name: string
  /** 循环行无挂接任务号时可缺省（仅按名称过滤） */
  taskIds?: readonly string[]
}

export function filterStreams<T extends FilterableRow>(rows: readonly T[], f: FlowFilter): T[] {
  const q = f.query.trim().toLowerCase()
  return rows.filter(r => {
    if (f.kind === 'session' && r.kind === 'loop') return false
    if (f.kind === 'loop' && r.kind !== 'loop') return false
    if (!q) return true
    if (r.name.toLowerCase().includes(q)) return true
    return (r.taskIds ?? []).some(id => id.toLowerCase() === q || id.toLowerCase().startsWith(q))
  })
}

// ── 任务挂接 ──

export interface TaskLinkSource {
  id: string
  tenant: string | null
  session_id?: string | null
}

/** tenant 中的房间号：六段式第 4 段；旧格式 matrix:<roomId>:<label> 第 2 段 */
function roomOfTenant(tenant: string): string | null {
  const parsed = parseTenant(tenant)
  if (!parsed.isLegacy) return parsed.roomId || null
  const parts = tenant.split(':')
  return parts[0] === 'matrix' && parts[1] ? parts[1] : null
}

/** 房间匹配容错：tenant 房间段可能是本地部分（matrix 房间号含 ':server'，六段切分剥掉） */
function roomMatches(tenantRoom: string, roomId: string): boolean {
  return tenantRoom === roomId || roomId.startsWith(`${tenantRoom}:`)
}

/** 会话选择命中任务的条件：tenant 六段式 sessionId / 显式 session_id */
function sessionOfTask(t: TaskLinkSource): string | null {
  if (t.session_id) return t.session_id
  if (t.tenant) {
    const parsed = parseTenant(t.tenant)
    if (!parsed.isLegacy && parsed.sessionId) return parsed.sessionId
  }
  return null
}

export function linkedTaskIdsOfSession(
  sel: { kind: 'room' | 'chat'; id: string },
  tasks: readonly TaskLinkSource[],
): string[] {
  return tasks
    .filter(t => {
      if (sel.kind !== 'room') return sessionOfTask(t) === sel.id
      const tenantRoom = t.tenant ? roomOfTenant(t.tenant) : null
      return tenantRoom !== null && roomMatches(tenantRoom, sel.id)
    })
    .map(t => t.id)
}

export function linkedTasksOfLoop(
  contracts: readonly TaskContract[],
  tasks: readonly CockpitTask[],
): CockpitTask[] {
  const byId = new Map(tasks.map(t => [t.id, t]))
  const out: CockpitTask[] = []
  const seen = new Set<string>()
  for (const c of contracts) {
    const taskId = c.persistedTaskId
    if (!taskId || seen.has(taskId)) continue
    const hit = byId.get(taskId)
    if (!hit) continue
    seen.add(taskId)
    out.push(hit)
  }
  return out
}

// ── 动态流（循环事件 ∪ 运行尾部 ∪ 任务时戳，倒序封顶）──

export type FeedIcon = 'run' | 'gate' | 'task' | 'sys'

export interface FeedRow {
  id: string
  /** ms 时间戳（排序/展示共用） */
  ts: number
  icon: FeedIcon
  /** 文案 i18n key（视图 t(key, params) 渲染） */
  key: string
  params?: Record<string, string>
}

export interface FeedLoopEventLike {
  type: string
  ts: string | number
  loopName?: string
  to?: string
  from?: string
}

export interface FeedRunEventLike {
  type?: string
  kind?: string
  ts: string | number
  nodeId?: string
}

export interface FeedTaskLike {
  id: string
  title: string
  createdAt: number
  startedAt?: number | null
  completedAt?: number | null
}

function tsMs(ts: string | number): number {
  if (typeof ts === 'number') return ts
  const parsed = Date.parse(ts)
  return Number.isNaN(parsed) ? 0 : parsed
}

const LOOP_EVENT_FEED: Record<string, { icon: FeedIcon; key: string }> = {
  'loop.stage-transition': { icon: 'run', key: 'ia2.feed.loopStage' },
  'loop.escalated': { icon: 'gate', key: 'ia2.feed.loopEscalated' },
  'loop.stuck': { icon: 'gate', key: 'ia2.feed.loopStuck' },
  'loop.task-discovered': { icon: 'task', key: 'ia2.feed.loopTask' },
  'loop.verification-complete': { icon: 'run', key: 'ia2.feed.loopVerify' },
  'loop.persisted': { icon: 'task', key: 'ia2.feed.loopPersisted' },
  'loop.completed': { icon: 'run', key: 'ia2.feed.loopCompleted' },
}

export function mergeFeed(
  loopEvents: readonly FeedLoopEventLike[],
  runTails: readonly { runId: string; events: readonly FeedRunEventLike[] }[],
  tasks: readonly FeedTaskLike[],
  _now: number,
  cap = 20,
): FeedRow[] {
  const rows: FeedRow[] = []
  for (const e of loopEvents) {
    const loop = e.loopName ?? ''
    const meta = LOOP_EVENT_FEED[e.type]
    rows.push({
      id: `le:${e.type}:${tsMs(e.ts)}:${loop}`,
      ts: tsMs(e.ts),
      icon: meta?.icon ?? 'sys',
      key: meta?.key ?? 'ia2.feed.loopGeneric',
      params: { loop, to: e.to ?? '', from: e.from ?? '', type: e.type },
    })
  }
  for (const tail of runTails) {
    for (const e of tail.events.slice(-3)) {
      const type = e.kind ?? e.type ?? ''
      rows.push({
        id: `re:${tail.runId}:${tsMs(e.ts)}:${e.nodeId ?? ''}`,
        ts: tsMs(e.ts),
        icon: 'run',
        key: 'ia2.feed.runEvent',
        params: { run: tail.runId, node: e.nodeId ?? '', type },
      })
    }
  }
  for (const t of tasks) {
    rows.push({ id: `tf:c:${t.id}`, ts: t.createdAt, icon: 'task', key: 'ia2.feed.taskCreated', params: { id: t.id, title: t.title } })
    if (t.startedAt) rows.push({ id: `tf:s:${t.id}`, ts: t.startedAt, icon: 'run', key: 'ia2.feed.taskStarted', params: { id: t.id, title: t.title } })
    if (t.completedAt) rows.push({ id: `tf:d:${t.id}`, ts: t.completedAt, icon: 'task', key: 'ia2.feed.taskDone', params: { id: t.id, title: t.title } })
  }
  return rows.sort((a, b) => b.ts - a.ts).slice(0, cap)
}
