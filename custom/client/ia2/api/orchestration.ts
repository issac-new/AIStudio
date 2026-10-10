// overlay/custom/client/ia2/api/orchestration.ts
// 任务协同图（Orchestration Chart）数据面（2026-10-10 麦肯锡概念一轮）。
// 以「一项业务结果如何由人、Agent 与控制点协同完成」为锚组织看板数据：
//   - 纯函数层（分类/根卡推导/树构建/五问推导/分层布局）= 守门测试锚点；
//   - fetch 层只做三个既有 REST 的组合（autonomy-ladder / escalation pending /
//     graph specs），任务面复用 workspace store 的全板列表（list JSON 自
//     2026-10-10 起携带 parents/children/estimate_days——runtime 部署件）。
// 口径诚实项：人/Agent 判定用 `-agent` 后缀约定（服务端不读 agent-roster.yaml），
// 非该命名的 agent 会归入「人」桶——面板明示口径，不假装权威。

import { authFetch } from '../../ide/utils/auth-fetch'

// ── 类型（raw list JSON 的最小子集；多余字段透传不裁剪）──

export interface OrchTaskRaw {
  id: string
  title: string
  status: string
  assignee: string | null
  raci?: { responsible?: string; approver?: string; consulted?: string[]; informed?: string[] } | null
  estimate_days?: number | null
  estimate_meta?: Record<string, unknown> | null
  created_at?: number
  parents?: string[]
  children?: string[]
}

export interface AutonomyEntry {
  target: string
  level: 'insight' | 'assist' | 'auto'
  approvalPoints: string[]
  maxRiskTier: 'low' | 'medium' | 'high'
  updatedAt?: number | string
  note?: string
}

export interface EscalationRecord {
  escalationId: string
  fromAgent: string
  urgency: 'low' | 'normal' | 'urgent' | 'critical' | string
  reason: string
  taskId?: string | null
  state: 'pending' | 'approved' | 'denied' | string
  at?: number | string
}

export interface StoredSpecSummary {
  id: string
  version: number
  updatedAt?: string
  spec: { id: string; description?: string; meta?: { goal?: string }; origin?: string }
}

// ── 纯函数：分类与推导 ──

export type ExecutorClass = 'human' | 'agent' | 'unassigned'

/** 执行者分类：`-agent` 后缀约定（provisionMatrixAccount 建号口径）。 */
export function classifyExecutor(assignee: string | null | undefined): ExecutorClass {
  if (!assignee) return 'unassigned'
  return assignee.endsWith('-agent') ? 'agent' : 'human'
}

/** 控制点判定：RACI 审批人 / review 状态 / 该执行者自主度阶梯挂审批点。 */
export function controlPointReasons(
  task: OrchTaskRaw,
  ladderByTarget: Map<string, AutonomyEntry>,
): string[] {
  const reasons: string[] = []
  const approver = task.raci?.approver
  if (approver) reasons.push(`RACI 审批人：${approver}`)
  if (task.status === 'review') reasons.push('处于 review 状态，待人复核')
  const entry = task.assignee ? ladderByTarget.get(task.assignee) : undefined
  if (entry && entry.approvalPoints.length > 0) {
    reasons.push(`自主度 ${entry.level}，审批点 ${entry.approvalPoints.length} 处`)
  }
  return reasons
}

export interface MissionRoot {
  taskId: string
  title: string
  status: string
  childCount: number
  /** 树内任务总数（含根） */
  treeSize: number
}

/**
 * 根卡（=一个业务结果的锚点）推导：无 parents 且有 children 的卡。
 * 兜底排序：树大在前（协同图以有分化的任务链为主角），同尺寸按创建时间新在前。
 */
export function deriveMissionRoots(tasks: OrchTaskRaw[]): MissionRoot[] {
  const byId = new Map(tasks.map(t => [t.id, t]))
  const sizes = new Map<string, number>()
  function treeSize(id: string, seen: Set<string>): number {
    if (seen.has(id)) return 0
    seen.add(id)
    let n = 1
    for (const c of byId.get(id)?.children ?? []) n += treeSize(c, seen)
    return n
  }
  const roots: MissionRoot[] = []
  for (const t of tasks) {
    const parents = t.parents ?? []
    const children = t.children ?? []
    if (parents.length > 0 || children.length === 0) continue
    if (!sizes.has(t.id)) sizes.set(t.id, treeSize(t.id, new Set()))
    roots.push({
      taskId: t.id,
      title: t.title,
      status: t.status,
      childCount: children.length,
      treeSize: sizes.get(t.id) ?? 1,
    })
  }
  roots.sort((a, b) => b.treeSize - a.treeSize || (b.taskId > a.taskId ? -1 : 1))
  return roots
}

