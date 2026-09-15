// overlay/custom/client/ia2/adapters/mind3d.ts
// 3D 思维图谱纯投影（2026-09-15 用户裁决：核心思维图升级 Three.js 立体图——
// 可缩放/旋转/层级切换）。本体论分层映射到 3D 语义空间：
//   状态 → 高度层（Y 轴）：进行中在顶层、待介入/阻塞居中、已完成/静止/已归档沉降底层；
//   任务（思想核）→ 层内平面的节点（XZ 平面散布）；
//   运行尝试（末梢）→ 所属任务节点周围的附属点（语义：属于该任务）；
//   关系：核心柱（中心轴）→ 任务（孕育）、任务→运行（产生）——有向语义连线；
//   区内时序：同层内按最近活动排序（新在近核、旧在远核）。
// 纯函数零 Three.js 依赖——视图只消费坐标/语义，Three.js 渲染在组件侧。
import type { MindProjectionDto, MindThoughtDto, MindRunDto } from './mind'

export const MIND3D_LAYER_GAP = 90
export const MIND3D_PLANE_R = 240
export const MIND3D_RUN_ORBIT = 34

/** 状态 → 高度层序号（Y 轴；大=高）。语义：活跃在上、沉降在下。 */
const LAYER_BY_STATUS: Record<string, number> = {
  running: 3,
  'awaiting-input': 2,
  'awaiting-review': 2,
  blocked: 2,
  failed: 1,
  completed: 1,
  idle: 0,
  archived: 0,
  unknown: 0,
}

/** 状态 → 强度（发光/尺寸驱动） */
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

export type Mind3DNodeKind = 'core' | 'thought' | 'run'

export interface Mind3DNode {
  id: string
  kind: Mind3DNodeKind
  x: number
  y: number
  z: number
  r: number
  status: string
  label: string
  sub?: string
  strength: number
  pulse: boolean
  layer: number
  to?: { name: string; params?: Record<string, string>; query?: Record<string, string> }
  highlight?: boolean
  /** 待介入专属通道：雷达脉冲环（与 running 呼吸脉冲分家） */
  pendingAlert?: boolean
  /** 区内时序显式化：径向距核距离（新近核、旧远核） */
  radialRecency?: number
}

export interface Mind3DEdge {
  id: string
  from: string
  to: string
  /** 端点坐标（视图直接连） */
  fromPos: { x: number; y: number; z: number }
  toPos: { x: number; y: number; z: number }
  status: string
  flow: boolean
  strength: number
}

/** 语义层界标（视图渲染层平面+标签的依据） */
export interface Mind3DLayer {
  key: string
  y: number
  count: number
}

