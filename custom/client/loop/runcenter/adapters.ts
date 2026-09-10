// overlay/custom/client/loop/runcenter/adapters.ts
// 运行中心纯函数投影层 — 组件薄壳化：所有业务推导收敛在此并重点单测。
//
// 双轴设计（task-5 brief）：图轴（graph 节点事件 nodeId：discovery/handoff/validation/
// persistence/gate/stop-check）与业务阶段轴（loop.stage-transition 的 legacy 五段）共存，
// deriveStage 把两轴折叠为统一六段阶段名供列表展示——折叠规则与 loop-to-graph.ts 的
// COMPILED_TO_REST_STAGE 互为反向映射（gate/stop-check ↔ scheduling 末段）。

import type {
  GraphEventLike, RunAction, RunStage, RunStatus, RunSummary, RelativeTimeToken,
} from './types'

// ---------------------------------------------------------------------------
// 阶段映射表（单一事实源）
// ---------------------------------------------------------------------------

/** 图轴 nodeId → 业务阶段：stop-check 折叠为 stop，其余原值直通 */
const STAGE_BY_NODE: Record<string, RunStage> = {
  discovery: 'discovery',
  handoff: 'handoff',
  validation: 'validation',
  persistence: 'persistence',
  gate: 'gate',
  'stop-check': 'stop',
}

/**
 * legacy 业务阶段（loop.stage-transition.to）→ 统一阶段。
 * P3 台账 #28（gate 双轴统一）：scheduling 折叠为 gate——与图轴 STAGE_BY_NODE.gate
 * 同向。理由：图轴的 gate 节点就是 legacy 五段视图 scheduling 末段的承载者
 * （loop-to-graph.ts COMPILED_TO_REST_STAGE 把 gate/stop-check 都投影为 scheduling），
 * 列表对用户展示的"业务阶段"取 gate（门禁语义）；stop 段由图轴 stop-check 事件
 * 独占承载，legacy 轴不存在单独的 stop-check 语义。
 */
const STAGE_BY_LEGACY: Record<string, RunStage> = {
  discovery: 'discovery',
  handoff: 'handoff',
  validation: 'validation',
  persistence: 'persistence',
  scheduling: 'gate',
}

// ---------------------------------------------------------------------------
// 事件日志投影
// ---------------------------------------------------------------------------

/** 承载阶段语义的事件类型（其余事件不影响阶段投影）；
 *  双词汇：socket type（graph.*）+ 日志 kind（graph:history 的 GraphLogEvent） */
const STAGE_EVENT_TYPES = new Set([
  // socket 词汇
  'graph.node-start',
  'graph.node-complete',
  'graph.node-error',
  'graph.interrupt',
  'node.error-routed',
  'loop.stage-transition',
  // 日志词汇（node.error-routed / loop.stage-transition 与 socket 同名，原样落盘）
  'node.started',
  'node.completed',
  'node.failed',
  'interrupt.raised',
])

/** 事件词汇归一：socket type ∪ 日志 kind → 单一判定名（审查修复：graph:history 推
 *  GraphLogEvent——kind/runId/epoch ts/payload，与 socket GraphEvent 的 type/threadId
 *  双词汇并存，投影函数必须两词汇通吃） */
function eventTypeOf(e: GraphEventLike): string {
  return (e.type ?? e.kind) ?? ''
}

/** interruptId 读取：socket 顶层 ∪ 日志 payload（logPayload 对 graph.interrupt 落
 *  payload.interruptId） */
function interruptIdOf(e: GraphEventLike): string | null {
  const raw = e.interruptId ?? e.payload?.interruptId
  return typeof raw === 'string' && raw ? raw : null
}

/**
 * deriveStage — 从事件日志推导当前业务阶段（双轴投影，双词汇）。
 * 按时间序扫描，取最后一个阶段承载事件：graph 节点事件的 nodeId 经 STAGE_BY_NODE
 * 映射，loop.stage-transition 的 to 经 STAGE_BY_LEGACY 映射；未知 nodeId（如
 * loop.stuck 桥接的 reason）不污染阶段。graph.started / run.started 视为进入
 * discovery，终态事件不清除阶段（定格在最后已知位置）。
 * 注：日志词汇的 loop.stage-transition 不携带 to（服务端 logPayload 落空 payload），
 * 阶段由节点事件承载。
 */
