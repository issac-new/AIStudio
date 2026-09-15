// overlay/custom/client/ia2/adapters/mind3d.ts
// 3D 思维图谱纯投影（2026-09-15 形态重构 v3）：**多维功能分区结构**——用户裁决
// 「皮层这个概念不对：像大脑那样有不同的功能分区，是一个多维结构，不是一个
// 弯曲表面的堆砌」。去皮层表面堆砌，改为大脑功能分区式多维结构：
//
//   功能分区（region）= 任务的多维属性面交汇处：聚类族（语义归属）× 状态（活跃/待介入/
//     沉降）× 活跃度（运行史规模）三维定位一个分区；每个分区是一个功能系统
//     （有自己的内部结构：柱群 + 末梢环绕），不是表面上的一个点。
//   分区体（region volume）：每个分区占据一个三维子空间（半透明边界体），
//     内部任务柱群自治散布；分区之间由**投射通路**（projection tract）连接——
//     跨区关系边（父子/委派跨族跨状态）显式拉起为区间通路，同区关系在区内消化。
//   无中心原点：分区体在空间中多维散布（族=主散布维、状态=高度维、活跃度=纵深维），
//     无一物居中——思维是分区协作的网络，不是从一个原点辐射。
//
// 本体论不变（任务=实体、运行=产生、关系=委派），形态语言换为「功能分区网络」。
// 纯函数零 Three.js 依赖——视图只消费坐标/语义，渲染在组件侧。
import type { MindProjectionDto, MindThoughtDto, MindRunDto } from './mind'

export const MAX_THOUGHTS = 32
export const RUNS_PER_THOUGHT = 4

/** 状态 → 分区高度维（Y；语义：活跃在上、沉降在下） */
const STATUS_Y: Record<string, number> = {
  running: 120,
  'awaiting-input': 80,
  'awaiting-review': 80,
  blocked: 60,
  failed: 30,
  completed: 10,
  idle: -10,
  archived: -30,
  unknown: 0,
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
  /** 所属功能分区 key */
  region: string
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
  /** 跨区投射通路（跨分区的关系边显式标记，视图渲染为区间通路） */
  crossRegion: boolean
}

/** 功能分区（region）：多维属性面交汇处的一个功能系统 */
export interface MindRegion {
  key: string
  /** 分区语义标签（族名 + 主导状态） */
  label: string
  count: number
  /** 分区体质心 */
  cx: number
  cy: number
  cz: number
  /** 分区体半径（内部结构散布范围） */
  radius: number
  /** 主导状态（分区着色） */
  dominantStatus: string
  /** 聚类族 */
  cluster: string
}

