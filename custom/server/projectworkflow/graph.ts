// custom/server/projectworkflow/graph.ts
// 项目 workflow 拓扑契约（2026-11-04 AgentTeams 吸收批三，spec
// 2026-11-04-agentteams-project-graph.md）。
//
// 对标锚：AgentTeams buildWorkflow（agentteams-controller/internal/server/
// project_handler.go:761-860）——LangGraph 对齐的 {nodes, edges, next,
// interrupts} 四元投影 + paused 作为 human interrupt + mermaid 导出。本模块
// 把同一语义投影到 kanban 任务库上：
//   nodes      项目全任务行（全状态，非终结也进图）{id,title,status,assignee,board}
//   edges      task_links 父子链 → {source: 父, target: 子}
//   next       就绪节点 = 自身 status ∈ {todo,ready} 且全部同板父链 done/archived
//   interrupts blocked 卡 / 项目 paused / review 待决 / 跨板链 / 环丢弃
//
// 表结构锚（vendor/hermes-agent/hermes_cli/kanban_db.py:880-884）：
//   task_links(parent_id, child_id)——父→子依赖边，库（板）内自洽；
//   tasks 状态九态（kanban_workflow.py DEFAULT_STATUSES：triage/todo/scheduled/
//   ready/running/blocked/review/done/archived）。
// 口径对齐：done/archived 是任务终态集（批一完成守卫同口径）；父链门控对齐
// kanban_db.py:2100 _parents_satisfied（JOIN tasks p 不筛 project——同板他项目
// 父也门控，但不进本图节点）。
//
// 只读纪律：与批一 project-tasks.ts 同款 readOnly 打开、fail-soft 单板跳过。
// 本模块不改动批一文件，连接面在本文件内复制同形实现（ReadOnlyDb 三方法）。
import { getProjectState, type ProjectStatus } from './state-store'
import { listBoardDbs } from './project-tasks'

type ReadOnlyDb = {
  prepare(sql: string): { all(...params: unknown[]): unknown[] }
  close(): void
}

/** 单板只读查询（project-tasks.ts queryBoard 同形复制；fail-soft 不抛）。 */
function queryBoard<T>(dbPath: string, sql: string, ...params: unknown[]): T[] | null {
  let db: ReadOnlyDb | null = null
  try {
    const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (p: string, o?: unknown) => ReadOnlyDb }
    db = new DatabaseSync(dbPath, { readOnly: true })
    return db.prepare(sql).all(...params) as T[]
  } catch {
    return null
  } finally {
    try { db?.close() } catch { /* 已关 */ }
  }
}

export interface GraphNode {
  id: string
  title: string
  status: string
  /** 归属看板（default / boards slug）；节点身份按 (board, id) 唯一。 */
  board: string
  assignee?: string
}

export interface GraphEdge {
  /** 父任务 id */
  source: string
  /** 子任务 id */
  target: string
}

export type InterruptKind =
  | 'blocked-card'
  | 'project-paused'
  | 'review-pending'
  | 'cross-board-link'
  | 'cycle-dropped'

export interface GraphInterrupt {
  /** 任务级=任务 id；边级（cross-board-link/cycle-dropped）=「父->子」；项目级=项目 id。 */
  id: string
  kind: InterruptKind
  reason: string
}

export interface ProjectTaskGraph {
  projectId: string
  projectStatus: ProjectStatus
  nodes: GraphNode[]
  edges: GraphEdge[]
  next: string[]
  interrupts: GraphInterrupt[]
}

/** 任务终态集（done/archived；批一完成守卫同口径）。 */
const TERMINAL_TASK_STATUSES = new Set(['done', 'archived'])
/** 就绪候选态：dispatch 实际会派的 lane（spec 决策 D3，triage 是待分解态不算）。 */
const NEXT_ELIGIBLE_STATUSES = new Set(['todo', 'ready'])

interface TaskRow {
  id: unknown
  title: unknown
  status: unknown
  assignee?: unknown
  block_kind?: unknown
}

/** 链行：child 是本板本项目任务；parent 行同板 LEFT JOIN（缺失=dangling/跨板）。 */
interface LinkRow {
  parent_id: unknown
  child_id: unknown
  parent_status?: unknown
  parent_project_id?: unknown
}

/** blocked 卡的最近一次 blocked 事件 free-text reason（task_events payload JSON）；
 *  表缺席/行缺失/坏 JSON → null（fail-soft，reason 面不猜数）。 */