export function deriveStage(events: GraphEventLike[]): RunStage | null {
  let stage: RunStage | null = null
  for (const e of events) {
    const t = eventTypeOf(e)
    if (t === 'graph.started' || t === 'run.started') { stage = 'discovery'; continue }
    if (!STAGE_EVENT_TYPES.has(t)) continue
    if (t === 'loop.stage-transition') {
      const to = e.to ?? e.payload?.to
      stage = (typeof to === 'string' && STAGE_BY_LEGACY[to]) || stage
      continue
    }
    const byNode = typeof e.nodeId === 'string' ? STAGE_BY_NODE[e.nodeId] : undefined
    if (byNode) stage = byNode
  }
  return stage
}

/** deriveIteration — 事件中的最大 super-step（socket step ∪ 日志 superStep；无则 0） */
export function deriveIteration(events: GraphEventLike[]): number {
  let max = 0
  for (const e of events) {
    const s = typeof e.step === 'number' ? e.step : e.superStep
    if (typeof s === 'number' && Number.isFinite(s) && s > max) max = s
  }
  return max
}

/** deriveCost — 最后一个成本承载事件（cost.recorded / graph.completed）的累计成本
 *  （socket 顶层 totalCost ∪ 日志 payload.totalCost） */
export function deriveCost(events: GraphEventLike[]): number {
  let cost = 0
  for (const e of events) {
    const t = eventTypeOf(e)
    if (t !== 'cost.recorded' && t !== 'graph.completed' && t !== 'run.completed') continue
    const raw = e.totalCost ?? e.payload?.totalCost
    if (typeof raw === 'number' && Number.isFinite(raw)) cost = raw
  }
  return cost
}

/** deriveLastActivityAt — 事件最大 ts（ISO 字符串按原样保留，epoch 数转 ISO；
 *  空日志/全部非法返回 null） */
export function deriveLastActivityAt(events: GraphEventLike[]): string | null {
  let latest: string | null = null
  let latestMs = Number.NEGATIVE_INFINITY
  for (const e of events) {
    const t = typeof e.ts === 'number' ? e.ts
      : typeof e.ts === 'string' && e.ts ? Date.parse(e.ts) : Number.NaN
    if (!Number.isFinite(t)) continue
    if (t > latestMs) {
      latestMs = t
      latest = typeof e.ts === 'string' ? e.ts : new Date(t).toISOString()
    }
  }
  return latest
}

/**
 * latestOpenInterrupt — 待我处理的 interruptId：最后一个 interrupt（socket
 * graph.interrupt ∪ 日志 interrupt.raised）且其后没有同 id 的 resume（graph.resume ∪
 * interrupt.resumed，id 取顶层 ∪ payload.interruptId）、也没有终态事件
 * （completed/failed 双词汇）关闭它。
 */
export function latestOpenInterrupt(events: GraphEventLike[]): string | null {
  let open: string | null = null
  for (const e of events) {
    const t = eventTypeOf(e)
    if (t === 'graph.interrupt' || t === 'interrupt.raised') {
      const id = interruptIdOf(e)
      if (id) open = id
    } else if ((t === 'graph.resume' || t === 'interrupt.resumed') && interruptIdOf(e) === open) {
      open = null
    } else if (t === 'graph.completed' || t === 'run.completed' || t === 'graph.failed' || t === 'run.failed') {
      open = null
    }
  }
  return open
}

// ---------------------------------------------------------------------------
// 排序 / 过滤（"待我处理"置顶）
// ---------------------------------------------------------------------------

/** byLastActivityDesc 比较器：null 视为最旧（排在同组末尾），不抛错 */
function byLastActivityDesc(a: { lastActivityAt: string | null }, b: { lastActivityAt: string | null }): number {
  const ta = a.lastActivityAt ? Date.parse(a.lastActivityAt) : Number.NEGATIVE_INFINITY
  const tb = b.lastActivityAt ? Date.parse(b.lastActivityAt) : Number.NEGATIVE_INFINITY
  if (tb !== ta) return tb - ta
  return 0
}

