// overlay/custom/client/loop/runcenter/adapters/run-graph.ts
// 运行详情投影层（task-6）：事件日志 → 执行图状态机投影 + 三级分辨率时间轴行。
//
// 纯函数纪律：buildRunGraph / layoutRunGraph / projectEvents / formatEventTs
// 均不改入参、不触碰网络与 DOM，重点单测覆盖（__tests__/run-graph.test.ts）。
//
// 事件双词汇表（同一事实、两种载体，归一到 canonicalEventType）：
// - 事件日志 GET /api/graph/runs/:id/replay → GraphLogEvent：kind=node.started 等、
//   ts 为 epoch ms、路由事实在 payload.goto / payload.target；
// - /graph socket（store 事件缓冲）→ GraphEvent：type=graph.node-start 等、
//   ts 为 ISO 字符串、路由事实在 result.goto。
// 事件名沿用服务端原值（前端零翻译），未知类型透传不炸。

// ---------------------------------------------------------------------------
// 类型（结构化最小形状：GraphSpec / GraphLogEvent / GraphEvent 均可结构赋值）
// ---------------------------------------------------------------------------

/** 节点执行状态（brief 状态机投影的六态） */
export type RunNodeStatus = 'idle' | 'running' | 'done' | 'failed' | 'awaiting-input' | 'skipped'

/** 回放事件最小形状（GraphLogEvent ∪ GraphEvent 公共超集） */
export interface ReplayEventLike {
  /** socket 词汇（graph.node-start 等） */
  type?: string
  /** 事件日志词汇（node.started 等）——replay 端点返回；kind 优先于 type */
  kind?: string
  ts: string | number
  nodeId?: string
  /** socket 词汇的 super-step */
  step?: number
  superStep?: number
  /** 事件日志词汇的迭代计数（edge.guard-exceeded / edge.break 携带） */
  iteration?: number
  interruptId?: string
  error?: unknown
  /** socket node-complete 的执行结果（路由事实 result.goto） */
  result?: { goto?: string[]; [key: string]: unknown }
  /** 事件日志 payload（路由事实 payload.goto / payload.target；错误事实 payload.error） */
  payload?: Record<string, unknown>
  [key: string]: unknown
}

/** 拓扑最小形状（GraphSpec 的 nodes/edges 结构投影） */
export interface RunGraphTopologyLike {
  id?: string
  nodes: Array<{ id: string; type: string; config?: Record<string, unknown> }>
  edges: Array<{
    from: string
    to: string
    label?: string
    guard?: { maxIterations: number } | null
  }>
  entryNode?: string
}

/** 执行图节点投影（brief 输出契约） */
export interface RunGraphNode {
  id: string
  label: string
  type: string
  status: RunNodeStatus
  /** 节点自身完成次数（迭代徽标）；superStep 是全局步时钟，不充当节点迭代数 */
  iteration: number
  /** started→completed/failed 区间累计 ms；未闭合区间按窗口内最后事件 ts 收口 */
  durationMs: number
}

/** 执行图边投影（brief 输出契约） */
export interface RunGraphEdge {
  /** `${from}->${to}` */
  id: string
  from: string
  to: string
  /** 事件流推导：node.completed 的 goto / node.error-routed 的 target 命中即 true */
  taken: boolean
  /** 回边 guard.maxIterations（迭代徽标渲染源） */
  guard?: number
}

export interface RunGraphData {
  nodes: RunGraphNode[]
  edges: RunGraphEdge[]
}

// ---------------------------------------------------------------------------
// 事件归一（双词汇表 → 规范名）
// ---------------------------------------------------------------------------

/** 事件词汇归一表：kind（日志）与 type（socket）→ 规范名；未列出者原值透传 */
const CANONICAL: Record<string, string> = {
  'run.started': 'run-started',
  'graph.started': 'run-started',
  'run.completed': 'run-completed',
  'graph.completed': 'run-completed',
  'run.failed': 'run-failed',
  'graph.failed': 'run-failed',
  'node.started': 'started',
  'graph.node-start': 'started',
  'node.completed': 'completed',
  'graph.node-complete': 'completed',
  'node.failed': 'failed',
  'graph.node-error': 'failed',
  'interrupt.raised': 'interrupted',
  'graph.interrupt': 'interrupted',
  'interrupt.resumed': 'resumed',
  'graph.resume': 'resumed',
  'node.error-routed': 'error-routed',
  'edge.guard-exceeded': 'guard-exceeded',
  'edge.break': 'edge-break',
}