function latestBlockedReason(dbPath: string, taskId: string): string | null {
  const rows = queryBoard<{ payload: unknown }>(
    dbPath,
    "SELECT payload FROM task_events WHERE task_id = ? AND kind = 'blocked' ORDER BY id DESC LIMIT 1",
    taskId,
  )
  if (!rows || rows.length === 0) return null
  try {
    const payload = JSON.parse(String(rows[0].payload ?? '')) as { reason?: unknown }
    const reason = payload?.reason
    return typeof reason === 'string' && reason.trim() ? reason.trim() : null
  } catch {
    return null
  }
}

/** blocked 卡可读 reason：typed block_kind（kanban_db.py:111 VALID_BLOCK_KINDS）
 *  + 最近 blocked 事件的 free-text reason，两者都缺席时只报状态。 */
function blockedReason(dbPath: string, node: GraphNode, blockKind: string | null): string {
  const eventReason = latestBlockedReason(dbPath, node.id)
  const kindPart = blockKind ? `kind=${blockKind}` : ''
  const reasonPart = eventReason ? `：${eventReason}` : ''
  return `任务阻塞${kindPart ? `（${kindPart}）` : ''}${reasonPart} [${node.board}/${node.id}]`
}

/** 板名 → 库路径索引（interrupts 阶段回查 blocked 事件用，避免重复枚举）。 */
function boardPathIndex(kanbanRoot: string): Map<string, string> {
  return new Map(listBoardDbs(kanbanRoot).map((b) => [b.board, b.path]))
}

/** 增量环检测：adjacency 上 t 是否已可达 s（是则加边 s→t 会成环）。 */
function reaches(adjacency: Map<string, Set<string>>, from: string, to: string): boolean {
  const seen = new Set<string>()
  const stack = [from]
  while (stack.length > 0) {
    const cur = stack.pop() as string
    if (cur === to) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const n of adjacency.get(cur) ?? []) stack.push(n)
  }
  return false
}

/**
 * 项目拓扑投影：全板只读扫该项目任务行 + task_links 父子链 + 状态文件 paused。
 * kanbanRoot 显式传入（测试/临时根），状态文件从同根合成 env 读取——两事实源同根。
 *
 * 链处理口径（如实映射，不猜）：
 * - 父行在本板存在（任意 project）：门控 next（对齐 _parents_satisfied 的 JOIN）；
 *   父同时也是本项目节点 → 建 edge（父→子），成环则丢弃并记 cycle-dropped。
 * - 父行不在本板但 id 是本项目其它板的节点：不建边、不门控，记 cross-board-link
 *   （task_links 板内才有效）。
 * - 父行任何板都不存在（dangling）：与上游 JOIN 口径一致静默忽略。
 */
