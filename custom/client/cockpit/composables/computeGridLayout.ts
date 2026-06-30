// overlay/custom/client/cockpit/composables/computeGridLayout.ts
// 网格布局：为 Run Observatory 全局聚合视图计算节点坐标。
// 横平竖直、无堆叠遮罩：
//   X 轴（列）：按 cluster（任务）最早 startedAt 升序，每列一个任务聚类
//   Y 轴（行）：按下钻维度 ingress→workflow→agent→skill→tool 自上而下
// 同列同行多节点按 startedAt 在列内水平排开，避免重叠。
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

// 布局常量（px）
export const COL_W = 240          // 每列宽度
export const ROW_H = 110          // 每行高度
export const ITEM_W = 150         // 同列同行内单个节点占用宽度
export const ITEM_GAP_X = 12      // 同列同行节点间水平间距
export const LEFT_GUTTER = 96     // 左侧行标签宽度
export const TOP_GUTTER = 56      // 顶部列头高度
export const NODE_H = 38          // 节点卡片高度（用于垂直居中）

export interface GridPosition {
  col: number
  row: number
  x: number
  y: number
}

export interface GridColumn {
  cluster: string
  /** 列内最早 startedAt（用于排序） */
  startedAt: number
  /** 列内会话数 */
  sessionCount: number
  /** 列展示标题（taskId 或最早会话标题） */
  title: string
  /** 主要 profile */
  profile?: string
  /** 来源 kanban board slug（追踪信息） */
  board?: string
  x: number
}

export interface GridLayout {
  positions: Map<string, GridPosition>
  columns: GridColumn[]
  rows: typeof KIND_ROWS
  width: number
  height: number
}

/**
 * 计算网格布局坐标。
 * @param nodes 聚合后的全部节点（含 cluster、kind、startedAt、ref.sessionId、profile）
 * @param clusterMeta 每个 cluster 的元信息（startedAt/title/profile/sessionCount），由调用方从会话列表预先聚合
 */
export function computeGridLayout(
  nodes: TraceNode[],
  clusterMeta: Map<string, { startedAt: number; title: string; profile?: string; sessionCount: number; board?: string }>,
): GridLayout {
  const positions = new Map<string, GridPosition>()

  // 1. 列排序：按 cluster 最早 startedAt 升序
  const clusters = [...clusterMeta.keys()].sort((a, b) => {
    const sa = clusterMeta.get(a)?.startedAt ?? Infinity
    const sb = clusterMeta.get(b)?.startedAt ?? Infinity
    return sa - sb
  })

  const colIndex = new Map<string, number>()
  clusters.forEach((c, i) => colIndex.set(c, i))

  const columns: GridColumn[] = clusters.map((c, i) => {
    const meta = clusterMeta.get(c)!
    return {
      cluster: c,
      startedAt: meta.startedAt,
      sessionCount: meta.sessionCount,
      title: meta.title,
      profile: meta.profile,
      board: meta.board,
      x: LEFT_GUTTER + i * COL_W,
    }
  })

  // 2. 节点定位：按 cluster 分组 → 按 kind 行 → 按 startedAt 排序后在列内水平排开
  const byCluster = new Map<string, TraceNode[]>()
  for (const n of nodes) {
    const key = n.cluster ?? n.ref?.sessionId ?? 'default'
    if (!byCluster.has(key)) byCluster.set(key, [])
    byCluster.get(key)!.push(n)
  }

  for (const [cluster, ns] of byCluster) {
    const ci = colIndex.get(cluster)
    if (ci == null) continue // cluster 无元信息则跳过（不应发生）
    const colX = LEFT_GUTTER + ci * COL_W

    // 按行分组
    const byRow = new Map<number, TraceNode[]>()
    for (const n of ns) {
      const row = KIND_ROW_INDEX.get(n.kind) ?? 4 // 未知 kind 归到 tool 行
      if (!byRow.has(row)) byRow.set(row, [])
      byRow.get(row)!.push(n)
    }

    for (const [row, rowNodes] of byRow) {
      // 同行按 startedAt 排序
      rowNodes.sort((a, b) => a.startedAt - b.startedAt)
      // 列内水平排开；若超出列宽则换行（向下递增 ROW_H 偏移），仍保持横平竖直
      const perLine = Math.max(1, Math.floor((COL_W - ITEM_GAP_X) / (ITEM_W + ITEM_GAP_X)))
      rowNodes.forEach((n, idx) => {
        const line = Math.floor(idx / perLine)
        const slot = idx % perLine
        const x = colX + slot * (ITEM_W + ITEM_GAP_X)
        const y = TOP_GUTTER + row * ROW_H + line * (NODE_H + 8) + 4
        positions.set(n.id, { col: ci, row, x, y })
      })
    }
  }

  const width = LEFT_GUTTER + columns.length * COL_W + 24
  const height = TOP_GUTTER + KIND_ROWS.length * ROW_H + 24

  return { positions, columns, rows: KIND_ROWS, width, height }
}