/** canonicalEventType — 事件规范名（kind 优先；未知原值透传） */
export function canonicalEventType(e: ReplayEventLike): string {
  const raw = e.kind ?? e.type ?? ''
  return CANONICAL[raw] ?? raw
}

/** eventTsMs — 事件时刻统一为 epoch ms（非法输入 0） */
export function eventTsMs(e: ReplayEventLike): number {
  const t = typeof e.ts === 'number' ? e.ts : Date.parse(e.ts)
  return Number.isFinite(t) ? t : 0
}

/** 路由事实：payload.goto（日志）∪ result.goto（socket） */
function gotoOf(e: ReplayEventLike): string[] {
  const fromPayload = e.payload?.goto
  const fromResult = e.result?.goto
  const raw = Array.isArray(fromPayload) ? fromPayload : Array.isArray(fromResult) ? fromResult : []
  return raw.filter((x): x is string => typeof x === 'string')
}

/** 错误事实：payload.error（日志）∪ 顶层 error（socket） */
function errorOf(e: ReplayEventLike): string | undefined {
  const raw = e.payload?.error ?? e.error
  return typeof raw === 'string' && raw ? raw : undefined
}

// ---------------------------------------------------------------------------
// buildRunGraph — 事件日志 → 图状态投影（纯函数）
// ---------------------------------------------------------------------------

/**
 * buildRunGraph — 把拓扑（GraphSpec nodes/edges）与截断后的事件流投影为执行图：
 * - node.started → running；node.completed → done；node.failed → failed；
 *   interrupt.raised → awaiting-input；interrupt.resumed → running（续跑，
 *   按 interruptId 精确定位，折返仅作无 id 兜底）；
 * - iteration = 节点自身完成次数（服务端 superStep 是全局步时钟，不充当节点迭代数）；
 * - 边 taken：completed 的 goto / error-routed 的 target 命中 `from->to`；
 * - run.completed 后从未启动的节点 → skipped；
 * - 未知 nodeId（legacy 桥接的 reason 等）不产生幽灵节点。
 * 纯函数：返回新对象，不改入参。
 */
