import type { RouteLocationRaw } from 'vue-router'
import type { KanbanTaskDetail } from '@/api/hermes/kanban'
import type { CockpitTask } from './task-adapter'
import { parseTenant } from './collab-adapter'

export type GraphNodeRelation = 'center' | 'parent' | 'child' | 'person' | 'channel' | 'folded'

export interface GraphNode {
  id: string
  taskId: string
  label: string
  kind: GraphNodeRelation
  focus: boolean
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

export const MAX_NODES = 12

export function buildTopology(
  task: CockpitTask | null,
  detail: KanbanTaskDetail | null | undefined,
  allTasks: CockpitTask[],
  currentUser?: string,
): TopologyResult {
  const nodes: GraphNode[] = []
  const relations: GraphRelation[] = []
  if (!task) return { nodes, relations }

  // center
  const centerId = 'g-center'
  nodes.push({
    id: centerId, taskId: task.id, label: task.title, kind: 'center', focus: true,
  })

  // parents / children
  const addTaskNode = (rel: 'parent' | 'child', id: string) => {
    const sibling = allTasks.find(t => t.id === id)
    nodes.push({
      id: `g-${rel}-${id}`, taskId: id,
      label: sibling?.title ?? id, kind: rel, focus: false,
      target: { taskId: id },
    })
  }
  for (const pid of detail?.parents ?? []) addTaskNode('parent', pid)
  for (const cid of detail?.children ?? []) addTaskNode('child', cid)

  // persons (dedup)
  const persons = new Set<string>()
  if (task.assignee && task.assignee !== '未分配') persons.add(task.assignee)
  if (detail?.task.created_by) persons.add(detail.task.created_by)
  if (currentUser) persons.add(currentUser)
  for (const p of persons) {
    nodes.push({ id: `g-person-${p}`, taskId: task.id, label: p, kind: 'person', focus: false })
  }

  // channel from tenant
  const parsed = parseTenant(task.tenant)
  if (parsed && parsed.kind !== 'plain') {
    nodes.push({
      id: `g-channel-${task.id}`, taskId: task.id,
      label: parsed.label, kind: 'channel', focus: false,
      target: { routeTarget: parsed.routeTarget },
    })
  }

  // 折叠：超过 MAX_NODES 时裁剪并加 +N 指示节点
  if (nodes.length > MAX_NODES) {
    const overflow = nodes.length - MAX_NODES
    const kept = [nodes[0], ...nodes.slice(1, MAX_NODES)]
    kept.push({
      id: 'g-folded', taskId: task.id,
      label: `+${overflow} 更多`, kind: 'folded', focus: false,
    })
    nodes.splice(0, nodes.length, ...kept)
  }

  // relations: center → 每个非 center/非 folded
  const center = nodes[0]
  for (const n of nodes.slice(1)) {
    if (n.kind === 'folded') continue
    relations.push({ id: `rel-${center.id}-${n.id}`, from: center.id, to: n.id })
  }

  return { nodes, relations }
}
