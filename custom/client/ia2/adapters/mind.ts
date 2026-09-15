// overlay/custom/client/ia2/adapters/mind.ts
// 思维大脑纯投影：思维投影（kanban 思想核 + 突触末梢）→ 活动思维网络场景。
// 用户裁决（2026-09-15）：循环驾驶舱是一个动态增长的活动思维大脑——基于已有
// 任务的运行数据长成，自适应生长，不需要人工编排。视图零几何决策：全部布局/
// 形态由本文件确定性产出（同一输入必产同一画面；id 哈希驱动稳定散点，不跳位）。
//
// 数据源：GET /api/graph/mind（kanban tasks/task_runs 只读投影，见
// custom/server/loop/graph/mind-projection.ts）。thought = 任务（思想核），
// run = 任务的一次运行尝试（突触末梢）。
//
// 模型（viewBox 1000×640，视口即大脑的有机皮层场）：
//   核心神经元 Core 居中（外壳膜波纹 + 核呼吸）；
//   思想核在皮层散布带（半径 96..168 哈希稳定定位），状态决定强度/发光；
//   突触 = 每次运行尝试一支末梢神经束（1..3 条有机曲线），分支半径随运行时长
//     生长（运行越久枝越长 = 真实活动的体量），失败是红色断突（大脑记住失败）；
//   突触可塑性：思想核的近期运行次数驱动根突触边宽（常用通路增强）；
//   记忆脉冲：进行中/待介入的运行产生浮现→褪色的脉冲（时间生长感）。
//
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
export const RUNS_PER_THOUGHT = 5
/** 思想核展示上限（超出折叠进 hiddenThoughts） */
export const MAX_THOUGHTS = 16

const CX = MIND_VIEW_W / 2
const CY = MIND_VIEW_H / 2

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
  archived: 0.2,
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

