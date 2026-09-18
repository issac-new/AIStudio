// overlay/custom/client/ia2/adapters/mind3d.ts
// 3D 思维图谱纯投影（2026-09-15 形态重构 v4）：**力导向内聚团块**——用户裁决
// 「气泡和沉降不错，但形状和连线有点乱，没有力图那种内聚的感觉」。
// 去手工散布（黄金角螺旋/分区体），改力导向自组织：
//   节点（任务柱 + 运行末梢）经力导向模拟自组织成内聚团块——同族相吸、异族相斥、
//   关系边拉拢、运行吸附所属任务；状态决定柱高（活跃高耸、沉降低矮，语义保留）；
//   气泡=分区/族的涌现团块（力导向收敛后自然成簇），不是手工画的边界。
// 本体论不变（任务=实体、运行=产生、关系=委派），形态语言换为「力导向内聚网络」。
// 纯函数零 Three.js 依赖——视图只消费坐标/语义，渲染在组件侧。
import type { MindProjectionDto, MindThoughtDto, MindRunDto } from './mind'

export const MAX_THOUGHTS = 32
export const RUNS_PER_THOUGHT = 4

const STATUS_HEIGHT: Record<string, number> = {
  running: 84,
  'awaiting-input': 66,
  'awaiting-review': 66,
  blocked: 58,
  failed: 38,
  completed: 28,
  idle: 20,
  archived: 12,
  unknown: 16,
}

const STATUS_STRENGTH: Record<string, number> = {
  running: 1.0,
  'awaiting-input': 0.82,
  'awaiting-review': 0.72,
  blocked: 0.66,
  failed: 0.5,
  paused: 0.42,
  completed: 0.34,
  idle: 0.28,
  archived: 0.18,
  unknown: 0.24,
}

export type MindNodeKind = 'column' | 'run'

export interface MindNode {
  id: string
  kind: MindNodeKind
  x: number
  y: number
  z: number
  r: number
  h: number
  status: string
  label: string
  sub?: string
  strength: number
  pulse: boolean
  cluster: string
  budding: boolean
  to?: { name: string; params?: Record<string, string>; query?: Record<string, string> }
  highlight?: boolean
  pendingAlert?: boolean
}

export interface MindEdge {
  id: string
  from: string
  to: string
  fromPos: { x: number; y: number; z: number }
  toPos: { x: number; y: number; z: number }
  apexY: number
  status: string
  flow: boolean
  strength: number
  relKind: 'delegate' | 'spawn'
  crossCluster: boolean
}

export interface MindCluster {
  key: string
  label: string
  count: number
  cx: number
  cy: number
  cz: number
  dominantStatus: string
}

export interface MindScene {
  nodes: MindNode[]
  edges: MindEdge[]
  clusters: MindCluster[]
  hiddenThoughts: number
}

function hash01(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return ((h >>> 0) % 10_000) / 10_000
}

function strengthOf(status: string): number {
  return STATUS_STRENGTH[status] ?? 0.24
}

function heightOf(status: string): number {
  return STATUS_HEIGHT[status] ?? 18
}

function runTimeKey(r: MindRunDto): string {
  return r.startedAt ?? ''
}

function clusterKeyOf(t: MindThoughtDto | undefined, parentOf: Map<string, string>, childOf: Map<string, string[]>): string {
  if (!t) return 'solo:unknown'
  const m = t.title.match(/^\[([^\]]+)\]/)
  if (m) return m[1].replace(/-\d+b?$/, '')
  let cur = t.id
  const seen = new Set<string>()
  while (parentOf.has(cur) && !seen.has(cur)) {
    seen.add(cur)
    cur = parentOf.get(cur)!
  }
  if (cur !== t.id) return `tree:${cur}`
  if ((childOf.get(t.id) ?? []).length > 0) return `tree:${t.id}`
  return `solo:${t.id}`
}

function clusterLabel(key: string, thoughts: Map<string, MindThoughtDto>): string {
  if (key.startsWith('solo:')) {
    const t = thoughts.get(key.slice(5))
    return t ? (t.title.length > 12 ? t.title.slice(0, 12) + '…' : t.title) : key
  }
  if (key.startsWith('tree:')) {
    const root = thoughts.get(key.slice(5))
    return root ? (root.title.length > 12 ? root.title.slice(0, 12) + '…' : root.title) : key
  }
  return key
}

interface SimNode {
  id: string
  x: number; z: number
  vx: number; vz: number
  cluster: string
}

