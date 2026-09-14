// overlay/custom/client/ia2/adapters/growth.ts
// 循环生长图纯投影：loops × runs → SVG 场景（节点/边/溢出计数）。
// 纪律：零 DOM、零 store——视图只喂数据，本文件只做确定性布局
// （同一输入必产同一场景；布局参数集中此处，视图不参与计算）。
//
// 布局模型（viewBox 1000×640，极坐标）：
//   核心 Core 居中常脉动；loop 与 seed（graphId 无对应 loop 的自建图运行）落内环
//   R_RING=150，按状态活跃度排序分布（running 在前）；每个循环的 run 生长为向外
//   分支——分支端点半径 = R_BASE + 阶段序号×R_STAGE_STEP + min(迭代,5)×8，
//   即「阶段推进 = 肉眼可见的生长」。run.graphId 即 loop id（RunCenterView 深链
//   同一事实源）；无对应 loop 的 graphId 归 seed 扇区。
import type { LoopInstance } from '@/custom/loop/types'
import type { RunSummary } from '@/custom/loop/runcenter/types'

export const GROWTH_VIEW_W = 1000
export const GROWTH_VIEW_H = 640

/** 单扇区展示的最近 run 数上限（更旧折叠为 overflow 计数） */
export const RUNS_PER_SECTOR = 5

/** 扇区（loop+seed 合计）展示上限（更旧的 loop 整体折叠进 hiddenLoops） */
export const MAX_SECTORS = 16

const R_CORE = 26
const R_RING = 150
const R_BASE = 205
const R_STAGE_STEP = 52
const R_ITER_STEP = 8

/** 业务阶段 → 半径步进序号（null/未知回退 0：刚发芽） */
const STAGE_ORDER: Record<string, number> = {
  discovery: 0,
  handoff: 1,
  validation: 2,
  persistence: 3,
  gate: 4,
  stop: 5,
}

/** 状态 → 扇区排序权重（活跃在前；driving 内环语义） */
const STATUS_RANK: Record<string, number> = {
  running: 0,
  'awaiting-input': 1,
  'awaiting-review': 1,
  blocked: 2,
  paused: 3,
  idle: 4,
  failed: 5,
  completed: 6,
  unknown: 7,
}

export type GrowthNodeKind = 'core' | 'loop' | 'seed' | 'run'

export interface GrowthNavTarget {
  name: string
  params?: Record<string, string>
  query?: Record<string, string>
}

export interface GrowthNode {
  id: string
  kind: GrowthNodeKind
  x: number
  y: number
  r: number
  status: string
  label: string
  /** 次行信息（loop=阶段文案键名；run=`stage·iter`） */
  sub?: string
  /** 运行中 → 呼吸脉冲 */
  pulse: boolean
  /** 点击导航目标（core 无） */
  to?: GrowthNavTarget
}

export interface GrowthEdge {
  id: string
  from: string
  to: string
  /** SVG path d */
  d: string
  status: string
  /** running → 沿边粒子流 */
  flow: boolean
}

export interface GrowthScene {
  width: number
  height: number
  nodes: GrowthNode[]
  edges: GrowthEdge[]
  /** 扇区 id → 折叠的更旧 run 数 */
  overflow: Record<string, number>
  /** 超出 MAX_SECTORS 未展示的 loop 数 */
  hiddenLoops: number
}

/** FNV-1a —— id → 稳定抖动（跨渲染不跳位） */
function hash01(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return ((h >>> 0) % 10_000) / 10_000
}

function rank(status: string): number {
  return STATUS_RANK[status] ?? 7
}

function stageIndex(stage: string | null | undefined): number {
  if (!stage) return 0
  return STAGE_ORDER[stage] ?? 0
}

function polar(cx: number, cy: number, angle: number, radius: number): { x: number; y: number } {
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius }
}

function runActivityKey(r: RunSummary): string {
  return r.lastActivityAt ?? r.updatedAt ?? ''
}

/**
 * 构造生长场景。
 * @param loops 全量循环（store.loops 原样）
 * @param runs  运行列表（store.runs 原样；graphId 分组）
 */
