// overlay/custom/client/cockpit/composables/computeLayeredLayout.ts
// 依赖关系驱动的分层有向布局（为 Run Observatory 拓扑图）。
// 不严格按时间比例/固定层级表头划分，而是按节点间的边依赖关系分层：
//   - 根节点（无入边）在第 0 层，下游逐层 +1（体现前后顺序与层级结构）
//   - 同层节点按 startedAt 排序，水平等距排列，不重叠
//   - 支持折叠：折叠节点的子孙不参与布局（隐藏），实现层级自动折叠/展开
import type { TraceNode } from '../adapters/run-trace-adapter'
import type { TraceEdge } from '../adapters/run-trace-adapter'

// 布局常量（px）
export const NODE_W = 190          // 节点卡片宽度
export const NODE_H = 56           // 节点卡片高度（含两行文本）
export const COL_GAP = 40          // 同层节点间水平间距
export const LAYER_GAP = 90        // 层间距（垂直）
export const PADDING = 24          // 画布留白

export interface LayeredPosition { x: number; y: number; depth: number }
export interface LayeredLayout {
  positions: Map<string, LayeredPosition>
  width: number
  height: number
}

/**
 * 计算分层有向布局坐标。
 * @param nodes 全部节点
 * @param edges 全部边
 * @param collapsedIds 折叠的节点 id 集合（其子孙隐藏）
 */
export function computeLayeredLayout(
  nodes: TraceNode[],
  edges: TraceEdge[],
  collapsedIds: Set<string> = new Set(),
): LayeredLayout {
  const positions = new Map<string, LayeredPosition>()
  if (nodes.length === 0) return { positions, width: PADDING * 2, height: PADDING * 2 }

  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  // 邻接：父→子（边的 from→to 视为父→子）
  const childrenOf = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  for (const n of nodes) { childrenOf.set(n.id, []); inDegree.set(n.id, 0) }
  for (const e of edges) {
    if (!nodeMap.has(e.from) || !nodeMap.has(e.to)) continue
    childrenOf.get(e.from)!.push(e.to)
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1)
  }

  // 计算可见节点：从根（入度0或自环）BFS，遇到折叠节点则不展开其子树
  const visible = new Set<string>()
  const roots = nodes.filter(n => (inDegree.get(n.id) ?? 0) === 0).map(n => n.id)
  // 若没有严格根（全有入边，可能成环），取 startedAt 最早的为根
  if (roots.length === 0) {
    const earliest = [...nodes].sort((a, b) => a.startedAt - b.startedAt)[0]
    if (earliest) roots.push(earliest.id)
  }
  const queue = [...roots]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (visible.has(id)) continue
    visible.add(id)
    if (collapsedIds.has(id)) continue // 折叠：不展开子树
    const kids = childrenOf.get(id) ?? []
    queue.push(...kids)
  }
  // 兜底：未被 BFS 覆盖的节点（孤立）也纳入可见
  for (const n of nodes) if (!visible.has(n.id)) visible.add(n.id)

  // 分层 depth：BFS，depth = max(前驱 depth) + 1
  const depth = new Map<string, number>()
  // 拓扑序计算 depth（迭代至收敛，处理环）
  const inDegVisible = new Map<string, number>()
  for (const id of visible) inDegVisible.set(id, 0)
  for (const e of edges) {
    if (visible.has(e.from) && visible.has(e.to)) {
      inDegVisible.set(e.to, (inDegVisible.get(e.to) ?? 0) + 1)
    }
  }
  const dq = [...visible].filter(id => (inDegVisible.get(id) ?? 0) === 0)
  dq.forEach(id => depth.set(id, 0))
  let guard = visible.size * 2 + 10
  while (dq.length > 0 && guard-- > 0) {
    const id = dq.shift()!
    const d = depth.get(id) ?? 0
    for (const c of (childrenOf.get(id) ?? [])) {
      if (!visible.has(c)) continue
      depth.set(c, Math.max(depth.get(c) ?? 0, d + 1))
      const nd = (inDegVisible.get(c) ?? 1) - 1
      inDegVisible.set(c, nd)
      if (nd <= 0) dq.push(c)
    }
  }
  // 兜底：仍无 depth 的可见节点放第 0 层
  for (const id of visible) if (!depth.has(id)) depth.set(id, 0)

  // 按层分组，同层按 startedAt 排序
  const byDepth = new Map<number, string[]>()
  for (const id of visible) {
    const d = depth.get(id) ?? 0
    if (!byDepth.has(d)) byDepth.set(d, [])
    byDepth.get(d)!.push(id)
  }
  for (const [, ids] of byDepth) {
    ids.sort((a, b) => (nodeMap.get(a)?.startedAt ?? 0) - (nodeMap.get(b)?.startedAt ?? 0))
  }

  // 计算每层宽度，居中布局
  const maxDepth = Math.max(0, ...depth.values())
  const layerWidths: number[] = []
  for (let d = 0; d <= maxDepth; d++) {
    const ids = byDepth.get(d) ?? []
    layerWidths[d] = ids.length * NODE_W + Math.max(0, ids.length - 1) * COL_GAP
  }
  const maxLayerWidth = Math.max(...layerWidths, NODE_W)
  const width = maxLayerWidth + PADDING * 2
  const height = (maxDepth + 1) * (NODE_H + LAYER_GAP) + PADDING * 2

  for (let d = 0; d <= maxDepth; d++) {
    const ids = byDepth.get(d) ?? []
    const lw = layerWidths[d] ?? NODE_W
    const xOffset = PADDING + (maxLayerWidth - lw) / 2 // 层内居中
    ids.forEach((id, i) => {
      const x = xOffset + i * (NODE_W + COL_GAP)
      const y = PADDING + d * (NODE_H + LAYER_GAP)
      positions.set(id, { x, y, depth: d })
    })
  }

  return { positions, width, height }
}
