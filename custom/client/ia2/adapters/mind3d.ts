// overlay/custom/client/ia2/adapters/mind3d.ts
// 3D 思维图谱纯投影（2026-09-15 形态重构）：**无中心聚类景观**——用户裁决
// 「不会有思维原点，所有思维图都应聚类分类呈现」。去核心柱/思维原点：
//   皮层并入立体图（皮层地形承载），任务按**聚类**（命名前缀族 + 父子树连通域）
//   分群散布在起伏地形上；状态决定柱高与色相（语义：活跃高耸、沉降低矮）；
//   关系弧（父子/委派）在群内柱间拉有机曲线；运行尝试环绕所属任务柱。
// 本体论不变（任务=实体、运行=产生、关系=委派），形态语言换为「聚类景观」。
// 纯函数零 Three.js 依赖——视图只消费坐标/语义，渲染在组件侧。
import type { MindProjectionDto, MindThoughtDto, MindRunDto } from './mind'

export const LANDSCAPE_R = 300
export const MAX_THOUGHTS = 32
export const RUNS_PER_THOUGHT = 4

/** 状态 → 柱高（语义：活跃高耸、沉降低矮） */
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
  /** 柱体半径（粗细 = 运行史规模） */
  r: number
  /** 柱体高度（活跃 = 高耸） */
  h: number
  status: string
  label: string
  sub?: string
  strength: number
  pulse: boolean
  /** 聚类族（命名前缀族/连通域 key） */
  cluster: string
  /** 皮层地形高度（脑回起伏，XZ 纯形态非数据） */
  terrainY: number
  /** 萌芽生长：近 24h 新任务 */
  budding: boolean
  to?: { name: string; params?: Record<string, string>; query?: Record<string, string> }
  highlight?: boolean
  /** 待介入专属通道：雷达脉冲环 */
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
  /** 关系类型：委派（父子）/ 产生（任务→运行） */
  relKind: 'delegate' | 'spawn'
}

/** 聚类族界标（视图渲染族标签/族区微起伏的依据） */
export interface MindCluster {
  key: string
  label: string
  count: number
  cx: number
  cz: number
  /** 族内最活跃状态（族标签着色） */
  dominantStatus: string
}