/** 力导向模拟（确定性：固定种子初始位置 + 固定迭代；同输入必产同一布局） */
function forceSimulate(simNodes: SimNode[], links: Array<{ a: number; b: number }>): void {
  const ITER = 120
  const REPULSION = 900
  const ATTRACTION = 0.028
  const CLUSTER_PULL = 0.016
  const DAMPING = 0.82
  const CENTER_PULL = 0.004

  const clusterCenters = new Map<string, { x: number; z: number; n: number }>()

  for (let iter = 0; iter < ITER; iter++) {
    clusterCenters.clear()
    for (const n of simNodes) {
      const c = clusterCenters.get(n.cluster) ?? { x: 0, z: 0, n: 0 }
      c.x += n.x; c.z += n.z; c.n++
      clusterCenters.set(n.cluster, c)
    }
    for (const c of clusterCenters.values()) { c.x /= c.n; c.z /= c.n }

    for (let i = 0; i < simNodes.length; i++) {
      const a = simNodes[i]
      let fx = 0, fz = 0
      for (let j = 0; j < simNodes.length; j++) {
        if (i === j) continue
        const b = simNodes[j]
        const dx = a.x - b.x
        const dz = a.z - b.z
        const d2 = dx * dx + dz * dz + 40
        const f = REPULSION / d2
        fx += dx * f / Math.sqrt(d2)
        fz += dz * f / Math.sqrt(d2)
      }
      const cc = clusterCenters.get(a.cluster)
      if (cc && cc.n > 1) {
        fx += (cc.x - a.x) * CLUSTER_PULL
        fz += (cc.z - a.z) * CLUSTER_PULL
      }
      fx += -a.x * CENTER_PULL
      fz += -a.z * CENTER_PULL
      a.vx = (a.vx + fx) * DAMPING
      a.vz = (a.vz + fz) * DAMPING
    }
    for (const { a, b } of links) {
      const na = simNodes[a]
      const nb = simNodes[b]
      const dx = nb.x - na.x
      const dz = nb.z - na.z
      na.vx += dx * ATTRACTION
      na.vz += dz * ATTRACTION
      nb.vx -= dx * ATTRACTION
      nb.vz -= dz * ATTRACTION
    }
    for (const n of simNodes) {
      n.x += n.vx
      n.z += n.vz
    }
  }
}

export function buildMind3DScene(projection: MindProjectionDto): MindScene {
  const nodes: MindNode[] = []
  const edges: MindEdge[] = []
  const { thoughts, runs } = projection
  const relations = projection.relations ?? []

  const byThought = new Map<string, MindRunDto[]>()
  for (const run of runs) {
    const list = byThought.get(run.thoughtId)
    if (list) list.push(run)
    else byThought.set(run.thoughtId, [run])
  }
  for (const list of byThought.values()) {
    list.sort((a, b) => runTimeKey(b).localeCompare(runTimeKey(a)))
  }

  const parentOf = new Map<string, string>()
  const childOf = new Map<string, string[]>()
  for (const rel of relations) {
    parentOf.set(rel.childId, rel.parentId)
    const kids = childOf.get(rel.parentId)
    if (kids) kids.push(rel.childId)
    else childOf.set(rel.parentId, [rel.childId])
  }

  const thoughtById = new Map(thoughts.map(t => [t.id, t]))
  const hiddenThoughts = Math.max(0, thoughts.length - MAX_THOUGHTS)
  const visible = thoughts.slice(0, MAX_THOUGHTS)

  // 力导向模拟：任务柱自组织成内聚团块
  const simNodes: SimNode[] = visible.map((t) => {
    const seed = hash01(`init:${t.id}`)
    const angle = seed * Math.PI * 2
    const radius = 40 + hash01(`initr:${t.id}`) * 120
    return {
      id: t.id,
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      vx: 0, vz: 0,
      cluster: clusterKeyOf(t, parentOf, childOf),
    }
  })
  const simIndex = new Map(simNodes.map((n, i) => [n.id, i]))
  const simLinks: Array<{ a: number; b: number }> = []
  for (const rel of relations) {
    const a = simIndex.get(rel.parentId)
    const b = simIndex.get(rel.childId)
    if (a != null && b != null) simLinks.push({ a, b })
  }
  forceSimulate(simNodes, simLinks)

  const clusterMembers = new Map<string, MindNode[]>()
  for (const sim of simNodes) {
    const t = thoughtById.get(sim.id)!
    const thoughtRuns = byThought.get(t.id) ?? []
    const running = t.status === 'running' || thoughtRuns.some(r => r.status === 'running')
    const awaiting = t.status === 'awaiting-review' || thoughtRuns.some(r => r.status === 'awaiting-input')
    const budding = t.createdAt != null && Date.now() - Date.parse(t.createdAt) < 24 * 3600_000

    const colId = `column:${t.id}`
    const colR = 8 + Math.min(thoughtRuns.length, 8) * 1.2
    const colH = heightOf(t.status)
    const node: MindNode = {
      id: colId,
      kind: 'column',
      x: sim.x, y: 0, z: sim.z,
      r: colR,
      h: colH,
      status: t.status,
      label: t.title,
      sub: thoughtRuns.length > 0 ? `×${thoughtRuns.length}` : undefined,
      strength: strengthOf(t.status),
      pulse: running,
      cluster: sim.cluster,
      budding,
      to: awaiting
        // 2026-09-18 统一导航 Task 4：介入中心收敛为运行场景枢纽 inbox tab（task 上下文随行）
        ? { name: 'ia2.ops', query: { tab: 'inbox', task: t.id } }
        : { name: 'ia2.tasks', query: { task: t.id } },
      highlight: awaiting,
      pendingAlert: awaiting,
    }
    nodes.push(node)
    const list = clusterMembers.get(sim.cluster)
    if (list) list.push(node)
    else clusterMembers.set(sim.cluster, [node])

    const shownRuns = thoughtRuns.slice(0, RUNS_PER_THOUGHT)
    shownRuns.forEach((run, j) => {
      const orbitAngle = (j * Math.PI * 2) / shownRuns.length + hash01(`o:${run.runId}`) * 0.6
      const orbitR = colR + 10 + Math.min(run.durationSec * 0.02, 14)
      const rx = sim.x + Math.cos(orbitAngle) * orbitR
      const rz = sim.z + Math.sin(orbitAngle) * orbitR
      const runId = `run:${run.runId}`
      const isRunning = run.status === 'running'
      nodes.push({
        id: runId,
        kind: 'run',
        x: rx, y: colH + 5, z: rz,
        r: isRunning ? 4 : 3,
        h: 0,
        status: run.status,
        label: run.runId.slice(-4),
        strength: strengthOf(run.status),
        pulse: isRunning,
        cluster: sim.cluster,
        budding: false,
        to: { name: 'ia2.tasks', query: { task: run.thoughtId } },
      })
      edges.push({
        id: `${colId}->${runId}`,
        from: colId, to: runId,
        fromPos: { x: sim.x, y: colH, z: sim.z },
        toPos: { x: rx, y: colH + 5, z: rz },
        apexY: colH + 10,
        status: run.status,
        flow: isRunning,
        strength: strengthOf(run.status) * 0.8,
        relKind: 'spawn',
        crossCluster: false,
      })
    })
  }

  const clusterMetas: MindCluster[] = []
  for (const [key, members] of clusterMembers.entries()) {
    const cx = members.reduce((s, m) => s + m.x, 0) / members.length
    const cz = members.reduce((s, m) => s + m.z, 0) / members.length
    const dominant = members.reduce((a, b) => b.strength > a.strength ? b : a)
    clusterMetas.push({
      key,
      label: clusterLabel(key, thoughtById),
      count: members.length,
      cx, cy: 0, cz,
      dominantStatus: dominant.status,
    })
  }

  const nodeById = new Map(nodes.filter(n => n.kind === 'column').map(nd => [nd.id, nd]))
  for (const rel of relations) {
    const parent = nodeById.get(`column:${rel.parentId}`)
    const child = nodeById.get(`column:${rel.childId}`)
    if (!parent || !child) continue
    const cross = parent.cluster !== child.cluster
    edges.push({
      id: `rel:${rel.parentId}->${rel.childId}`,
      from: parent.id, to: child.id,
      fromPos: { x: parent.x, y: parent.h, z: parent.z },
      toPos: { x: child.x, y: child.h, z: child.z },
      apexY: Math.max(parent.h, child.h) + (cross ? 46 : 18),
      status: 'delegate',
      flow: false,
      strength: cross ? 0.7 : 0.55,
      relKind: 'delegate',
      crossCluster: cross,
    })
  }

  return { nodes, edges, clusters: clusterMetas, hiddenThoughts }
}

