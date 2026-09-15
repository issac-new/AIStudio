// overlay/custom/client/ia2/adapters/mind.ts
// 思维大脑纯投影（2026-09-15 本体论重设计）：思维投影 → 语义分区的思维图谱。
// 用户裁决：核心思维图需按本体论重新设计——不再是美学网络，而是显式的
// 实体→关系→状态→时间 分层语义图。
//
// 本体论分层（视图零几何决策，全部确定性产出）：
//   实体：任务（思想核）+ 运行尝试（末梢）——两类一等实体；
//   关系：核心→任务（孕育）、任务→运行（产生）——有向语义边；
//   状态：进行中（上盘区）/ 待介入（中区）/ 已完成（右下）/ 失败（左下）/ 静止（外盘）——
//     按状态分区落位，同色即同状态，一眼读出「什么在跑/什么卡了/什么完了」；
//   时间：同区内按最近活动排序（新在内、旧在外），生长感来自时序沉淀。
// 类型纪律（对照 runcenter/types.ts）：与 /api/graph/mind 的跨层契约只共享结构
// 不共享模块——本文件本地声明最小形状，避免 custom→server import（符号链接断链）。

/** 服务端投影：思想核（kanban task 投影） */
export interface MindThoughtDto {
  id: string
  title: string
  status: 'running' | 'blocked' | 'awaiting-review' | 'completed' | 'idle' | 'archived'
  createdAt: string | null
  board: string | null
}

/** 服务端投影：突触末梢（kanban task_run 投影） */
export interface MindRunDto {
  runId: string
  thoughtId: string
  status: 'running' | 'completed' | 'failed' | 'awaiting-input' | 'idle'
  durationSec: number
  startedAt: string | null
  endedAt: string | null
  outcome: string | null
  summary: string | null
}

export interface MindProjectionDto {
  thoughts: MindThoughtDto[]
  runs: MindRunDto[]
  available: boolean
}

export const MIND_VIEW_W = 1000
export const MIND_VIEW_H = 640

/** 单思想核展示的最近运行数上限（更旧折叠为 overflow 计数） */
export const RUNS_PER_THOUGHT = 4
/** 思想核展示上限（超出折叠进 hiddenThoughts） */
export const MAX_THOUGHTS = 24

const CX = MIND_VIEW_W / 2
const CY = MIND_VIEW_H / 2

/** 本体论分区：状态 → 扇区角范围（弧度）+ 半径带。按语义布局，非同环。 */
const ZONE_BY_STATUS: Record<string, { a0: number; a1: number; r0: number; r1: number; label: string }> = {
  running:         { a0: -Math.PI * 0.55, a1: -Math.PI * 0.05, r0: 100, r1: 200, label: 'running' },
  'awaiting-review': { a0: -Math.PI * 0.05, a1: Math.PI * 0.25, r0: 100, r1: 190, label: 'awaiting' },
  'awaiting-input':  { a0: -Math.PI * 0.05, a1: Math.PI * 0.25, r0: 100, r1: 190, label: 'awaiting' },
  blocked:         { a0: Math.PI * 0.25, a1: Math.PI * 0.55, r0: 100, r1: 190, label: 'blocked' },
  failed:          { a0: Math.PI * 0.55, a1: Math.PI * 0.95, r0: 110, r1: 220, label: 'failed' },
  completed:       { a0: Math.PI * 0.95, a1: Math.PI * 1.45, r0: 110, r1: 210, label: 'completed' },
  idle:            { a0: Math.PI * 1.45, a1: Math.PI * 1.95, r0: 140, r1: 240, label: 'idle' },
  archived:        { a0: Math.PI * 1.45, a1: Math.PI * 1.95, r0: 230, r1: 260, label: 'archived' },
  unknown:         { a0: Math.PI * 1.45, a1: Math.PI * 1.95, r0: 140, r1: 240, label: 'idle' },
}

/** 状态 → 强度（粒子/发光驱动） */
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

export type MindNodeKind = 'core' | 'thought' | 'run'

export interface MindNavTarget {
  name: string
  params?: Record<string, string>
  query?: Record<string, string>
}

export interface MindNode {
  id: string
  kind: MindNodeKind
  x: number
  y: number
  r: number
  status: string
  label: string
  sub?: string
  strength: number
  pulse: boolean
  driftHz: number
  to?: MindNavTarget
  highlight?: boolean
  /** 本体论分区名（视图着色/图例用） */
  zone: string
}

export interface MindEdge {
  id: string
  from: string
  to: string
  d: string
  status: string
  flow: boolean
  strength: number
  branchNo: number
}