export interface MissionNode {
  taskId: string
  title: string
  status: string
  assignee: string | null
  executor: ExecutorClass
  estimateDays: number | null
  controlReasons: string[]
}

export interface MissionEdge {
  from: string
  to: string
}

/** 以 root 为锚的全树（parents/children 双向 BFS，防环，悬空引用跳过）。
 *  邻接取双源并集：children 数组与 parents 数组都可能是事实源（task_links
 *  同一行两侧派生、理论对称；历史数据/异构写入可能单侧缺失——并集防御）。 */
export function buildMissionTree(
  rootId: string,
  tasks: OrchTaskRaw[],
  ladderByTarget: Map<string, AutonomyEntry>,
): { nodes: MissionNode[]; edges: MissionEdge[] } {
  const byId = new Map(tasks.map(t => [t.id, t]))
  const childIdsOf = new Map<string, Set<string>>()
  const parentIdsOf = new Map<string, Set<string>>()
  const ensure = (m: Map<string, Set<string>>, id: string): Set<string> => {
    let s = m.get(id)
    if (!s) { s = new Set(); m.set(id, s) }
    return s
  }
  const addLink = (p: string, c: string): void => {
    if (p === c || !byId.has(p) || !byId.has(c)) return
    ensure(childIdsOf, p).add(c)
    ensure(parentIdsOf, c).add(p)
  }
  for (const t of tasks) {
    ensure(childIdsOf, t.id)
    ensure(parentIdsOf, t.id)
    for (const c of t.children ?? []) addLink(t.id, c)
    for (const p of t.parents ?? []) addLink(p, t.id)
  }
  const visited = new Set<string>([rootId])
  const queue = [rootId]
  const edges: MissionEdge[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const c of childIdsOf.get(id) ?? []) {
      edges.push({ from: id, to: c })
      if (!visited.has(c)) { visited.add(c); queue.push(c) }
    }
    for (const p of parentIdsOf.get(id) ?? []) {
      edges.push({ from: p, to: id })
      if (!visited.has(p)) { visited.add(p); queue.push(p) }
    }
  }
  const nodes: MissionNode[] = [...visited]
    .map(id => byId.get(id)!)
    .filter(Boolean)
    .map(t => ({
      taskId: t.id,
      title: t.title,
      status: t.status,
      assignee: t.assignee,
      executor: classifyExecutor(t.assignee),
      estimateDays: t.estimate_days ?? null,
      controlReasons: controlPointReasons(t, ladderByTarget),
    }))
  return { nodes, edges }
}

export interface FiveQuestions {
  outcome: {
    rootId: string
    title: string
    owner: string
    approver: string | null
    status: string
    taskCount: number
  }
  division: {
    human: number
    agent: number
    unassigned: number
    humanDays: number
    agentDays: number
    /** 估算覆盖率：有 estimate_days 的卡 / 全部卡（诚实口径：decompose 链路才有估算） */
    coverage: number
  }
  checkpoints: Array<{ taskId: string; title: string; assignee: string | null; reasons: string[] }>
  escalation: {
    pendingTotal: number
    linkedToMission: number
    examples: Array<{ fromAgent: string; urgency: string; reason: string }>
  }
  assets: { specs: Array<{ id: string; goal: string }>; factoryNote: string }
}

