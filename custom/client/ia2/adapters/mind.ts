// overlay/custom/client/ia2/adapters/mind.ts
// 思维大脑纯投影：loops × runs → 活动思维网络（核心神经元/突触/记忆脉冲）。
// 用户裁决（2026-09-15）：循环驾驶舱是一个动态增长的活动思维大脑——自适应生长，
// 不需要人工编排。视图零几何决策：全部布局/形态由本文件确定性产出
// （同一输入必产同一画面；id 哈希驱动稳定散点，跨渲染不跳位）。
//
// 模型（viewBox 1000×640，视口即大脑的有机皮层场）：
//   核心神经元 Core 居中（外壳膜波纹 + 核呼吸）；
//   思想 = 循环（loop）与自建图（seed，graphId 无对应 loop 的运行）——核心神经元，
//     内散布圈带稳定哈希定位，状态决定强度/微漂频率；运行时火光脉冲；
//   突触 = 每 run 一支末梢分支（神经束发散 1..3 条），分支规模随 run 规模/阶段
//     推进壮大（半径×阶段阻尼系数的复合增长，见 runBranchRadius）；
//   突触可塑性：复用强度（本轮可用的代理信号 = 最近运行数）让常用通路视觉增强
//     （边宽与不透明度正比次数，新突触细如丝）；
//   时间记忆（生长感来源）：事件不直接画，而是脉冲浮现并缓慢褪色——pendingApprovals
//     为尖峰信号、迭代新增为涌现、长时间停滞入静止态。
//
// 无图的"生长"禁忌：任何 run 一旦有了 stage/iteration 即推进半径，但绝不硬连
// 阶段节点——阶段是骨架之内的演进，不人造编排节点。
import type { LoopInstance } from '@/custom/loop/types'
import type { RunSummary } from '@/custom/loop/runcenter/types'

export const MIND_VIEW_W = 1000
export const MIND_VIEW_H = 640

/** 单扇区展示的最近 run 数上限（更旧折叠为 overflow 计数） */
export const RUNS_PER_SECTOR = 5
/** 思想核扇区展示上限（超出折叠进 hiddenLoops） */
export const MAX_SECTORS = 16

const CX = MIND_VIEW_W / 2
const CY = MIND_VIEW_H / 2

/** 阶段 → 生长权重（骨架内推进；未知/ null 退化为芽） */
const STAGE_WEIGHT: Record<string, number> = {
  discovery: 0.14,
  handoff: 0.34,
  validation: 0.55,
  persistence: 0.74,
  gate: 0.88,
  stop: 1.0,
}

/** 突触可塑性：run 分支按阶段权重 + 迭代加成的最大半径基准 */
const BRANCH_MAX_RADIUS = 258
/** 新/未知阶段的萌发半径（不长成整数 0 的死亡枝） */
const BRANCH_SPROUT_RADIUS = 150

/** 状态 → 强度映射（活跃越强，粒子/脉冲越明显） */
const STATUS_STRENGTH: Record<string, number> = {
  running: 1.0,
  'awaiting-input': 0.82,
  'awaiting-review': 0.72,
  blocked: 0.66,
  failed: 0.5,
  paused: 0.42,
  completed: 0.34,
  idle: 0.28,
  unknown: 0.24,
}

export type MindNodeKind = 'core' | 'loop' | 'seed' | 'run'
export type MindNodeShape = 'blob' | 'beam'

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
  /** 强度 0..1（粒子数/发光深度共用驱动） */
  strength: number
  /** 运行中 → 呼吸脉冲 */
  pulse: boolean
  /** 脑区微漂相位（秒级视角下的循环摆动基频；非运动轨迹） */
  driftHz: number
  /** 点击导航目标（core 无） */
  to?: MindNavTarget
  /** 待介入是否尖峰（高亮外环） */
  highlight?: boolean
}

