import type { RouteLocationRaw } from 'vue-router'
import type { CockpitTask } from './task-adapter'
import { parseTenant } from './collab-adapter'

export type GraphNodeRelation = 'center' | 'ancestor' | 'descendant' | 'person' | 'channel' | 'folded'

export interface GraphNode {
  id: string
  taskId: string
  label: string
  kind: GraphNodeRelation
  focus: boolean
  /** 层级深度：center=0，祖先为负（-1 父、-2 爷爷），后代为正（1 子、2 孙子） */
  depth: number
  target?: {
    taskId?: string
    routeTarget?: RouteLocationRaw
  }
}

export interface GraphRelation {
  id: string
  from: string
  to: string
}

export interface TopologyResult {
  nodes: GraphNode[]
  relations: GraphRelation[]
}

export const MAX_NODES = 16
/** 最大向上/向下递归深度（避免无限链路） */
export const MAX_DEPTH = 3

/** task_links 映射：taskId → { parents, children } */
export interface TaskLinksMap {
  [taskId: string]: { parents: string[]; children: string[] }
}

export function buildTopology(
  task: CockpitTask | null,
  linksMap: TaskLinksMap | null | undefined,
  allTasks: CockpitTask[],
  currentUser?: string,
): TopologyResult {
  const nodes: GraphNode[] = []
  const relations: GraphRelation[] = []
  if (!task) return { nodes, relations }

  // center
  const centerId = 'g-center'
  nodes.push({
    id: centerId, taskId: task.id, label: task.title,
    kind: 'center', focus: true, depth: 0,
  })

  // BFS 向上（祖先）和向下（后代），记录每个 taskId 的深度
  const depthMap = new Map<string, number>()  // taskId → depth（负=祖先，正=后代）
  depthMap.set(task.id, 0)

  // 向上递归：parent → grandparent
  const queueUp: Array<{ id: string; depth: number }> = []
  const directParents = linksMap?.[task.id]?.parents ?? []
  for (const p of directParents) {
    if (!depthMap.has(p)) {
      depthMap.set(p, -1)
      queueUp.push({ id: p, depth: -1 })
    }
  }
  while (queueUp.length) {
    const { id, depth } = queueUp.shift()!
    if (-depth >= MAX_DEPTH) continue
    const parents = linksMap?.[id]?.parents ?? []
    for (const p of parents) {
      if (!depthMap.has(p)) {
        const d = depth - 1
        depthMap.set(p, d)
        queueUp.push({ id: p, depth: d })
      }
    }
  }

  // 向下递归：child → grandchild
  const queueDown: Array<{ id: string; depth: number }> = []
  const directChildren = linksMap?.[task.id]?.children ?? []
  for (const c of directChildren) {
    if (!depthMap.has(c)) {
      depthMap.set(c, 1)
      queueDown.push({ id: c, depth: 1 })
    }
  }
  while (queueDown.length) {
    const { id, depth } = queueDown.shift()!
    if (depth >= MAX_DEPTH) continue
    const children = linksMap?.[id]?.children ?? []
    for (const c of children) {
      if (!depthMap.has(c)) {
        const d = depth + 1
        depthMap.set(c, d)
        queueDown.push({ id: c, depth: d })
      }
    }
  }

  // 按深度分组（同深度同一水平层）
  const byDepth = new Map<number, string[]>()
  for (const [tid, d] of depthMap) {
    if (d === 0) continue  // center 已加
    if (!byDepth.has(d)) byDepth.set(d, [])
    byDepth.get(d)!.push(tid)
  }

  // 为每个任务节点生成 GraphNode
  const addTaskNode = (tid: string, depth: number) => {
    const sibling = allTasks.find(t => t.id === tid)
    const kind: GraphNodeRelation = depth < 0 ? 'ancestor' : 'descendant'
    nodes.push({
      id: `g-${kind}-${tid}`, taskId: tid,
      label: sibling?.title ?? tid, kind, focus: false, depth,
      target: { taskId: tid },
    })
  }
  for (const [d, tids] of byDepth) {
    for (const tid of tids) addTaskNode(tid, d)
  }

  // persons (dedup)
  const persons = new Set<string>()
  if (task.assignee && task.assignee !== '未分配') persons.add(task.assignee)
  if (currentUser) persons.add(currentUser)
  for (const p of persons) {
    nodes.push({ id: `g-person-${p}`, taskId: task.id, label: p, kind: 'person', focus: false, depth: 0 })
  }

  // channel from tenant
  const parsed = parseTenant(task.tenant)
  if (parsed && parsed.kind !== 'plain') {
    nodes.push({
      id: `g-channel-${task.id}`, taskId: task.id,
      label: parsed.label, kind: 'channel', focus: false, depth: 0,
      target: { routeTarget: parsed.routeTarget },
    })
  }

  // 折叠：超过 MAX_NODES 时裁剪
  if (nodes.length > MAX_NODES) {
    const overflow = nodes.length - MAX_NODES
    const kept = nodes.slice(0, MAX_NODES)
    kept.push({
      id: 'g-folded', taskId: task.id,
      label: `+${overflow} 更多`, kind: 'folded', focus: false, depth: 0,
    })
    nodes.splice(0, nodes.length, ...kept)
  }

  // relations: 相邻深度间连线（parent→child 链路）
  // 对每个非 center 任务节点，连到其深度 d-1（祖先方向）或 d+1（后代方向）的最近祖先/后代
  // 简化：用 linksMap 建立真实 task_links 连线
  const nodeByTaskId = new Map<string, GraphNode>()
  for (const n of nodes) {
    if (n.kind === 'ancestor' || n.kind === 'descendant') {
      nodeByTaskId.set(n.taskId, n)
    }
  }
  for (const [tid, links] of Object.entries(linksMap ?? {})) {
    for (const p of links.parents) {
      const childNode = nodeByTaskId.get(tid)
      const parentNode = nodeByTaskId.get(p)
      // 父子都在图中：连 parent→child（也可连 center）
      if (parentNode && childNode) {
        relations.push({ id: `rel-${parentNode.id}-${childNode.id}`, from: parentNode.id, to: childNode.id })
      } else if (parentNode && tid === task.id) {
        // center 的父节点：连 parent→center
        relations.push({ id: `rel-${parentNode.id}-${centerId}`, from: parentNode.id, to: centerId })
      }
    }
    for (const c of links.children) {
      const parentNode = nodeByTaskId.get(tid)
      const childNode = nodeByTaskId.get(c)
      if (parentNode && childNode) {
        relations.push({ id: `rel-${parentNode.id}-${childNode.id}`, from: parentNode.id, to: childNode.id })
      } else if (childNode && tid === task.id) {
        // center 的子节点：连 center→child
        relations.push({ id: `rel-${centerId}-${childNode.id}`, from: centerId, to: childNode.id })
      }
    }
  }
  // center 与直接父/子的连线（确保 center 连接到第一层祖先/后代）
  for (const n of nodes) {
    if (n.kind === 'ancestor' && n.depth === -1) {
      if (!relations.some(r => r.to === centerId && r.from === n.id)) {
        relations.push({ id: `rel-${n.id}-${centerId}`, from: n.id, to: centerId })
      }
    }
    if (n.kind === 'descendant' && n.depth === 1) {
      if (!relations.some(r => r.from === centerId && r.to === n.id)) {
        relations.push({ id: `rel-${centerId}-${n.id}`, from: centerId, to: n.id })
      }
    }
  }
  // person/channel → center
  for (const n of nodes) {
    if (n.kind === 'person' || n.kind === 'channel') {
      relations.push({ id: `rel-${centerId}-${n.id}`, from: centerId, to: n.id })
    }
  }

  return { nodes, relations }
}