/**
 * 关联项筛选投影（2026-09-15 用户裁决：点击节点不跳 kanban，就地筛选仅显示关联项）。
 */
export function relatedIdsOf(nodeId: string, projection: MindProjectionDto): Set<string> {
  const related = new Set<string>()
  const relations = projection.relations ?? []
  const parentOf = new Map(relations.map(r => [r.childId, r.parentId]))
  const childOf = relations.reduce((m, r) => {
    const k = m.get(r.parentId)
    if (k) k.push(r.childId)
    else m.set(r.parentId, [r.childId])
    return m
  }, new Map<string, string[]>())

  const columnMatch = nodeId.match(/^column:(.+)$/)
  if (columnMatch) {
    const taskId = columnMatch[1]
    if (!projection.thoughts.some(t => t.id === taskId)) return related
    related.add(`column:${taskId}`)
    const cluster = clusterKeyOf(projection.thoughts.find(t => t.id === taskId), parentOf, childOf)
    for (const t of projection.thoughts) {
      if (clusterKeyOf(t, parentOf, childOf) === cluster) related.add(`column:${t.id}`)
    }
    for (const r of projection.runs) {
      if (r.thoughtId === taskId) related.add(`run:${r.runId}`)
      const rt = projection.thoughts.find(t => t.id === r.thoughtId)
      if (rt && related.has(`column:${rt.id}`)) related.add(`run:${r.runId}`)
    }
    for (const rel of relations) {
      if (rel.parentId === taskId) related.add(`column:${rel.childId}`)
      if (rel.childId === taskId) related.add(`column:${rel.parentId}`)
    }
    return related
  }
  const runMatch = nodeId.match(/^run:(.+)$/)
  if (runMatch) {
    const runId = runMatch[1]
    const run = projection.runs.find(r => r.runId === runId)
    if (run) {
      related.add(`run:${runId}`)
      related.add(`column:${run.thoughtId}`)
      for (const r of projection.runs) {
        if (r.thoughtId === run.thoughtId) related.add(`run:${r.runId}`)
      }
    }
  }
  return related
}