export interface MindEdge {
  id: string
  from: string
  to: string
  /** SVG path d（有机曲率） */
  d: string
  status: string
  /** running → 沿边粒子流 */
  flow: boolean
  /** 突触可塑性：复用强度 0..1（新突触细如丝） */
  strength: number
  /** 分支束发散度：束内序号 0/1/2（run 分支最多 3 条） */
  branchNo: number
}

export interface MindPulse {
  id: string
  nodeId: string
  kind: 'spark' | 'interrupt' | 'emerge'
  delayS: number
}

export interface MindScene {
  width: number
  height: number
  nodes: MindNode[]
  edges: MindEdge[]
  pulses: MindPulse[]
  /** 扇区 id → 折叠的更旧 run 数 */
  overflow: Record<string, number>
  hiddenLoops: number
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

function stageWeight(stage: string | null | undefined): number {
  if (!stage) return 0
  return STAGE_WEIGHT[stage] ?? 0
}

/** 分支半径：复用可塑性基准 × 阶段权重 + 迭代加成（带封顶的有机生长） */
function runBranchRadius(stage: string | null | undefined, iteration: number): number {
  const stageR = BRANCH_SPROUT_RADIUS + stageWeight(stage) * (BRANCH_MAX_RADIUS - BRANCH_SPROUT_RADIUS)
  const iterBoost = Math.min(Math.max(iteration, 0), 8) * 7
  return Math.min(stageR + iterBoost, BRANCH_MAX_RADIUS + 46)
}

/** 圆形域上的稳定有机偏移（run 在扇区扇形内的散点） */
function scatterOffset(id: string, span: number): number {
  return (hash01(`off:${id}`) - 0.5) * span
}

/** 有机曲线：三次贝塞尔，控制点沿弦向轴外随机移（同一 id 恒定） */
function organicPath(
  x0: number, y0: number, x1: number, y1: number,
  bend: number, seed: string,
): string {
  const mx = (x0 + x1) / 2
  const my = (y0 + y1) / 2
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

function runActivityKey(r: RunSummary): string {
  return r.lastActivityAt ?? r.updatedAt ?? ''
}

/**
 * 构造思维场景。
 * @param loops 全量循环（store.loops 原样）
 * @param runs  运行列表（store.runs 原样；graphId 分组）
 */
export function buildMindScene(loops: LoopInstance[], runs: RunSummary[]): MindScene {
  const nodes: MindNode[] = []
  const edges: MindEdge[] = []
  const pulses: MindPulse[] = []
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

  // ── 思想扇区：loops（强度优先）+ seeds ──
  const knownLoopIds = new Set(loops.map(l => l.id))
  const sortedLoops = [...loops].sort((a, b) =>
    strengthOf(b.status) - strengthOf(a.status) || a.name.localeCompare(b.name))
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
      isLoop: false,
      runs: list,
    })
  }

  nodes.push({
    id: 'core',
    kind: 'core',
    x: CX,
    y: CY,
    r: 36,
    status: 'running',
    label: 'mind',
    strength: 1,
    pulse: true,
    driftHz: 0.55,
  })

  const n = sectors.length
  sectors.forEach((sector, i) => {
    const baseAngle = n > 0 ? -Math.PI / 2 + (i * Math.PI * 2) / n + (Math.PI / n) : 0
    const sectorId = sector.isLoop ? `loop:${sector.id}` : `seed:${sector.id}`
    const strength = strengthOf(sector.status)
    // 内散布：极坐标 r 在 [96, 168] 哈希稳定（思想落在皮层带，不是机械环）
    const radius = 96 + hash01(`r:${sector.id}`) * 72
    const x = CX + Math.cos(baseAngle) * radius
    const y = CY + Math.sin(baseAngle) * radius
    const running = sector.status === 'running'
    nodes.push({
      id: sectorId,
      kind: sector.isLoop ? 'loop' : 'seed',
      x,
      y,
      r: running ? 19 : 15,
      status: sector.status,
      label: sector.label,
      sub: sector.sub,
      strength,
      pulse: running,
      driftHz: 0.35 + hash01(`hz:${sector.id}`) * 0.4,
      to: { name: 'ia2.runs', query: { loop: sector.id } },
      highlight: sector.status === 'awaiting-input' || sector.status === 'awaiting-review',
    })

    // 根突触：core → 思想（有机弧线，可塑性由 sector run 数调制）
    const plasticity = Math.min(sector.runs.length, 6) / 6
    edges.push({
      id: `core->${sectorId}`,
      from: 'core',
      to: sectorId,
      d: organicPath(CX, CY, x, y, 0.16 + hash01(`co:${sector.id}`) * 0.1, sector.id),
      status: sector.status,
      flow: running,
      strength: Math.max(0.3, strength * 0.5 + plasticity * 0.5),
      branchNo: 0,
    })
    if (running) {
      pulses.push({ id: `core-spark-${sector.id}`, nodeId: 'core', kind: 'spark', delayS: hash01(`pd:${sector.id}`) * 1.4 })
    }

    // ── run 生长分支（末梢神经束）──
    const visible = sector.runs.slice(0, RUNS_PER_SECTOR)
    overflow[sectorId] = Math.max(0, sector.runs.length - visible.length)
    const spreadBase = 0.24 + (Math.min(sector.runs.length, 6) / 6) * 0.14
    visible.forEach((run, j) => {
      const slot = Math.ceil(j / 2)
      const offset = slot * (j % 2 === 1 ? -1 : 1)
      const spreadAngle = spreadBase * offset + scatterOffset(run.runId, 0.1)
      const angle = baseAngle + spreadAngle
      const radius = runBranchRadius(run.stage, run.iteration)
      const tx = x + Math.cos(angle) * radius * 0.28 // 末梢相对扇区外缘再散开（短束）
      const ty = y + Math.sin(angle) * radius * 0.28
      const runId = `run:${run.runId}`
      nodes.push({
        id: runId,
        kind: 'run',
        x: tx,
        y: ty,
        r: run.status === 'running' ? 7.5 : 5.5,
        status: run.status,
        label: run.runId.slice(-4),
        sub: run.stage ? `${run.stage}·${run.iteration}` : `·${run.iteration}`,
        strength: strengthOf(run.status),
        pulse: run.status === 'running',
        driftHz: 0.5 + hash01(`hz:${run.runId}`) * 0.6,
        to: { name: 'ia2.runDetail', params: { runId: run.runId } },
        highlight: run.status === 'awaiting-input' || run.status === 'awaiting-review',
      })

      // 末梢神经束：发散 1..3 条（同一 id 恒定分支数）
      const strands = 1 + Math.floor(hash01(`st:${run.runId}`) * 3)
      for (let b = 0; b < strands; b++) {
        const bend = 0.22 + hash01(`bb:${run.runId}:${b}`) * 0.22
        const edgeId = `${sectorId}->${runId}#${b}`
        edges.push({
          id: edgeId,
          from: sectorId,
          to: runId,
          d: organicPath(x, y, tx, ty, bend, `${run.runId}#${b}`),
          status: run.status,
          flow: run.status === 'running',
          strength: strengthOf(run.status) * (0.55 + (b / strands) * 0.45),
          branchNo: b,
        })
      }
      if (run.status === 'running') {
        pulses.push({ id: `spark-${run.runId}`, nodeId: runId, kind: 'spark', delayS: hash01(`rd:${run.runId}`) * 1.8 })
      } else if (run.status === 'awaiting-input' || run.status === 'awaiting-review') {
        pulses.push({ id: `int-${run.runId}`, nodeId: runId, kind: 'interrupt', delayS: hash01(`rd:${run.runId}`) * 2.2 })
      }
    })
  })

  return {
    width: MIND_VIEW_W,
    height: MIND_VIEW_H,
    nodes,
    edges,
    pulses,
    overflow,
    hiddenLoops,
  }
}