/** 麦肯锡五问面板推导（纯函数）：结果责任/人机分工/确认点/异常升级/可复用资产。 */
export function deriveFiveQuestions(
  tree: { nodes: MissionNode[]; edges: MissionEdge[] },
  root: { id: string; title: string; status: string; owner: string; approver: string | null },
  escalations: EscalationRecord[],
  specs: StoredSpecSummary[],
): FiveQuestions {
  const { nodes } = tree
  const est = (cls: ExecutorClass) =>
    nodes.filter(n => n.executor === cls).reduce((s, n) => s + (n.estimateDays ?? 0), 0)
  const missionIds = new Set(nodes.map(n => n.taskId))
  const pending = escalations.filter(e => e.state === 'pending')
  const linked = pending.filter(e => e.taskId && missionIds.has(e.taskId))
  return {
    outcome: {
      rootId: root.id,
      title: root.title,
      owner: root.owner,
      approver: root.approver,
      status: root.status,
      taskCount: nodes.length,
    },
    division: {
      human: nodes.filter(n => n.executor === 'human').length,
      agent: nodes.filter(n => n.executor === 'agent').length,
      unassigned: nodes.filter(n => n.executor === 'unassigned').length,
      humanDays: round1(est('human')),
      agentDays: round1(est('agent')),
      coverage: nodes.length === 0 ? 0 : nodes.filter(n => n.estimateDays != null).length / nodes.length,
    },
    checkpoints: nodes
      .filter(n => n.controlReasons.length > 0)
      .map(n => ({ taskId: n.taskId, title: n.title, assignee: n.assignee, reasons: n.controlReasons })),
    escalation: {
      pendingTotal: pending.length,
      linkedToMission: linked.length,
      examples: linked.slice(0, 3).map(e => ({ fromAgent: e.fromAgent, urgency: e.urgency, reason: e.reason })),
    },
    assets: {
      specs: specs
        .filter(s => s.spec?.origin === 'template' || s.spec?.origin === 'factory')
        .slice(0, 8)
        .map(s => ({ id: s.id, goal: s.spec?.meta?.goal ?? s.spec?.description ?? '' })),
      // 任务工厂（run→模板沉淀）未上线前的诚实占位；Phase 2 落地后接 factory 台账
      factoryNote: '任务工厂模板沉淀待启用（Phase 2）；当前列运行图中已登记的可复用图规格。',
    },
  }
}

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

// ── 纯函数：分层布局（任务协同图专用，简单分层即可：根在上，逐层下探）──

export const ORCH_NODE_W = 190
export const ORCH_NODE_H = 64
const LAYER_GAP_Y = 130
const COL_GAP_X = 60

export function layoutMissionDag(
  rootId: string,
  edges: MissionEdge[],
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>()
  const childrenOf = new Map<string, string[]>()
  const indeg = new Map<string, number>()
  const touch = (id: string) => {
    if (!childrenOf.has(id)) childrenOf.set(id, [])
    if (!indeg.has(id)) indeg.set(id, 0)
  }
  for (const e of edges) {
    touch(e.from); touch(e.to)
    childrenOf.get(e.from)!.push(e.to)
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
  }
  touch(rootId)
  // BFS 分层：入度 0 为第 0 层（无入边兜底锚定 root）
  let layer = [...new Set([...indeg.entries()].filter(([, d]) => d === 0).map(([id]) => id))]
  if (layer.length === 0) layer = [rootId]
  let depth = 0
  const seen = new Set<string>()
  while (layer.length > 0 && depth < 30) {
    const uniq = layer.filter(id => !seen.has(id))
    uniq.forEach(id => seen.add(id))
    const w = uniq.length * (ORCH_NODE_W + COL_GAP_X) - COL_GAP_X
    uniq.forEach((id, i) => {
      pos.set(id, { x: (i * (ORCH_NODE_W + COL_GAP_X)) - w / 2 + ORCH_NODE_W / 2, y: depth * LAYER_GAP_Y })
    })
    const next: string[] = []
    for (const id of uniq) {
      for (const c of childrenOf.get(id) ?? []) {
        const d = (indeg.get(c) ?? 1) - 1
        indeg.set(c, d)
        if (d <= 0) next.push(c)
      }
    }
    layer = next
    depth++
  }
  // 环/残留兜底：未布点节点按发现序铺在最后一层下方
  for (const id of childrenOf.keys()) {
    if (!pos.has(id)) pos.set(id, { x: 0, y: depth * LAYER_GAP_Y })
  }
  return pos
}

// ── fetch 层（既有 REST 组合，失败转 null 诚实空态）──

export async function fetchAutonomyLadder(): Promise<AutonomyEntry[] | null> {
  try {
    const res = await authFetch('/api/hermes/autonomy-ladder')
    if (!res.ok) return null
    const data = (await res.json()) as { ok?: boolean; entries?: AutonomyEntry[] }
    return data.ok ? (data.entries ?? []) : null
  } catch {
    return null
  }
}

export async function fetchPendingEscalations(): Promise<EscalationRecord[] | null> {
  try {
    const res = await authFetch('/api/escalation/pending')
    if (!res.ok) return null
    const data = (await res.json()) as { ok?: boolean; pending?: EscalationRecord[] }
    return data.ok ? (data.pending ?? []) : null
  } catch {
    return null
  }
}

export async function fetchGraphSpecs(): Promise<StoredSpecSummary[] | null> {
  try {
    const res = await authFetch('/api/graph/specs')
    if (!res.ok) return null
    const data = (await res.json()) as { specs?: StoredSpecSummary[] }
    return data.specs ?? null
  } catch {
    return null
  }
}