export interface Mind3DScene {
  nodes: Mind3DNode[]
  edges: Mind3DEdge[]
  layers: Mind3DLayer[]
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

function layerOf(status: string): number {
  return LAYER_BY_STATUS[status] ?? 0
}

function runTimeKey(r: MindRunDto): string {
  return r.startedAt ?? ''
}

/**
 * 构造 3D 思维场景。
 * @param projection GET /api/graph/mind 的响应（thoughts + runs + available）
 */
export function buildMind3DScene(projection: MindProjectionDto): Mind3DScene {
  const nodes: Mind3DNode[] = []
  const edges: Mind3DEdge[] = []
  const hidden: Record<string, number> = {}

  const { thoughts, runs } = projection

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

  // ── 思想核按层归组：层内按最近活动排序（新在近核、旧在远核） ──
  const layerGroups = new Map<number, MindThoughtDto[]>()
  for (const t of thoughts) {
    const l = layerOf(t.status)
    const list = layerGroups.get(l)
    if (list) list.push(t)
    else layerGroups.set(l, [t])
  }
  for (const list of layerGroups.values()) {
    list.sort((a, b) => {
      const ra = byThought.get(a.id)?.[0]
      const rb = byThought.get(b.id)?.[0]
      return runTimeKey(rb ?? ({} as MindRunDto)).localeCompare(runTimeKey(ra ?? ({} as MindRunDto)))
    })
  }

  const total = thoughts.length
  const MAX_THOUGHTS = 24
  const hiddenThoughts = Math.max(0, total - MAX_THOUGHTS)
  let budget = MAX_THOUGHTS

  // 核心柱（中心轴，贯穿各层）
  nodes.push({
    id: 'core', kind: 'core', x: 0, y: MIND3D_LAYER_GAP * 1.5, z: 0, r: 16,
    status: 'running', label: 'mind', strength: 1, pulse: true, layer: 1.5 as never,
  })

  const layers: Mind3DLayer[] = [...layerGroups.entries()]
    .map(([l, list]) => ({ key: layerKey(l), y: l * MIND3D_LAYER_GAP, count: list.length }))
    .sort((a, b) => b.y - a.y)

  // ── 思想核落位：层内平面散布（极坐标 + 哈希稳定散点，不跳位） ──
  for (const [layer, group] of [...layerGroups.entries()].sort((a, b) => b[0] - a[0])) {
    const shown = group.slice(0, Math.max(0, budget))
    budget -= shown.length
    const count = shown.length
    shown.forEach((t, i) => {
      // 层内角度均布 + 半径递进（新在近核、旧在远核）+ 稳定抖动
      const angle = count > 0 ? (i * Math.PI * 2) / count + hash01(`a:${t.id}`) * 0.5 : 0
      const radius = 60 + (MIND3D_PLANE_R - 60) * (count > 1 ? i / (count - 1) : 0.5) + hash01(`r:${t.id}`) * 30
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const y = layer * MIND3D_LAYER_GAP
      const thoughtRuns = byThought.get(t.id) ?? []
      const running = t.status === 'running' || thoughtRuns.some(r => r.status === 'running')
      const awaiting = t.status === 'awaiting-review' || thoughtRuns.some(r => r.status === 'awaiting-input')
      const thoughtId = `thought:${t.id}`
      nodes.push({
        id: thoughtId,
        kind: 'thought',
        x, y, z,
        // 半径解耦（2026-09-15 规划）：半径只承载「体量」（运行史规模），
        // 状态归色相、活跃归高度层、待介入归雷达脉冲环——不再一身二任。
        r: 9 + Math.min(thoughtRuns.length, 8) * 0.9,
        status: t.status,
        label: t.title,
        sub: thoughtRuns.length > 0 ? `×${thoughtRuns.length}` : undefined,
        strength: strengthOf(t.status),
        pulse: running,
        layer,
        // 待介入（审批/待审）路由进介入中心（A3 审批负载）；其余进工作项预选
        to: awaiting
          ? { name: 'ia2.inbox', query: { task: t.id } }
          : { name: 'ia2.tasks', query: { task: t.id } },
        highlight: awaiting,
        // 待介入专属通道：雷达脉冲环（跨房间召唤注意力；与 running 的呼吸脉冲分家）
        pendingAlert: awaiting,
        // 区内时序显式化：径向距核距离（新近核、旧远核；进图例）
        radialRecency: Math.hypot(x, z),
      })

      // 关系：核心柱 → 任务（孕育）
      const plasticity = Math.min(thoughtRuns.length, 6) / 6
      edges.push({
        id: `core->${thoughtId}`,
        from: 'core', to: thoughtId,
        fromPos: { x: 0, y: MIND3D_LAYER_GAP * 1.5, z: 0 },
        toPos: { x, y, z },
        status: t.status,
        flow: running,
        strength: Math.max(0.3, strengthOf(t.status) * 0.5 + plasticity * 0.5),
      })

      // ── 末梢运行（任务产生，附属点环绕任务节点） ──
      const shownRuns = thoughtRuns.slice(0, 4)
      hidden[thoughtId] = Math.max(0, thoughtRuns.length - shownRuns.length)
      shownRuns.forEach((run, j) => {
        const orbitAngle = (j * Math.PI * 2) / shownRuns.length + hash01(`o:${run.runId}`) * 0.6
        const orbitR = MIND3D_RUN_ORBIT + Math.min(run.durationSec * 0.02, 20)
        const rx = x + Math.cos(orbitAngle) * orbitR
        const rz = z + Math.sin(orbitAngle) * orbitR
        const ry = y + (hash01(`y:${run.runId}`) - 0.5) * 16
        const runId = `run:${run.runId}`
        const isRunning = run.status === 'running'
        const isAwaiting = run.status === 'awaiting-input'
        nodes.push({
          id: runId,
          kind: 'run',
          x: rx, y: ry, z: rz,
          r: isRunning ? 5 : 3.5,
          status: run.status,
          label: run.runId.slice(-4),
          sub: formatRunDuration(run.durationSec),
          strength: strengthOf(run.status),
          pulse: isRunning,
          layer,
          to: { name: 'ia2.tasks', query: { task: run.thoughtId } },
          highlight: isAwaiting,
        })
        edges.push({
          id: `${thoughtId}->${runId}`,
          from: thoughtId, to: runId,
          fromPos: { x, y, z },
          toPos: { x: rx, y: ry, z: rz },
          status: run.status,
          flow: isRunning,
          strength: strengthOf(run.status) * 0.8,
        })
      })
    })
  }

  // ── 任务关系边（父子/委派，A2）：task_links 投影为思想核之间的有向语义边 ──
  const nodePosById = new Map(nodes.map(n => [n.id, n]))
  for (const rel of projection.relations ?? []) {
    const parent = nodePosById.get(`thought:${rel.parentId}`)
    const child = nodePosById.get(`thought:${rel.childId}`)
    if (!parent || !child) continue // 被折叠/上限裁掉的端点不画
    edges.push({
      id: `rel:${rel.parentId}->${rel.childId}`,
      from: parent.id, to: child.id,
      fromPos: { x: parent.x, y: parent.y, z: parent.z },
      toPos: { x: child.x, y: child.y, z: child.z },
      status: 'delegate',
      flow: false,
      strength: 0.55,
    })
  }

  return { nodes, edges, layers, hiddenThoughts }
}

function layerKey(layer: number): string {
  switch (layer) {
    case 3: return 'running'
    case 2: return 'awaiting'
    case 1: return 'done'
    default: return 'idle'
  }
}

function formatRunDuration(sec: number): string | undefined {
  if (!Number.isFinite(sec) || sec <= 0) return undefined
  if (sec < 60) return `${Math.round(sec)}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  return `${Math.floor(sec / 3600)}h${Math.floor((sec % 3600) / 60)}m`
}