export function buildRunGraph(topology: RunGraphTopologyLike, events: readonly ReplayEventLike[]): RunGraphData {
  const nodeIds = new Set(topology.nodes.map(n => n.id))

  // 投影工作台（按拓扑序输出）
  const status = new Map<string, RunNodeStatus>(topology.nodes.map(n => [n.id, 'idle' as RunNodeStatus]))
  const iteration = new Map<string, number>(topology.nodes.map(n => [n.id, 0]))
  const duration = new Map<string, number>(topology.nodes.map(n => [n.id, 0]))
  const openSince = new Map<string, number>() // started 未闭合区间的起点
  const taken = new Set<string>()
  // 挂起中断定位：interruptId → nodeId 映射（并发多 interrupt 精确折返），
  // awaitingNode 仅作无 interruptId 事件兜底
  const interruptNodeById = new Map<string, string>()
  let awaitingNode: string | null = null

  // 窗口内最后事件时刻：running 节点的未闭合区间按它收口（确定性，不取 Date.now()）
  let windowEnd = 0
  for (const e of events) {
    const t = eventTsMs(e)
    if (t > windowEnd) windowEnd = t
  }

  const closeOpen = (id: string, endTs: number): void => {
    const open = openSince.get(id)
    if (open === undefined) return
    duration.set(id, (duration.get(id) ?? 0) + Math.max(0, endTs - open))
    openSince.delete(id)
  }

  for (const e of events) {
    const kind = canonicalEventType(e)
    const nodeId = typeof e.nodeId === 'string' ? e.nodeId : undefined
    const ts = eventTsMs(e)

    // 路由事实先行：completed 的 goto / error-routed 的 target（不需要 nodeId 合法也可安全跳过）
    if (kind === 'completed' && nodeId && nodeIds.has(nodeId)) {
      for (const target of gotoOf(e)) {
        if (nodeIds.has(target)) taken.add(`${nodeId}->${target}`)
      }
    }
    if (kind === 'error-routed' && nodeId && nodeIds.has(nodeId)) {
      // 双词汇读取：日志 payload.target / socket 事件顶层 target
      const target = e.payload?.target ?? e.target
      if (typeof target === 'string' && nodeIds.has(target)) taken.add(`${nodeId}->${target}`)
    }

    // interrupt 双事件在 nodeId 守卫之前消费：resume 事件常不带 nodeId，
    // 且并发多 interrupt 下须按 interruptId 精确定位（仅按挂起序折返会投影反转）
    if (kind === 'interrupted' || kind === 'resumed') {
      const rawId = e.interruptId ?? e.payload?.interruptId
      const interruptId = typeof rawId === 'string' && rawId ? rawId : undefined
      if (kind === 'interrupted') {
        if (nodeId && nodeIds.has(nodeId)) {
          status.set(nodeId, 'awaiting-input')
          awaitingNode = nodeId
          if (interruptId) interruptNodeById.set(interruptId, nodeId)
          closeOpen(nodeId, ts) // 挂起时段不计入执行时长（B-1：interrupt 即闭合区间）
        }
      } else {
        // resumed 定位：interruptId → 自身 nodeId → 最后挂起节点兜底
        // （显式标注：与 awaitingNode 的回写比较会让控制流推断成环，TS7022）
        const target: string | null | undefined = (interruptId && interruptNodeById.get(interruptId))
          ?? (nodeId && nodeIds.has(nodeId) ? nodeId : undefined)
          ?? awaitingNode
        if (target) {
          status.set(target, 'running')
          if (!openSince.has(target)) openSince.set(target, ts) // 挂起时段不计入执行时长
          if (interruptId) interruptNodeById.delete(interruptId)
        }
        if (target && target === awaitingNode) awaitingNode = null
      }
      continue
    }

    if (!nodeId || !nodeIds.has(nodeId)) continue // 未知 nodeId 不产生幽灵节点

    switch (kind) {
      case 'started':
        status.set(nodeId, 'running')
        closeOpen(nodeId, ts) // 上一轮区间闭合（异常序列兜底）
        openSince.set(nodeId, ts)
        break
      case 'completed':
        // 迭代徽标语义 = 节点自身完成次数（服务端 superStep 是全局步时钟，
        // 不能当节点迭代数——否则每个节点首次完成就带徽标）
        status.set(nodeId, 'done')
        iteration.set(nodeId, (iteration.get(nodeId) ?? 0) + 1)
        closeOpen(nodeId, ts)
        break
      case 'failed':
        status.set(nodeId, 'failed')
        closeOpen(nodeId, ts)
        break
      default:
        break // run.* / checkpoint / cost 等不改节点状态
    }
  }

  // 收口仍在跑的区间（running 节点 duration = 到窗口末尾的已耗时）
  for (const [id, open] of openSince) {
    duration.set(id, (duration.get(id) ?? 0) + Math.max(0, windowEnd - open))
  }

  // run.completed：从未启动的节点 → skipped（awaiting-input/running 保持，不虚构终态）
  for (const e of events) {
    if (canonicalEventType(e) !== 'run-completed') continue
    for (const n of topology.nodes) {
      if (status.get(n.id) === 'idle') status.set(n.id, 'skipped')
    }
    break // 一个终态事件足以判定，不重复扫
  }

  return {
    nodes: topology.nodes.map(n => ({
      id: n.id,
      label: (typeof n.config?.label === 'string' && n.config.label) || n.id,
      type: n.type,
      status: status.get(n.id) ?? 'idle',
      iteration: iteration.get(n.id) ?? 0,
      durationMs: duration.get(n.id) ?? 0,
    })),
    edges: topology.edges.map(e => ({
      id: `${e.from}->${e.to}`,
      from: e.from,
      to: e.to,
      taken: taken.has(`${e.from}->${e.to}`),
      ...(e.guard?.maxIterations !== undefined ? { guard: e.guard.maxIterations } : {}),
    })),
  }
}