export function projectTaskGraph(kanbanRoot: string, projectId: string): ProjectTaskGraph {
  // 状态文件与板库同根：把显式 kanbanRoot 注入 env 再走 state-store 读取面。
  const env: NodeJS.ProcessEnv = { ...process.env, HERMES_KANBAN_HOME: kanbanRoot }
  const projectState = getProjectState(projectId, env)

  const nodes: GraphNode[] = []
  const interrupts: GraphInterrupt[] = []
  // id → 板集合（跨板链判定用）；(board,id) → block_kind（blocked reason 用）
  const boardsOfId = new Map<string, Set<string>>()
  const blockKindByBoardId = new Map<string, string>()

  for (const { board, path } of listBoardDbs(kanbanRoot)) {
    const rows = queryBoard<TaskRow>(
      path,
      'SELECT id, title, status, assignee, block_kind FROM tasks WHERE project_id = ?',
      projectId,
    )
    if (!rows) continue
    for (const r of rows) {
      const node: GraphNode = {
        id: String(r.id),
        title: String(r.title ?? ''),
        status: String(r.status ?? ''),
        board,
        ...(typeof r.assignee === 'string' && r.assignee.trim() ? { assignee: r.assignee.trim() } : {}),
      }
      nodes.push(node)
      if (!boardsOfId.has(node.id)) boardsOfId.set(node.id, new Set())
      boardsOfId.get(node.id)?.add(board)
      if (typeof r.block_kind === 'string' && r.block_kind.trim()) {
        blockKindByBoardId.set(`${board}\u0000${node.id}`, r.block_kind.trim())
      }
    }
  }
  // 确定序：板名字典序、同板 id 字典序（mermaid T<序号> 与测试断言都依赖此序）。
  nodes.sort((a, b) => (a.board < b.board ? -1 : a.board > b.board ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  // 边构建（同板父→子；成环丢弃）+ 门控父收集（同板存在即门控，不限项目）。
  const edges: GraphEdge[] = []
  const edgeKeys = new Set<string>()
  const adjacency = new Map<string, Set<string>>()
  /** childId → 未终结门控父数（同板父 status ∉ {done,archived} 的条数）。 */
  const openParentCount = new Map<string, number>()
  /** 边级 interrupts（cross-board-link / cycle-dropped）：收集后按 id 排序定序。 */
  const edgeInterrupts: GraphInterrupt[] = []

  for (const { board, path } of listBoardDbs(kanbanRoot)) {
    // child 限定本项目（链的方向语义=父门控子）；parent 同板 LEFT JOIN 拿状态。
    const links = queryBoard<LinkRow>(
      path,
      `SELECT l.parent_id AS parent_id, l.child_id AS child_id,
              p.status AS parent_status, p.project_id AS parent_project_id
         FROM task_links l
         JOIN tasks c ON c.id = l.child_id
         LEFT JOIN tasks p ON p.id = l.parent_id
        WHERE c.project_id = ?`,
      projectId,
    )
    if (!links) continue
    for (const link of links) {
      const parentId = String(link.parent_id ?? '')
      const childId = String(link.child_id ?? '')
      if (!parentId || !childId) continue
      const parentOnThisBoard = link.parent_status !== null && link.parent_status !== undefined

      if (parentOnThisBoard) {
        // 同板父行存在：门控计数（对齐 _parents_satisfied：不筛父 project）。
        if (!TERMINAL_TASK_STATUSES.has(String(link.parent_status))) {
          openParentCount.set(childId, (openParentCount.get(childId) ?? 0) + 1)
        }
        // 父是本项目本板节点 → 建边（环防御：加边前查 child 是否已可达 parent）。
        const parentIsProjectNode = link.parent_project_id === projectId
          && boardsOfId.get(parentId)?.has(board) === true
        if (parentIsProjectNode) {
          const key = `${parentId}->${childId}`
          if (!edgeKeys.has(key) && !reaches(adjacency, childId, parentId)) {
            edgeKeys.add(key)
            edges.push({ source: parentId, target: childId })
            if (!adjacency.has(parentId)) adjacency.set(parentId, new Set())
            adjacency.get(parentId)?.add(childId)
          } else if (edgeKeys.has(key)) {
            // 同边重复出现（跨板同 id 同链）：不重复建边也不重复记 interrupt。
          } else {
            edgeInterrupts.push({
              id: key,
              kind: 'cycle-dropped',
              reason: `边 ${parentId} -> ${childId} 会构成环，已丢弃`,
            })
          }
        }
        // 同板他项目父：门控已计，不进节点不建边（内核 JOIN 同口径）。
      } else if (boardsOfId.has(parentId)) {
        // 父行不在本板、但 id 是本项目其它板节点 → 跨板链：如实不建边不门控。
        edgeInterrupts.push({
          id: `${parentId}->${childId}`,
          kind: 'cross-board-link',
          reason: `父任务 ${parentId} 在其它看板（task_links 板内有效），未建边：${board}/${childId}`,
        })
      }
      // 父任何板都不存在：dangling，随内核 JOIN 口径静默忽略。
    }
  }
  // 边与边级 interrupts 排序定序（SQLite 行序不保证，API 契约要确定）。
  edges.sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : a.target < b.target ? -1 : a.target > b.target ? 1 : 0))
  edgeInterrupts.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  // 任务级 interrupts：blocked / review 逐卡（节点确定序）；block_kind 在首轮
  // 任务扫描顺带收集，free-text reason 回本板库查最近 blocked 事件（量级=阻塞卡数）。
  const paths = boardPathIndex(kanbanRoot)
  for (const node of nodes) {
    if (node.status === 'blocked') {
      interrupts.push({
        id: node.id,
        kind: 'blocked-card',
        reason: blockedReason(paths.get(node.board) ?? '', node, blockKindByBoardId.get(`${node.board}\u0000${node.id}`) ?? null),
      })
    } else if (node.status === 'review') {
      interrupts.push({
        id: node.id,
        kind: 'review-pending',
        reason: `等待评审 [${node.board}/${node.id}] ${node.title}`,
      })
    }
  }

  // interrupts 组装序：任务级（blocked/review，节点序）→ 边级（跨板/环，id 序）→ 项目级。
  interrupts.push(...edgeInterrupts)

  // 项目级 interrupt：paused 收单一条（放末位：任务级事实在前）。
  if (projectState.status === 'paused') {
    interrupts.push({
      id: projectId,
      kind: 'project-paused',
      reason: `项目已暂停收单（pausedAt=${projectState.pausedAt ?? 'unknown'}），拓扑仅供观察`,
    })
  }

  const next = nodes
    .filter((n) => NEXT_ELIGIBLE_STATUSES.has(n.status) && (openParentCount.get(n.id) ?? 0) === 0)
    .map((n) => n.id)

  return {
    projectId,
    projectStatus: projectState.status,
    nodes,
    edges,
    next,
    interrupts,
  }
}