export interface MindPulse {
  id: string
  nodeId: string
  kind: 'spark' | 'interrupt' | 'emerge'
  delayS: number
}

/** 分区界标（视图渲染分区弧+语义标签的依据） */
export interface MindZone {
  key: string
  label: string
  a0: number
  a1: number
  r0: number
  r1: number
  count: number
}

export interface MindScene {
  width: number
  height: number
  nodes: MindNode[]
  edges: MindEdge[]
  pulses: MindPulse[]
  zones: MindZone[]
  overflow: Record<string, number>
  hiddenThoughts: number
}

/** FNV-1a —— id → 稳定散点（同一 id 恒定，跨渲染不跳位） */
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

function zoneOf(status: string): { a0: number; a1: number; r0: number; r1: number; label: string } {
  return ZONE_BY_STATUS[status] ?? ZONE_BY_STATUS.idle
}

/** 末梢半径：运行时长驱动的生长（线性+封顶，单调可辨） */
function runBranchRadius(durationSec: number): number {
  const base = 150
  const growth = Math.min(Math.max(durationSec, 0) * 0.05, 150)
  return base + growth
}

/** 运行时长 → 可读标签 */
function formatRunDuration(sec: number): string | undefined {
  if (!Number.isFinite(sec) || sec <= 0) return undefined
  if (sec < 60) return `${Math.round(sec)}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  return `${Math.floor(sec / 3600)}h${Math.floor((sec % 3600) / 60)}m`
}

/** 有机曲线：三次贝塞尔，控制点沿弦向轴外随机移（同一 id 恒定） */
function organicPath(
  x0: number, y0: number, x1: number, y1: number,
  bend: number, seed: string,
): string {
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const k = (hash01(`bend:${seed}`) - 0.5) * 2 * bend * len
  const q = 0.22 + hash01(`splay:${seed}`) * 0.12
  const c1x = x0 + dx * q + nx * k
  const c1y = y0 + dy * q + ny * k
  const c2x = x0 + dx * (1 - q) + nx * k
  const c2y = y0 + dy * (1 - q) + ny * k
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`
}

function runTimeKey(r: MindRunDto): string {
  return r.startedAt ?? ''
}

/**
 * 构造思维图谱（本体论分区版）。
 * @param projection GET /api/graph/mind 的响应（thoughts + runs + available）
 */