export interface MindScene {
  nodes: MindNode[]
  edges: MindEdge[]
  clusters: MindCluster[]
  terrain: Array<{ x: number; z: number; y: number }>
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

/** 皮层地形：脑回起伏高度场（稳定，XZ 纯形态非数据） */
function terrainHeight(x: number, z: number): number {
  return Math.sin(x * 0.016) * Math.cos(z * 0.02) * 12 + Math.sin((x + z) * 0.008) * 7
}

/** 聚类族：命名前缀族（[xxx] 约定）+ 父子树连通域兜底 + 单任务自成族 */
function clusterKeyOf(t: MindThoughtDto, parentOf: Map<string, string>, childOf: Map<string, string[]>): string {
  const m = t.title.match(/^\[([^\]]+)\]/)
  if (m) return m[1].replace(/-\d+b?$/, '') // [aiteam-1] / [aiteam-1b] → aiteam
  // 父子树连通域：归到根任务（无环假设；kanban task_links 是 DAG）。
  // 根任务本体也归 tree: 族（有子代即是一族之主，不自成 solo）——保证同树同族。
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

/**
 * 构造聚类景观场景（无核心柱/无思维原点）。
 * @param projection GET /api/graph/mind 的响应（thoughts + runs + relations + available）
 */
export function buildMind3DScene(projection: MindProjectionDto): MindScene {
  const nodes: MindNode[] = []
  const edges: MindEdge[] = []
  const { thoughts, runs } = projection
  const relations = projection.relations ?? []

  // ── run 按 thoughtId 分组（组内最新在前） ──
  const byThought = new Map<string, MindRunDto[]>()
  for (const run of runs) {
    const list = byThought.get(run.thoughtId)
    if (list) list.push(run)
    else byThought.set(run.thoughtId, [run])
  }
  for (const list of byThought.values()) {
    list.sort((a, b) => runTimeKey(b).localeCompare(runTimeKey(a)))
  }

  // ── 父子映射（连通域归组用；childOf 反向索引判「族之主」） ──
  const parentOf = new Map<string, string>()
  const childOf = new Map<string, string[]>()
  for (const rel of relations) {
    parentOf.set(rel.childId, rel.parentId)
    const kids = childOf.get(rel.parentId)
    if (kids) kids.push(rel.childId)
    else childOf.set(rel.parentId, [rel.childId])
  }

  // ── 聚类分群 ──
  const thoughtById = new Map(thoughts.map(t => [t.id, t]))
  const clusters = new Map<string, MindThoughtDto[]>()
  for (const t of thoughts) {
    const key = clusterKeyOf(t, parentOf, childOf)
    const list = clusters.get(key)
    if (list) list.push(t)
    else clusters.set(key, [t])
  }
  for (const list of clusters.values()) {
    list.sort((a, b) => {
      const ra = byThought.get(a.id)?.[0]
      const rb = byThought.get(b.id)?.[0]
      return runTimeKey(rb ?? ({} as MindRunDto)).localeCompare(runTimeKey(ra ?? ({} as MindRunDto)))
    })
  }

  // ── 族排序：最活跃族优先（族质心布局由内向外） ──
  const clusterActivity = (list: MindThoughtDto[]): number =>
    Math.max(...list.map(t => strengthOf(t.status))) + Math.min(list.length, 8) * 0.05
  const sortedClusters = [...clusters.entries()].sort((a, b) => clusterActivity(b[1]) - clusterActivity(a[1]))

  // ── 族质心散布（景观平面上，无中心原点） ──
  const clusterPos = new Map<string, { cx: number; cz: number }>()
  const nClusters = sortedClusters.length
  sortedClusters.forEach(([key], i) => {
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))
    const angle = i * goldenAngle + hash01(`c:${key}`) * 0.5
    const radius = nClusters > 1 ? 60 + Math.sqrt(i / (nClusters - 1)) * (LANDSCAPE_R - 60) : 0
    clusterPos.set(key, { cx: Math.cos(angle) * radius, cz: Math.sin(angle) * radius })
  })

  // ── 思想核落位：族内散布（柱群围绕族质心） ──
  const hiddenThoughts = Math.max(0, thoughts.length - MAX_THOUGHTS)
  let budget = MAX_THOUGHTS
  const clusterMetas: MindCluster[] = []

  for (const [key, group] of sortedClusters) {
    const shown = group.slice(0, Math.max(0, budget))
    budget -= shown.length
    if (shown.length === 0) continue
    const { cx, cz } = clusterPos.get(key)!
    const dominant = shown.reduce((a, b) => strengthOf(b.status) > strengthOf(a.status) ? b : a)
    clusterMetas.push({
      key,
      label: clusterLabel(key, thoughtById),
      count: group.length,
      cx, cz,
      dominantStatus: dominant.status,
    })

    shown.forEach((t, j) => {
      const clusterSpread = 20 + Math.min(shown.length, 10) * 6
      const angle = j * Math.PI * (3 - Math.sqrt(5)) + hash01(`a:${t.id}`) * 0.5
      const r = shown.length > 1 ? Math.sqrt(j / (shown.length - 1)) * clusterSpread : 0
      const x = cx + Math.cos(angle) * r
      const z = cz + Math.sin(angle) * r
      const terrainY = terrainHeight(x, z)
      const thoughtRuns = byThought.get(t.id) ?? []
      const running = t.status === 'running' || thoughtRuns.some(r2 => r2.status === 'running')
      const awaiting = t.status === 'awaiting-review' || thoughtRuns.some(r2 => r2.status === 'awaiting-input')
      const budding = t.createdAt != null && Date.now() - Date.parse(t.createdAt) < 24 * 3600_000

      const colId = `column:${t.id}`
      const colR = 8 + Math.min(thoughtRuns.length, 8) * 1.2
      const colH = heightOf(t.status)
      nodes.push({
        id: colId,
        kind: 'column',
        x, y: terrainY, z,
        r: colR,
        h: colH,
        status: t.status,
        label: t.title,
        sub: thoughtRuns.length > 0 ? `×${thoughtRuns.length}` : undefined,
        strength: strengthOf(t.status),
        pulse: running,
        cluster: key,
        terrainY,
        budding,
        to: awaiting
          ? { name: 'ia2.inbox', query: { task: t.id } }
          : { name: 'ia2.tasks', query: { task: t.id } },
        highlight: awaiting,
        pendingAlert: awaiting,
      })

      // ── 末梢运行（柱顶环绕附属点） ──
      const shownRuns = thoughtRuns.slice(0, RUNS_PER_THOUGHT)
      shownRuns.forEach((run, j2) => {
        const orbitAngle = (j2 * Math.PI * 2) / shownRuns.length + hash01(`o:${run.runId}`) * 0.6
        const orbitR = colR + 12 + Math.min(run.durationSec * 0.02, 16)
        const rx = x + Math.cos(orbitAngle) * orbitR
        const rz = z + Math.sin(orbitAngle) * orbitR
        const runId = `run:${run.runId}`
        const isRunning = run.status === 'running'
        nodes.push({
          id: runId,
          kind: 'run',
          x: rx, y: terrainY + colH + 6, z: rz,
          r: isRunning ? 4.5 : 3.5,
          h: 0,
          status: run.status,
          label: run.runId.slice(-4),
          strength: strengthOf(run.status),
          pulse: isRunning,
          cluster: key,
          terrainY,
          budding: false,
          to: { name: 'ia2.tasks', query: { task: run.thoughtId } },
        })
        edges.push({
          id: `${colId}->${runId}`,
          from: colId, to: runId,
          fromPos: { x, y: terrainY + colH, z },
          toPos: { x: rx, y: terrainY + colH + 6, z: rz },
          apexY: terrainY + colH + 12,
          status: run.status,
          flow: isRunning,
          strength: strengthOf(run.status) * 0.8,
          relKind: 'spawn',
        })
      })
    })
  }

  // ── 关系弧：任务父子/委派（柱↔柱有机曲线） ──
  const nodeById = new Map(nodes.map(nd => [nd.id, nd]))
  for (const rel of relations) {
    const parent = nodeById.get(`column:${rel.parentId}`)
    const child = nodeById.get(`column:${rel.childId}`)
    if (!parent || !child) continue
    edges.push({
      id: `rel:${rel.parentId}->${rel.childId}`,
      from: parent.id, to: child.id,
      fromPos: { x: parent.x, y: parent.y + parent.h, z: parent.z },
      toPos: { x: child.x, y: child.y + child.h, z: child.z },
      apexY: Math.max(parent.y + parent.h, child.y + child.h) + 36,
      status: 'delegate',
      flow: false,
      strength: 0.6,
      relKind: 'delegate',
    })
  }

  // ── 皮层地形采样（脑回起伏网格） ──
  const terrain: Array<{ x: number; z: number; y: number }> = []
  const GRID = 26
  for (let gx = 0; gx <= GRID; gx++) {
    for (let gz = 0; gz <= GRID; gz++) {
      const x = (gx / GRID - 0.5) * LANDSCAPE_R * 2.4
      const z = (gz / GRID - 0.5) * LANDSCAPE_R * 2.4
      terrain.push({ x, z, y: terrainHeight(x, z) })
    }
  }

  return { nodes, edges, clusters: clusterMetas, terrain, hiddenThoughts }
}