// ---------------------------------------------------------------------------
// layoutRunGraph — 手写分层布局（固定六节点小图：discovery→…→stop-check 列布局）
// ---------------------------------------------------------------------------

/**
 * layoutRunGraph — 最长路径分层（列 = x），同列按拓扑序排行（y）。
 * 回边（DFS 祖先判定）不参与分层——repair 回边不把 handoff 拉到 persistence 之后；
 * entryNode 缺省取首个零入边节点，再缺省取首节点。返回 id → { x, y }。
 */
export function layoutRunGraph(
  graph: RunGraphData,
  entryNode?: string,
): Map<string, { x: number; y: number }> {
  const ids = graph.nodes.map(n => n.id)
  const idSet = new Set(ids)
  const COL_STEP = 200
  const ROW_STEP = 96

  // 回边判定：DFS 中 target 在栈上（含自环）
  const adj = new Map<string, string[]>()
  for (const e of graph.edges) {
    if (!idSet.has(e.from) || !idSet.has(e.to)) continue
    adj.set(e.from, [...(adj.get(e.from) ?? []), e.to])
  }
  const backEdges = new Set<string>()
  const visited = new Set<string>()
  const onStack = new Set<string>()
  const dfs = (u: string): void => {
    visited.add(u)
    onStack.add(u)
    for (const v of adj.get(u) ?? []) {
      if (onStack.has(v)) backEdges.add(`${u}->${v}`)
      else if (!visited.has(v)) dfs(v)
    }
    onStack.delete(u)
  }
  for (const id of ids) if (!visited.has(id)) dfs(id)

  // 入度（仅前向边）→ Kahn 最长路径分层
  const col = new Map<string, number>(ids.map(id => [id, 0]))
  const indeg = new Map<string, number>(ids.map(id => [id, 0]))
  const forward: Array<{ from: string; to: string }> = []
  for (const e of graph.edges) {
    if (!idSet.has(e.from) || !idSet.has(e.to)) continue
    if (backEdges.has(`${e.from}->${e.to}`)) continue
    forward.push({ from: e.from, to: e.to })
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
  }
  const queue = ids.filter(id => (indeg.get(id) ?? 0) === 0)
  const order: string[] = []
  while (queue.length > 0) {
    const u = queue.shift()!
    order.push(u)
    for (const { from, to } of forward) {
      if (from !== u) continue
      col.set(to, Math.max(col.get(to) ?? 0, (col.get(u) ?? 0) + 1))
      indeg.set(to, (indeg.get(to) ?? 1) - 1)
      if ((indeg.get(to) ?? 0) === 0) queue.push(to)
    }
  }
  // 环残留（理论上回边已剔除，兜底）：按原序追加，保证全覆盖
  for (const id of ids) if (!order.includes(id)) order.push(id)

  // entry 前置校验（仅语义入口，布局仍以上述拓扑分层为准）
  const entry = entryNode && idSet.has(entryNode)
    ? entryNode
    : ids.find(id => !graph.edges.some(e => e.to === id && idSet.has(e.from))) ?? ids[0]
  if (entry && (col.get(entry) ?? 0) !== 0) col.set(entry, 0)

  // 同列按节点输入序排行；台账 #24（大图性能/形态）：单列 fan-out 数百行会把画布
  // 拉成超长条——超过 ROWS_PER_SUBCOL 行折入下一子列（x 右移），纵横比可控。
  const ROWS_PER_SUBCOL = 8
  const colRows = new Map<number, string[]>()
  for (const id of order) {
    const c = col.get(id) ?? 0
    colRows.set(c, [...(colRows.get(c) ?? []), id])
  }
  // 各列子列数 → 累计 x 基线（折行子列右移后不再侵占后继拓扑列的 x 区间）
  const xBase = new Map<number, number>()
  let xAcc = 0
  for (const c of [...colRows.keys()].sort((a, b) => a - b)) {
    xBase.set(c, xAcc)
    xAcc += Math.ceil((colRows.get(c)!.length) / ROWS_PER_SUBCOL)
  }
  const pos = new Map<string, { x: number; y: number }>()
  for (const [c, rowIds] of colRows) {
    for (const [row, id] of rowIds.entries()) {
      const sub = Math.floor(row / ROWS_PER_SUBCOL)
      pos.set(id, { x: (xBase.get(c)! + sub) * COL_STEP, y: (row % ROWS_PER_SUBCOL) * ROW_STEP })
    }
  }
  return pos
}