export function buildMindScene(projection: MindProjectionDto): MindScene {
  const nodes: MindNode[] = []
  const edges: MindEdge[] = []
  const pulses: MindPulse[] = []
  const overflow: Record<string, number> = []

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

  // ── 思想核按分区归组：每区内按最近活动排序（新在内、旧在外） ──
  const zoneGroups = new Map<string, MindThoughtDto[]>()
  for (const t of thoughts) {
    const z = zoneOf(t.status).label
    const list = zoneGroups.get(z)
    if (list) list.push(t)
    else zoneGroups.set(z, [t])
  }
  for (const list of zoneGroups.values()) {
    list.sort((a, b) => {
      const ra = byThought.get(a.id)?.[0]
      const rb = byThought.get(b.id)?.[0]
      return runTimeKey(rb ?? ({} as MindRunDto)).localeCompare(runTimeKey(ra ?? ({} as MindRunDto)))
    })
  }

  // ── 分区界标（视图渲染分区弧 + 语义标签） ──
  const zoneCount = new Map<string, number>()
  for (const t of thoughts) {
    const z = zoneOf(t.status).label
    zoneCount.set(z, (zoneCount.get(z) ?? 0) + 1)
  }
  const zones: MindZone[] = [...new Set(Object.values(ZONE_BY_STATUS).map(z => z.label))]
    .map(label => {
      const spec = Object.values(ZONE_BY_STATUS).find(z => z.label === label)!
      return { key: label, label, a0: spec.a0, a1: spec.a1, r0: spec.r0, r1: spec.r1, count: zoneCount.get(label) ?? 0 }
    })
    .filter(z => z.count > 0)

  // ── 思想核落位：分区内极坐标均布 + 半径带内按序递进 ──
  const total = thoughts.length
  const hiddenThoughts = Math.max(0, total - MAX_THOUGHTS)
  let budget = MAX_THOUGHTS
  const placed: Array<{ t: MindThoughtDto; x: number; y: number; zoneLabel: string }> = []

  for (const zone of zones) {
    const group = (zoneGroups.get(zone.key) ?? []).slice(0, Math.max(0, budget))
    budget -= group.length
    const spec = zoneOf(group[0]?.status ?? 'idle')
    const count = group.length
    group.forEach((t, i) => {
      // 区内角度均布 + 半径由内向外递进（新在内、旧在外）
      const angle = count > 0
        ? spec.a0 + (spec.a1 - spec.a0) * ((i + 0.5) / count)
        : (spec.a0 + spec.a1) / 2
      const radius = spec.r0 + (spec.r1 - spec.r0) * (count > 1 ? i / (count - 1) : 0.5)
      placed.push({ t, x: CX + Math.cos(angle) * radius, y: CY + Math.sin(angle) * radius, zoneLabel: zone.key })
    })
  }

  nodes.push({
    id: 'core', kind: 'core', x: CX, y: CY, r: 34,
    status: 'running', label: 'mind', strength: 1, pulse: true, driftHz: 0.55, zone: 'core',
  })

  for (const { t, x, y, zoneLabel } of placed) {
    const thoughtId = `thought:${t.id}`
    const strength = strengthOf(t.status)
    const thoughtRuns = byThought.get(t.id) ?? []
    const running = t.status === 'running' || thoughtRuns.some(r => r.status === 'running')
    const awaiting = t.status === 'awaiting-review' || thoughtRuns.some(r => r.status === 'awaiting-input')
    nodes.push({
      id: thoughtId,
      kind: 'thought',
      x, y,
      r: running ? 18 : 14,
      status: t.status,
      label: t.title,
      sub: thoughtRuns.length > 0 ? `×${thoughtRuns.length}` : undefined,
      strength,
      pulse: running,
      driftHz: 0, // 本体论版去漂移——语义分区稳定性优先于美学动感
      to: { name: 'ia2.tasks', query: { task: t.id } },
      highlight: awaiting,
      zone: zoneLabel,
    })

    // 关系边：core → 任务（孕育）。边宽 = 该任务近期运行数（可塑性语义）。
    const plasticity = Math.min(thoughtRuns.length, 6) / 6
    edges.push({
      id: `core->${thoughtId}`,
      from: 'core', to: thoughtId,
      d: organicPath(CX, CY, x, y, 0.14, t.id),
      status: t.status,
      flow: running,
      strength: Math.max(0.3, strength * 0.5 + plasticity * 0.5),
      branchNo: 0,
    })
    if (running) {
      pulses.push({ id: `core-spark-${t.id}`, nodeId: 'core', kind: 'spark', delayS: hash01(`pd:${t.id}`) * 1.4 })
    }

    // ── 末梢运行（任务产生）──
    const shown = thoughtRuns.slice(0, RUNS_PER_THOUGHT)
    overflow[thoughtId] = Math.max(0, thoughtRuns.length - shown.length)
    shown.forEach((run, j) => {
      // 末梢在思想核外侧短距散开（语义：属于该任务）
      const angle = hash01(`a:${run.runId}`) * Math.PI * 2
      const radius = 28 + runBranchRadius(run.durationSec) * 0.12
      const tx = x + Math.cos(angle) * radius
      const ty = y + Math.sin(angle) * radius
      const runId = `run:${run.runId}`
      const isRunning = run.status === 'running'
      const isAwaiting = run.status === 'awaiting-input'
      nodes.push({
        id: runId,
        kind: 'run',
        x: tx, y: ty,
        r: isRunning ? 7 : 5,
        status: run.status,
        label: run.runId.slice(-4),
        sub: formatRunDuration(run.durationSec),
        strength: strengthOf(run.status),
        pulse: isRunning,
        driftHz: 0,
        to: { name: 'ia2.tasks', query: { task: run.thoughtId } },
        highlight: isAwaiting,
        zone: zoneOf(run.status === 'running' ? 'running' : run.status === 'awaiting-input' ? 'awaiting-input' : 'idle').label,
      })
      edges.push({
        id: `${thoughtId}->${runId}`,
        from: thoughtId, to: runId,
        d: organicPath(x, y, tx, ty, 0.2, run.runId),
        status: run.status,
        flow: isRunning,
        strength: strengthOf(run.status) * 0.8,
        branchNo: 0,
      })
      if (isRunning) {
        pulses.push({ id: `spark-${run.runId}`, nodeId: runId, kind: 'spark', delayS: hash01(`rd:${run.runId}`) * 1.8 })
      } else if (isAwaiting) {
        pulses.push({ id: `int-${run.runId}`, nodeId: runId, kind: 'interrupt', delayS: hash01(`rd:${run.runId}`) * 2.2 })
      }
    })
  }

  return {
    width: MIND_VIEW_W, height: MIND_VIEW_H,
    nodes, edges, pulses, zones, overflow, hiddenThoughts,
  }
}