export interface MindScene {
  nodes: MindNode[]
  edges: MindEdge[]
  regions: MindRegion[]
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

function runTimeKey(r: MindRunDto): string {
  return r.startedAt ?? ''
}

/** 聚类族：命名前缀族（[xxx] 约定）+ 父子树连通域兜底 + 单任务自成族 */
function clusterKeyOf(t: MindThoughtDto, parentOf: Map<string, string>, childOf: Map<string, string[]>): string {
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

/** 状态 → 分区的功能面（活跃系统/待介入系统/沉降系统） */
function regionFaceOf(status: string): string {
  if (status === 'running') return 'active'
  if (status === 'awaiting-input' || status === 'awaiting-review' || status === 'blocked') return 'pending'
  if (status === 'completed' || status === 'failed') return 'settled'
  return 'dormant' // idle/archived/unknown
}

/**
 * 构造多维功能分区场景（无中心原点；分区=功能系统，区间投射通路连接）。
 */
export function buildMind3DScene(projection: MindProjectionDto): MindScene {
  const nodes: MindNode[] = []
  const edges: MindEdge[] = []
  const { thoughts, runs } = projection
  const relations = projection.relations ?? []

  // ── run 按 thoughtId 分组 ──
  const byThought = new Map<string, MindRunDto[]>()
  for (const run of runs) {
    const list = byThought.get(run.thoughtId)
    if (list) list.push(run)
    else byThought.set(run.thoughtId, [run])
  }
  for (const list of byThought.values()) {
    list.sort((a, b) => runTimeKey(b).localeCompare(runTimeKey(a)))
  }

  // ── 父子映射 ──
  const parentOf = new Map<string, string>()
  const childOf = new Map<string, string[]>()
  for (const rel of relations) {
    parentOf.set(rel.childId, rel.parentId)
    const kids = childOf.get(rel.parentId)
    if (kids) kids.push(rel.childId)
    else childOf.set(rel.parentId, [rel.childId])
  }

  // ── 多维分区：聚类族 × 功能面（状态）交汇成分区 ──
  const thoughtById = new Map(thoughts.map(t => [t.id, t]))
  const regions = new Map<string, MindThoughtDto[]>()
  for (const t of thoughts) {
    const cluster = clusterKeyOf(t, parentOf, childOf)
    const face = regionFaceOf(t.status)
    const key = `${cluster}::${face}`
    const list = regions.get(key)
    if (list) list.push(t)
    else regions.set(key, [t])
  }

  // ── 分区排序：最活跃分区优先（质心布局由内向外） ──
  const regionActivity = (list: MindThoughtDto[]): number =>
    Math.max(...list.map(t => strengthOf(t.status))) + Math.min(list.length, 8) * 0.05
  const sortedRegions = [...regions.entries()].sort((a, b) => regionActivity(b[1]) - regionActivity(a[1]))

  // ── 分区质心多维散布：族=主散布维（XZ 黄金角螺旋）、功能面=高度维（Y 分层）、
  //    活跃度=纵深微调（活跃分区略上浮） ──
  const regionPos = new Map<string, { cx: number; cy: number; cz: number }>()
  const nRegions = sortedRegions.length
  sortedRegions.forEach(([key, group], i) => {
    const face = key.split('::')[1]
    const faceY = face === 'active' ? 100 : face === 'pending' ? 60 : face === 'settled' ? 10 : -30
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))
    const angle = i * goldenAngle + hash01(`r:${key}`) * 0.5
    const radius = nRegions > 1 ? 70 + Math.sqrt(i / (nRegions - 1)) * 200 : 0
    const activityLift = regionActivity(group) * 8
    regionPos.set(key, {
      cx: Math.cos(angle) * radius,
      cy: faceY + activityLift,
      cz: Math.sin(angle) * radius,
    })
  })

  const hiddenThoughts = Math.max(0, thoughts.length - MAX_THOUGHTS)
  let budget = MAX_THOUGHTS
  const regionMetas: MindRegion[] = []