/**
 * sortRuns — 列表排序：awaiting-input（待我处理）恒置顶 → 组内按最后活动倒序。
 * 纯函数，返回新数组不改入参。
 */
export function sortRuns<T extends { status: string; lastActivityAt: string | null }>(runs: readonly T[]): T[] {
  return [...runs].sort((a, b) => {
    const aAwait = a.status === 'awaiting-input' ? 0 : 1
    const bAwait = b.status === 'awaiting-input' ? 0 : 1
    if (aAwait !== bAwait) return aAwait - bAwait
    return byLastActivityDesc(a, b)
  })
}

/**
 * filterRuns — 工具条过滤：status 精确匹配 + 关键字（runId/graphId 包含、大小写不敏感）。
 * 两者可叠加；无条件时返回原列表副本。
 */
export function filterRuns<T extends { runId: string; graphId: string; status: string }>(
  runs: readonly T[],
  cond: { status?: string; query?: string },
): T[] {
  const query = cond.query?.trim().toLowerCase()
  return runs.filter(r => {
    if (cond.status && r.status !== cond.status) return false
    if (query
      && !r.runId.toLowerCase().includes(query)
      && !r.graphId.toLowerCase().includes(query)) return false
    return true
  })
}

// ---------------------------------------------------------------------------
// 合法操作集映射表（status 驱动，不存在任意跳转）
// ---------------------------------------------------------------------------

const LEGAL_ACTIONS: Record<RunStatus, RunAction[]> = {
  'awaiting-input': ['approve', 'detail'],
  'running': ['peek', 'detail'],
  'completed': ['replay', 'fork', 'detail'],
  'failed': ['replay', 'fork', 'detail'],
  'paused': ['detail'],
  'idle': ['detail'],
  'unknown': ['detail'],
}

/** legalActions — 状态 → 当前合法操作按钮集（映射表直查，未知状态收敛为只读详情） */
export function legalActions(status: RunStatus): RunAction[] {
  return LEGAL_ACTIONS[status] ?? LEGAL_ACTIONS.unknown
}

// ---------------------------------------------------------------------------
// 展示辅助
// ---------------------------------------------------------------------------

/** 状态徽标语义色 tone（Pure Ink：只映射到 CSS 变量语义，不写死色值） */
export type StatusTone = 'ok' | 'warning' | 'error' | 'muted'

export function statusTone(status: RunStatus): StatusTone {
  switch (status) {
    case 'running': return 'ok'
    case 'awaiting-input': return 'warning'
    case 'failed': return 'error'
    default: return 'muted' // completed/idle/paused/unknown
  }
}

/**
 * relativeTime — 相对时间结构化 token（i18n 留给组件层）：
 * <1min → justNow；<1h → minutesAgo；<24h → hoursAgo；更早 → daysAgo。
 * 非法时间戳返回 null（组件落 "—"）；未来时间戳（时钟偏斜）夹为 justNow。
 */
export function relativeTime(ts: string | null | undefined, now: number = Date.now()): RelativeTimeToken | null {
  if (!ts) return null
  const t = Date.parse(ts)
  if (!Number.isFinite(t)) return null
  const diff = Math.max(0, now - t) // 未来时间戳夹为 0
  if (diff < 60_000) return { key: 'justNow' }
  if (diff < 3_600_000) return { key: 'minutesAgo', n: Math.floor(diff / 60_000) }
  if (diff < 86_400_000) return { key: 'hoursAgo', n: Math.floor(diff / 3_600_000) }
  return { key: 'daysAgo', n: Math.floor(diff / 86_400_000) }
}

/** 从 REST 列表项 + 事件缓冲构建/归一 RunSummary（store 复用的归一口） */
export function toRunSummary(item: {
  runId: string
  graphId: string
  status: RunStatus
  updatedAt: string | null
}, events: GraphEventLike[] = []): RunSummary {
  return {
    runId: item.runId,
    graphId: item.graphId,
    status: item.status,
    updatedAt: item.updatedAt,
    stage: deriveStage(events),
    iteration: deriveIteration(events),
    lastActivityAt: deriveLastActivityAt(events) ?? item.updatedAt,
    cost: deriveCost(events),
    events: [...events],
    pendingInterruptId: latestOpenInterrupt(events),
  }
}