export interface MindScene {
  width: number
  height: number
  nodes: MindNode[]
  edges: MindEdge[]
  pulses: MindPulse[]
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

/** 末梢半径：运行时长驱动的有机生长（越久越长，封顶防溢出视口） */
function runBranchRadius(durationSec: number): number {
  const base = 150
  // 线性生长（每秒 0.05px），约 50 分钟运行后封顶——视口内可辨识的单调生长
  const growth = Math.min(Math.max(durationSec, 0) * 0.05, 150)
  return base + growth
}

function scatterOffset(id: string, span: number): number {
  return (hash01(`off:${id}`) - 0.5) * span
}

/** 运行时长 → 可读标签（末梢副标语义：这条运行跑了多久） */
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

function runTimeKey(r: MindRunDto): string {
  return r.startedAt ?? ''
}

/**
 * 构造思维场景（kanban 投影驱动）。
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

  // ── 思想核排序：活跃优先（有进行中/待介入运行的排前），再按强度 ──
  const thoughtActivity = (t: MindThoughtDto): number => {
    const list = byThought.get(t.id) ?? []
    const live = list.filter(r => r.status === 'running' || r.status === 'awaiting-input').length
    return live * 100 + strengthOf(t.status) * 10 + Math.min(list.length, 9)
  }
  const sorted = [...thoughts].sort((a, b) => thoughtActivity(b) - thoughtActivity(a))

  const hiddenThoughts = Math.max(0, sorted.length - MAX_THOUGHTS)
  const visible = sorted.slice(0, MAX_THOUGHTS)

  nodes.push({
    id: 'core', kind: 'core', x: CX, y: CY, r: 36,
    status: 'running', label: 'mind', strength: 1, pulse: true, driftHz: 0.55,
  })

  const n = visible.length
  visible.forEach((thought, i) => {
    const baseAngle = n > 0 ? -Math.PI / 2 + (i * Math.PI * 2) / n + (Math.PI / n) : 0
    const thoughtId = `thought:${thought.id}`
    const strength = strengthOf(thought.status)
    const radius = 96 + hash01(`r:${thought.id}`) * 72
    const x = CX + Math.cos(baseAngle) * radius
    const y = CY + Math.sin(baseAngle) * radius
    const thoughtRuns = byThought.get(thought.id) ?? []
    const running = thought.status === 'running' || thoughtRuns.some(r => r.status === 'running')
    const awaiting = thought.status === 'awaiting-review' || thoughtRuns.some(r => r.status === 'awaiting-input')
    nodes.push({
      id: thoughtId,
      kind: 'thought',
      x, y,
      r: running ? 19 : 15,
      status: thought.status,
      label: thought.title,
      // 语义标签副行：运行计数（×N 次运行）——大脑图谱的有效信息载体
      sub: thoughtRuns.length > 0 ? `×${thoughtRuns.length}` : undefined,
      strength,
      pulse: running,
      driftHz: 0.35 + hash01(`hz:${thought.id}`) * 0.4,
      to: { name: 'ia2.tasks', query: { task: thought.id } },
      highlight: awaiting,
    })

    // 根突触：core → 思想核（可塑性 = 该思想核近期运行次数调制边宽）
    const plasticity = Math.min(thoughtRuns.length, 6) / 6
    edges.push({
      id: `core->${thoughtId}`,
      from: 'core', to: thoughtId,
      d: organicPath(CX, CY, x, y, 0.16 + hash01(`co:${thought.id}`) * 0.1, thought.id),
      status: thought.status,
      flow: running,
      strength: Math.max(0.3, strength * 0.5 + plasticity * 0.5),
      branchNo: 0,
    })
    if (running) {
      pulses.push({ id: `core-spark-${thought.id}`, nodeId: 'core', kind: 'spark', delayS: hash01(`pd:${thought.id}`) * 1.4 })
    }

    // ── 末梢运行（突触束）──
    const shown = thoughtRuns.slice(0, RUNS_PER_THOUGHT)
    overflow[thoughtId] = Math.max(0, thoughtRuns.length - shown.length)
    const spreadBase = 0.24 + (Math.min(thoughtRuns.length, 6) / 6) * 0.14
    shown.forEach((run, j) => {
      const slot = Math.ceil(j / 2)
      const offset = slot * (j % 2 === 1 ? -1 : 1)
      const angle = baseAngle + spreadBase * offset + scatterOffset(run.runId, 0.1)
      const radius = runBranchRadius(run.durationSec)
      const tx = x + Math.cos(angle) * radius * 0.3
      const ty = y + Math.sin(angle) * radius * 0.3
      const runId = `run:${run.runId}`
      const isRunning = run.status === 'running'
      const isAwaiting = run.status === 'awaiting-input'
      nodes.push({
        id: runId,
        kind: 'run',
        x: tx, y: ty,
        r: isRunning ? 7.5 : 5.5,
        status: run.status,
        label: run.runId.slice(-4),
        // 末梢副标：运行时长（可读语义——这条运行跑了多久）
        sub: formatRunDuration(run.durationSec),
        strength: strengthOf(run.status),
        pulse: isRunning,
        driftHz: 0.5 + hash01(`hz:${run.runId}`) * 0.6,
        to: { name: 'ia2.tasks', query: { task: run.thoughtId } },
        highlight: isAwaiting,
      })

      const strands = 1 + Math.floor(hash01(`st:${run.runId}`) * 3)
      for (let b = 0; b < strands; b++) {
        const bend = 0.22 + hash01(`bb:${run.runId}:${b}`) * 0.22
        edges.push({
          id: `${thoughtId}->${runId}#${b}`,
          from: thoughtId, to: runId,
          d: organicPath(x, y, tx, ty, bend, `${run.runId}#${b}`),
          status: run.status,
          flow: isRunning,
          strength: strengthOf(run.status) * (0.55 + (b / strands) * 0.45),
          branchNo: b,
        })
      }
      if (isRunning) {
        pulses.push({ id: `spark-${run.runId}`, nodeId: runId, kind: 'spark', delayS: hash01(`rd:${run.runId}`) * 1.8 })
      } else if (isAwaiting) {
        pulses.push({ id: `int-${run.runId}`, nodeId: runId, kind: 'interrupt', delayS: hash01(`rd:${run.runId}`) * 2.2 })
      }
    })
  })

  return {
    width: MIND_VIEW_W, height: MIND_VIEW_H,
    nodes, edges, pulses, overflow, hiddenThoughts,
  }
}