  for (const [key, group] of sortedRegions) {
    const shown = group.slice(0, Math.max(0, budget))
    budget -= shown.length
    if (shown.length === 0) continue
    const { cx, cy, cz } = regionPos.get(key)!
    const cluster = key.split('::')[0]
    const dominant = shown.reduce((a, b) => strengthOf(b.status) > strengthOf(a.status) ? b : a)
    const regionRadius = 26 + Math.min(shown.length, 10) * 8
    regionMetas.push({
      key,
      label: `${regionLabelOf(cluster, thoughtById)} · ${faceLabelOf(key.split('::')[1])}`,
      count: group.length,
      cx, cy, cz,
      radius: regionRadius,
      dominantStatus: dominant.status,
      cluster,
    })

    shown.forEach((t, j) => {
      // 分区内散布：柱群围绕分区质心（分区体内部自治）
      const angle = j * Math.PI * (3 - Math.sqrt(5)) + hash01(`a:${t.id}`) * 0.5
      const r = shown.length > 1 ? Math.sqrt(j / (shown.length - 1)) * regionRadius : 0
      const x = cx + Math.cos(angle) * r
      const z = cz + Math.sin(angle) * r
      const y = cy + (hash01(`y:${t.id}`) - 0.5) * 16
      const thoughtRuns = byThought.get(t.id) ?? []
      const running = t.status === 'running' || thoughtRuns.some(r2 => r2.status === 'running')
      const awaiting = t.status === 'awaiting-review' || thoughtRuns.some(r2 => r2.status === 'awaiting-input')
      const budding = t.createdAt != null && Date.now() - Date.parse(t.createdAt) < 24 * 3600_000

      const colId = `column:${t.id}`
      const colR = 7 + Math.min(thoughtRuns.length, 8) * 1.1
      const colH = 14 + strengthOf(t.status) * 30
      nodes.push({
        id: colId,
        kind: 'column',
        x, y, z,
        r: colR,
        h: colH,
        status: t.status,
        label: t.title,
        sub: thoughtRuns.length > 0 ? `×${thoughtRuns.length}` : undefined,
        strength: strengthOf(t.status),
        pulse: running,
        region: key,
        budding,
        to: awaiting
          ? { name: 'ia2.inbox', query: { task: t.id } }
          : { name: 'ia2.tasks', query: { task: t.id } },
        highlight: awaiting,
        pendingAlert: awaiting,
      })

      // ── 末梢运行（柱顶环绕） ──
      const shownRuns = thoughtRuns.slice(0, RUNS_PER_THOUGHT)
      shownRuns.forEach((run, j2) => {
        const orbitAngle = (j2 * Math.PI * 2) / shownRuns.length + hash01(`o:${run.runId}`) * 0.6
        const orbitR = colR + 10 + Math.min(run.durationSec * 0.02, 14)
        const rx = x + Math.cos(orbitAngle) * orbitR
        const rz = z + Math.sin(orbitAngle) * orbitR
        const runId = `run:${run.runId}`
        const isRunning = run.status === 'running'
        nodes.push({
          id: runId,
          kind: 'run',
          x: rx, y: y + colH + 5, z: rz,
          r: isRunning ? 4 : 3,
          h: 0,
          status: run.status,
          label: run.runId.slice(-4),
          strength: strengthOf(run.status),
          pulse: isRunning,
          region: key,
          budding: false,
          to: { name: 'ia2.tasks', query: { task: run.thoughtId } },
        })
        edges.push({
          id: `${colId}->${runId}`,
          from: colId, to: runId,
          fromPos: { x, y: y + colH, z },
          toPos: { x: rx, y: y + colH + 5, z: rz },
          apexY: y + colH + 10,
          status: run.status,
          flow: isRunning,
          strength: strengthOf(run.status) * 0.8,
          relKind: 'spawn',
          crossRegion: false,
        })
      })
    })
  }

  // ── 投射通路：跨区关系边（父子/委派跨分区 → 区间通路显式拉起） ──
  const nodeById = new Map(nodes.map(nd => [nd.id, nd]))
  for (const rel of relations) {
    const parent = nodeById.get(`column:${rel.parentId}`)
    const child = nodeById.get(`column:${rel.childId}`)
    if (!parent || !child) continue
    const cross = parent.region !== child.region
    edges.push({
      id: `rel:${rel.parentId}->${rel.childId}`,
      from: parent.id, to: child.id,
      fromPos: { x: parent.x, y: parent.y + parent.h, z: parent.z },
      toPos: { x: child.x, y: child.y + child.h, z: child.z },
      apexY: Math.max(parent.y + parent.h, child.y + child.h) + (cross ? 50 : 20),
      status: 'delegate',
      flow: false,
      strength: cross ? 0.75 : 0.5,
      relKind: 'delegate',
      crossRegion: cross,
    })
  }

  return { nodes, edges, regions: regionMetas, hiddenThoughts }
}

function regionLabelOf(cluster: string, thoughts: Map<string, MindThoughtDto>): string {
  if (cluster.startsWith('solo:')) {
    const t = thoughts.get(cluster.slice(5))
    return t ? (t.title.length > 10 ? t.title.slice(0, 10) + '…' : t.title) : cluster
  }
  if (cluster.startsWith('tree:')) {
    const root = thoughts.get(cluster.slice(5))
    return root ? (root.title.length > 10 ? root.title.slice(0, 10) + '…' : root.title) : cluster
  }
  return cluster
}

function faceLabelOf(face: string): string {
  switch (face) {
    case 'active': return '活跃'
    case 'pending': return '待介入'
    case 'settled': return '已沉降'
    default: return '静止'
  }
}