// ---------------------------------------------------------------------------
// projectEvents — 三级分辨率（§7B.1：Summary / Normal / Verbose）
// ---------------------------------------------------------------------------

export type TimelineMode = 'summary' | 'normal' | 'verbose'

/** 时间轴行的级别：result ⊂ detail ⊂ raw，三级分辨率逐级放开 */
export type TimelineRowLevel = 'result' | 'detail' | 'raw'

export interface TimelineRow {
  /** 原事件下标（回放游标对齐用） */
  index: number
  ts: string | number
  /** 事件名原值（前端零翻译；UI 侧做显示名映射） */
  type: string
  nodeId?: string
  /** 节点中心事件的状态投影（completed→done / failed→failed / interrupted→awaiting-input / started·resumed→running） */
  status?: RunNodeStatus
  /** 路由事实 goto（Normal+） */
  goto?: string[]
  /** 错误事实（有则携带） */
  error?: string
  /** 全量 payload（Verbose 专属） */
  payload?: Record<string, unknown>
  level: TimelineRowLevel
}

/** 级别归属：节点级结果 / 节点与运行的事实明细 / 其余过程事件（checkpoint/cost/step…） */
const RESULT_KINDS = new Set(['completed', 'failed', 'interrupted'])
const DETAIL_KINDS = new Set([
  'started', 'resumed', 'error-routed', 'guard-exceeded', 'edge-break',
  'run-started', 'run-completed', 'run-failed',
])

/** 节点中心事件的状态投影（供结果行与 started 行显示） */
const STATUS_BY_KIND: Partial<Record<string, RunNodeStatus>> = {
  completed: 'done',
  failed: 'failed',
  interrupted: 'awaiting-input',
  started: 'running',
  resumed: 'running',
}

/**
 * projectEvents — 同一事件数组的三种渲染投影（纯函数）：
 * - summary：只显示节点级结果行（completed/failed/interrupt）；
 * - normal：+ 节点 started/resumed + 路由事实（goto）+ run 生命周期；
 * - verbose：全事件一比一，携带 payload JSON。
 * 未知 mode 收敛为 normal（明细但不噪音）。
 */
export function projectEvents(events: readonly ReplayEventLike[], mode: TimelineMode): TimelineRow[] {
  const effective: TimelineMode = mode === 'summary' || mode === 'verbose' ? mode : 'normal'

  const rows: TimelineRow[] = []
  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    const kind = canonicalEventType(e)
    const level: TimelineRowLevel = RESULT_KINDS.has(kind)
      ? 'result'
      : DETAIL_KINDS.has(kind) ? 'detail' : 'raw'

    if (effective === 'summary' && level !== 'result') continue
    if (effective === 'normal' && level === 'raw') continue

    rows.push({
      index: i,
      ts: e.ts,
      type: e.kind ?? e.type ?? '',
      ...(typeof e.nodeId === 'string' ? { nodeId: e.nodeId } : {}),
      ...(STATUS_BY_KIND[kind] ? { status: STATUS_BY_KIND[kind] } : {}),
      // goto 路由事实：summary 不带，normal/verbose 带
      ...(effective !== 'summary' && gotoOf(e).length > 0 ? { goto: gotoOf(e) } : {}),
      ...(errorOf(e) ? { error: errorOf(e) } : {}),
      // payload 仅 verbose
      ...(effective === 'verbose' && e.payload ? { payload: e.payload } : {}),
      level,
    })
  }
  return rows
}

// ---------------------------------------------------------------------------
// 展示辅助
// ---------------------------------------------------------------------------

/** formatEventTs — 时间轴时间标签：epoch ms / ISO 字符串 → HH:MM:SS；非法落 — */
export function formatEventTs(ts: string | number | undefined | null): string {
  if (ts === undefined || ts === null || ts === '') return '—'
  const t = typeof ts === 'number' ? ts : Date.parse(ts)
  if (!Number.isFinite(t)) return '—'
  const d = new Date(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
