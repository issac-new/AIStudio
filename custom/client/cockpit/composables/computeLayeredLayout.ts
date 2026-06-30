// overlay/custom/client/cockpit/composables/computeLayeredLayout.ts
// 分层有向布局：为 Run Observatory 拓扑图计算节点坐标（vue-flow 用）。
// 横平竖直、体现时序与层级：
//   X 轴：按节点 startedAt 归一化到时间轴，从左到右（时序）
//   Y 轴：按 kind 层级 ingress→workflow→agent→skill→tool 从上到下（执行层级）
//   同层多节点按 startedAt 在该层内垂直/水平排开，避免重叠
import type { TraceNode } from '../adapters/run-trace-adapter'

/** 下钻维度层级：行索引（从上到下） */
export const KIND_ROWS: Array<{ kind: TraceNode['kind']; label: string }> = [
  { kind: 'ingress', label: '入口' },
  { kind: 'workflow', label: 'Run' },
  { kind: 'agent', label: 'Agent' },
  { kind: 'skill', label: 'Skill' },
  { kind: 'tool', label: 'Tool' },
]
const KIND_ROW_INDEX = new Map<TraceNode['kind'], number>()
KIND_ROWS.forEach((r, i) => KIND_ROW_INDEX.set(r.kind, i))
// 未识别 kind 归入 tool 行
const DEFAULT_ROW = KIND_ROWS.length - 1

// 布局常量（px）
export const LAYER_H = 130          // 每层高度
export const COL_W = 200            // 每个时间槽宽度
export const NODE_W = 170           // 节点卡片宽度
export const NODE_H = 44            // 节点卡片高度
export const LEFT_GUTTER = 96       // 左侧行标签宽度
export const TOP_GUTTER = 24        // 顶部留白
export const TIME_BUCKETS = 12      // 时间轴分桶数（横向最大列数）

export interface LayeredPosition { x: number; y: number; col: number; row: number }
export interface LayeredLayout {
  positions: Map<string, LayeredPosition>
  rows: typeof KIND_ROWS
  width: number
  height: number
}

/**
 * 计算分层有向布局坐标。
 * @param nodes 全部节点（含 startedAt、kind、cluster）
 */
export function computeLayeredLayout(nodes: TraceNode[]): LayeredLayout {
  const positions = new Map<string, LayeredPosition>()
  if (nodes.length === 0) return { positions, rows: KIND_ROWS, width: LEFT_GUTTER + 24, height: TOP_GUTTER + KIND_ROWS.length * LAYER_H }

  // 时间范围
  const times = nodes.map(n => n.startedAt).filter(Boolean)
  const tMin = times.length > 0 ? Math.min(...times) : 0
  const tMax = times.length > 0 ? Math.max(...times) : tMin + 1
  const tSpan = Math.max(1, tMax - tMin)

  // 按层分组
  const byRow = new Map<number, TraceNode[]>()
  for (const n of nodes) {
    const row = KIND_ROW_INDEX.get(n.kind) ?? DEFAULT_ROW
    if (!byRow.has(row)) byRow.set(row, [])
    byRow.get(row)!.push(n)
  }

  // 每层内按 startedAt 排序，分配时间桶（col）；同桶多节点向下堆叠
  for (const [row, ns] of byRow) {
    ns.sort((a, b) => a.startedAt - b.startedAt)
    const bucketCount = new Map<number, number>() // col → 已占用数
    for (const n of ns) {
      // 归一化到 [0, TIME_BUCKETS-1]
      const t = n.startedAt || tMin
      const ratio = (t - tMin) / tSpan
      let col = Math.round(ratio * (TIME_BUCKETS - 1))
      col = Math.max(0, Math.min(TIME_BUCKETS - 1, col))
      const stackIdx = bucketCount.get(col) ?? 0
      bucketCount.set(col, stackIdx + 1)
      const x = LEFT_GUTTER + col * COL_W
      // 同桶堆叠：向下偏移
      const y = TOP_GUTTER + row * LAYER_H + stackIdx * (NODE_H + 8)
      positions.set(n.id, { x, y, col, row })
    }
  }

  const maxCol = Math.max(0, ...[...positions.values()].map(p => p.col))
  const width = LEFT_GUTTER + (maxCol + 1) * COL_W + 24
  const height = TOP_GUTTER + KIND_ROWS.length * LAYER_H + 24
  return { positions, rows: KIND_ROWS, width, height }
}