export function buildGrowthScene(loops: LoopInstance[], runs: RunSummary[]): GrowthScene {
  const cx = GROWTH_VIEW_W / 2
  const cy = GROWTH_VIEW_H / 2
  const nodes: GrowthNode[] = []
  const edges: GrowthEdge[] = []
  const overflow: Record<string, number> = {}

  // ── run 按 graphId 分组（组内最新在前） ──
  const byGraph = new Map<string, RunSummary[]>()
  for (const run of runs) {
    const key = run.graphId || '(unknown)'
    const list = byGraph.get(key)
    if (list) list.push(run)
    else byGraph.set(key, [run])
  }
  for (const list of byGraph.values()) {
    list.sort((a, b) => runActivityKey(b).localeCompare(runActivityKey(a)))
  }

  // ── 扇区：loops（活跃度排序）+ seeds（未知 graphId，按最近活动排序） ──
  const knownLoopIds = new Set(loops.map(l => l.id))
  const sortedLoops = [...loops].sort((a, b) =>
    rank(a.status) - rank(b.status) || a.name.localeCompare(b.name))
  const seedIds = [...byGraph.keys()]
    .filter(id => !knownLoopIds.has(id) && id !== '(unknown)')
    .sort((a, b) => {
      const ra = byGraph.get(a)![0]
      const rb = byGraph.get(b)![0]
      return runActivityKey(rb).localeCompare(runActivityKey(ra))
    })

  const hiddenLoops = Math.max(0, sortedLoops.length + seedIds.length - MAX_SECTORS)
  const sectors: Array<{ id: string; label: string; status: string; sub?: string; isLoop: boolean; runs: RunSummary[] }> = []
  for (const loop of sortedLoops.slice(0, MAX_SECTORS)) {
    sectors.push({
      id: loop.id,
      label: loop.name,
      status: loop.status,
      sub: loop.stage,
      isLoop: true,
      runs: byGraph.get(loop.id) ?? [],
    })
  }
  const seedSlots = Math.max(0, MAX_SECTORS - sectors.length)
  for (const id of seedIds.slice(0, seedSlots)) {
    const list = byGraph.get(id)!
    sectors.push({
      id,
      label: id,
      status: list[0]?.status ?? 'idle',
      sub: undefined,
      isLoop: false,
      runs: list,
    })
  }

  const core: GrowthNode = {
    id: 'core',
    kind: 'core',
    x: cx,
    y: cy,
    r: R_CORE,
    status: 'running',
    label: 'core',
    pulse: true,
  }
  nodes.push(core)

  const n = sectors.length
  sectors.forEach((sector, i) => {
    // 扇区角：偶布 + id 稳定抖动（±35% 扇区角内），-90° 起排
    const sectorAngle = n > 0 ? (Math.PI * 2) / n : Math.PI * 2
    const jitter = (hash01(sector.id) - 0.5) * sectorAngle * 0.7
    const baseAngle = -Math.PI / 2 + i * sectorAngle + sectorAngle / 2 + jitter
    const pos = polar(cx, cy, baseAngle, R_RING)

    const sectorStatus = sector.isLoop ? sector.status : (sector.runs[0]?.status ?? 'idle')
    const sectorId = sector.isLoop ? `loop:${sector.id}` : `seed:${sector.id}`
    nodes.push({
      id: sectorId,
      kind: sector.isLoop ? 'loop' : 'seed',
      x: pos.x,
      y: pos.y,
      r: sectorStatus === 'running' ? 17 : 13,
      status: sectorStatus,
      label: sector.label,
      sub: sector.sub,
      pulse: sectorStatus === 'running',
      to: { name: 'ia2.runs', query: { loop: sector.id } },
    })

    // core → 扇区 根边（径向缓曲线）
    const c1 = polar(cx, cy, baseAngle, R_RING * 0.42)
    edges.push({
      id: `core->${sectorId}`,
      from: 'core',
      to: sectorId,
      d: `M ${cx.toFixed(1)} ${cy.toFixed(1)} C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)}, ${pos.x.toFixed(1)} ${pos.y.toFixed(1)}, ${pos.x.toFixed(1)} ${pos.y.toFixed(1)}`,
      status: sectorStatus,
      flow: sectorStatus === 'running',
    })

    // 扇区 → run 生长分支（每 run 一支，最新居中向两侧展开）
    const visible = sector.runs.slice(0, RUNS_PER_SECTOR)
    overflow[sectorId] = Math.max(0, sector.runs.length - visible.length)
    const spread = Math.min(sectorAngle * 0.72 / RUNS_PER_SECTOR, 0.16)
    visible.forEach((run, j) => {
      // 最新（j=0）落扇区轴心，更旧的交替向两侧展开（j=1 负侧、j=2 正侧…）
      const slot = Math.ceil(j / 2)
      const offset = slot * (j % 2 === 1 ? -1 : 1)
      const angle = baseAngle + offset * spread
      const radius = R_BASE + stageIndex(run.stage) * R_STAGE_STEP + Math.min(run.iteration, 5) * R_ITER_STEP
      const tip = polar(cx, cy, angle, radius)
      const nodeId = `run:${run.runId}`
      nodes.push({
        id: nodeId,
        kind: 'run',
        x: tip.x,
        y: tip.y,
        r: run.status === 'running' ? 7 : 5.5,
        status: run.status,
        label: run.runId.slice(-4),
        sub: run.stage ? `${run.stage}·${run.iteration}` : `·${run.iteration}`,
        pulse: run.status === 'running',
        to: { name: 'ia2.runDetail', params: { runId: run.runId } },
      })
      // 扇区节点外缘出发 → tip：控制点径向分布，扇形展开
      const start = polar(cx, cy, baseAngle, R_RING + 18)
      const cA = polar(cx, cy, baseAngle + (angle - baseAngle) * 0.25, R_RING + (radius - R_RING) * 0.35)
      const cB = polar(cx, cy, baseAngle + (angle - baseAngle) * 0.85, R_RING + (radius - R_RING) * 0.86)
      edges.push({
        id: `${sectorId}->${nodeId}`,
        from: sectorId,
        to: nodeId,
        d: `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} C ${cA.x.toFixed(1)} ${cA.y.toFixed(1)}, ${cB.x.toFixed(1)} ${cB.y.toFixed(1)}, ${tip.x.toFixed(1)} ${tip.y.toFixed(1)}`,
        status: run.status,
        flow: run.status === 'running',
      })
    })
  })

  return { width: GROWTH_VIEW_W, height: GROWTH_VIEW_H, nodes, edges, overflow, hiddenLoops }
}
