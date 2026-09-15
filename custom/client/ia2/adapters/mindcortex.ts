// overlay/custom/client/ia2/adapters/mindcortex.ts
// 方案 B 思维隐喻原型（2026-09-15）：皮层柱拓扑——与方案 A 的层蛋糕+行星不同的
// 形态实验。本体论同一（任务=实体、运行=产生、关系=委派），但形态语言换为
// 「思维皮层」：
//   任务 = 皮层柱（cortical column）：粗细 = 运行史规模（体量）、高度 = 活跃度、
//     顶面状态色相；完成的柱结晶（faceted）。
//   关系 = 轴突束（axon bundle）：任务父子/委派边在柱间拉有机弧；
//   萌芽生长：新任务从核心沟回（central sulcus）萌芽抽出（budding 动画）；
//   皮层地形：XZ 平面是「脑回」起伏（稳定哈希定高度场，非随机）。
// 纯函数零 Three.js 依赖——与 mind3d 同一纪律（视图只消费坐标/语义）。
import type { MindProjectionDto, MindThoughtDto, MindRunDto } from './mind'

export const CORTEX_R = 260

/** 状态 → 皮层柱高度（语义：活跃高耸、沉降低矮） */
const STATUS_HEIGHT: Record<string, number> = {
  running: 90,
  'awaiting-input': 70,
  'awaiting-review': 70,
  blocked: 62,
  failed: 40,
  completed: 30,
  idle: 22,
  archived: 14,
  unknown: 18,
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

export type CortexNodeKind = 'core' | 'column' | 'run'

export interface CortexNode {
  id: string
  kind: CortexNodeKind
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
  /** 皮层地形高度（脑回起伏，XZ 语义无关纯形态） */
  terrainY: number
  /** 萌芽生长：新任务（近 24h）抽出动画起点 */
  budding: boolean
  to?: { name: string; params?: Record<string, string>; query?: Record<string, string> }
  highlight?: boolean
}

export interface CortexEdge {
  id: string
  from: string
  to: string
  fromPos: { x: number; y: number; z: number }
  toPos: { x: number; y: number; z: number }
  /** 轴突束弧顶点（有机曲线控制点） */
  apexY: number
  status: string
  flow: boolean
  strength: number
  /** 关系类型：孕育（core→column）/ 委派（column→column）/ 产生（column→run） */
  relKind: 'birth' | 'delegate' | 'spawn'
}

export interface CortexScene {
  nodes: CortexNode[]
  edges: CortexEdge[]
  /** 皮层地形采样点（视图渲染地形网格用；XZ + 起伏高度） */
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
  return STATUS_HEIGHT[status] ?? 20
}

function runTimeKey(r: MindRunDto): string {
  return r.startedAt ?? ''
}

/** 皮层地形：脑回起伏高度场（稳定哈希定起伏，XZ 只是形态不是数据） */
function terrainHeight(x: number, z: number): number {
  return Math.sin(x * 0.018) * Math.cos(z * 0.022) * 14 + Math.sin((x + z) * 0.008) * 8
}

/**
 * 构造思维皮层场景（方案 B 原型）。
 * @param projection GET /api/graph/mind 的响应（thoughts + runs + relations + available）
 */
export function buildCortexScene(projection: MindProjectionDto): CortexScene {
  const nodes: CortexNode[] = []
  const edges: CortexEdge[] = []
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

  // ── 皮层柱排序：活跃度优先（柱群布局由内向外） ──
  const sorted = [...thoughts].sort((a, b) => {
    const ra = byThought.get(a.id)?.length ?? 0
    const rb = byThought.get(b.id)?.length ?? 0
    return strengthOf(b.status) - strengthOf(a.status) || rb - ra
  })

  const MAX_COLS = 28
  const hiddenThoughts = Math.max(0, sorted.length - MAX_COLS)
  const visible = sorted.slice(0, MAX_COLS)

  // 核心沟回（中心，思维主体萌发源地）
  nodes.push({
    id: 'core', kind: 'core', x: 0, y: 0, z: 0, r: 20, h: 26,
    status: 'running', label: 'mind', strength: 1, pulse: true,
    terrainY: terrainHeight(0, 0), budding: false,
  })

  const n = visible.length
  visible.forEach((t, i) => {
    // 皮层散布：螺旋布点（黄金角）+ 哈希稳定抖动，柱群由内向外生长
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))
    const angle = i * goldenAngle + hash01(`a:${t.id}`) * 0.4
    const radius = 60 + Math.sqrt(i / Math.max(n - 1, 1)) * (CORTEX_R - 60)
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    const terrainY = terrainHeight(x, z)
    const thoughtRuns = byThought.get(t.id) ?? []
    const running = t.status === 'running' || thoughtRuns.some(r => r.status === 'running')
    const awaiting = t.status === 'awaiting-review' || thoughtRuns.some(r => r.status === 'awaiting-input')
    // 萌芽：近 24h 创建的任务
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
      terrainY,
      budding,
      to: awaiting
        ? { name: 'ia2.inbox', query: { task: t.id } }
        : { name: 'ia2.tasks', query: { task: t.id } },
      highlight: awaiting,
    })

    // 关系：核心沟回 → 皮层柱（孕育/萌芽轴突）
    const plasticity = Math.min(thoughtRuns.length, 6) / 6
    edges.push({
      id: `core->${colId}`,
      from: 'core', to: colId,
      fromPos: { x: 0, y: 26, z: 0 },
      toPos: { x, y: terrainY + colH, z },
      apexY: Math.max(26, terrainY + colH) + 30,
      status: t.status,
      flow: running,
      strength: Math.max(0.3, strengthOf(t.status) * 0.5 + plasticity * 0.5),
      relKind: 'birth',
    })

    // ── 末梢运行（柱顶环绕附属点） ──
    const shownRuns = thoughtRuns.slice(0, 4)
    shownRuns.forEach((run, j) => {
      const orbitAngle = (j * Math.PI * 2) / shownRuns.length + hash01(`o:${run.runId}`) * 0.6
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

  // ── 轴突束：任务父子/委派（column↔column，A2 关系边进皮层形态） ──
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
      apexY: Math.max(parent.y + parent.h, child.y + child.h) + 40,
      status: 'delegate',
      flow: false,
      strength: 0.6,
      relKind: 'delegate',
    })
  }

  // ── 皮层地形采样（视图渲染脑回地形网格） ──
  const terrain: Array<{ x: number; z: number; y: number }> = []
  const GRID = 24
  for (let gx = 0; gx <= GRID; gx++) {
    for (let gz = 0; gz <= GRID; gz++) {
      const x = (gx / GRID - 0.5) * CORTEX_R * 2.4
      const z = (gz / GRID - 0.5) * CORTEX_R * 2.4
      terrain.push({ x, z, y: terrainHeight(x, z) })
    }
  }

  return { nodes, edges, terrain, hiddenThoughts }
}