// --- specToMermaid：拓扑 → mermaid graph TD 源（纯函数） ---

/** mermaid label 转义：引号与方括号走 mermaid 实体码（#quot;/#91;/#93;），
 *  换行折叠为空格（label 单行）。 */
function mermaidEscapeLabel(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replaceAll('"', '#quot;')
    .replaceAll('[', '#91;')
    .replaceAll(']', '#93;')
}

/** status → class 名（done 绿/blocked 红/review 黄/running 蓝/其余灰）。 */
function statusClassOf(status: string): string {
  if (status === 'done') return 'st-done'
  if (status === 'blocked') return 'st-blocked'
  if (status === 'review') return 'st-review'
  if (status === 'running') return 'st-running'
  return 'st-other'
}

/** interrupt id → 关联节点 id 集（任务级=自身；边级「a->b」=两端；项目级=∅）。 */
function interruptNodeIds(interrupts: GraphInterrupt[], knownIds: Set<string>): Set<string> {
  const out = new Set<string>()
  for (const it of interrupts) {
    if (it.id.includes('->')) {
      for (const part of it.id.split('->')) {
        if (knownIds.has(part)) out.add(part)
      }
    } else if (knownIds.has(it.id)) {
      out.add(it.id)
    }
  }
  return out
}

/**
 * 拓扑 → mermaid `graph TD` 源（纯函数，无 IO）。
 * 形态：节点 `T<序号>["标题 @assignee"]`（序号=nodes 数组下标）；边 `T父 --> T子`；
 * classDef 五态着色 + next 高亮 + interrupt 虚线；空图也输出合法头与 classDef。
 * 消费面：?format=mermaid 端点 → /api/hermes/diagram/mermaid-brand（提取器对
 * classDef/class 指令按 STYLE_DIRECTIVES 跳过，不参与重绘，仅内容行生效）。
 */
export function specToMermaid(g: ProjectTaskGraph): string {
  const idToKey = new Map<string, string>()
  g.nodes.forEach((n, i) => { idToKey.set(n.id, `T${i}`) })

  const lines: string[] = ['graph TD']
  for (const n of g.nodes) {
    const label = mermaidEscapeLabel(n.assignee ? `${n.title} @${n.assignee}` : n.title)
    lines.push(`  ${idToKey.get(n.id)}["${label}"]`)
  }
  for (const e of g.edges) {
    const s = idToKey.get(e.source)
    const t = idToKey.get(e.target)
    if (s !== undefined && t !== undefined) lines.push(`  ${s} --> ${t}`)
  }

  lines.push('  classDef st-done fill:#c8e6c9,stroke:#2e7d32')
  lines.push('  classDef st-blocked fill:#ffcdd2,stroke:#c62828')
  lines.push('  classDef st-review fill:#fff9c4,stroke:#f9a825')
  lines.push('  classDef st-running fill:#bbdefb,stroke:#1565c0')
  lines.push('  classDef st-other fill:#eceff1,stroke:#90a4ae')
  lines.push('  classDef next stroke:#1565c0,stroke-width:3px')
  lines.push('  classDef interrupt stroke-dasharray:5 5')

  // class 归组（同组一条 class 语句，确定序）；节点可同时挂状态类+next/interrupt。
  const nextIds = new Set(g.next)
  const interruptIds = interruptNodeIds(g.interrupts, new Set(g.nodes.map((n) => n.id)))
  const byClass = new Map<string, string[]>()
  for (const n of g.nodes) {
    const key = idToKey.get(n.id) as string
    const classes = [statusClassOf(n.status)]
    if (nextIds.has(n.id)) classes.push('next')
    if (interruptIds.has(n.id)) classes.push('interrupt')
    const cls = classes.join(',')
    if (!byClass.has(cls)) byClass.set(cls, [])
    byClass.get(cls)?.push(key)
  }
  for (const [cls, keys] of [...byClass.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    lines.push(`  class ${keys.join(',')} ${cls}`)
  }
  return lines.join('\n')
}
