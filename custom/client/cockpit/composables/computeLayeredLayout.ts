// overlay/custom/client/cockpit/composables/computeLayeredLayout.ts
// 依赖关系驱动的分层有向布局（为 Run Observatory 拓扑图）。
// 按节点间的边依赖关系分层，且按连通分量分组：无关联的任务分开展示、不互相穿插。
//   - 连通分量检测（无向）：通过边相连的节点归为同一组，孤立节点各自成组
//   - 分量内：根节点第 0 层，下游逐层 +1；同层按 startedAt 排序水平居中
//   - 分量间：从上到下垂直堆叠，各自独立居中，组间留较大间距
//   - 折叠：折叠节点的子孙不参与布局（隐藏）
import type { TraceNode, TraceEdge } from '../adapters/run-trace-adapter'

// 布局常量（px）
export const NODE_W = 160
export const NODE_H = 40
export const COL_GAP = 140             // 同层节点水平间距（拉大，容纳下方 label 左对齐整齐显示）
export const LAYER_GAP = 110           // 层间垂直间距（label + 边走线空间）
export const GROUP_GAP = 48            // 分量间垂直间距
export const PADDING = 20

export interface LayeredPosition { x: number; y: number; depth: number; seq: number }
export interface LayeredLayout {
  positions: Map<string, LayeredPosition>
  width: number
  height: number
}

/** 并查集：用于连通分量检测 */
class UnionFind {
  parent = new Map<string, string>()
  find(x: string): string {
    if (!this.parent.has(x)) { this.parent.set(x, x); return x }
    let root = x
    while (this.parent.get(root) !== root) root = this.parent.get(root)!
    // 路径压缩
    let cur = x
    while (this.parent.get(cur) !== root) { const next = this.parent.get(cur)!; this.parent.set(cur, root); cur = next }
    return root
  }
  union(a: string, b: string) {
    const ra = this.find(a), rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }
}

/**
 * 计算分层有向布局坐标（按连通分量分组，分量间不穿插）。
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
  const childrenOf = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  for (const n of nodes) { childrenOf.set(n.id, []); inDegree.set(n.id, 0) }
  for (const e of edges) {
    if (!nodeMap.has(e.from) || !nodeMap.has(e.to)) continue
    childrenOf.get(e.from)!.push(e.to)
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1)
  }

  // ── 可见节点：从根 BFS，遇到折叠节点不展开子树 ──
  const visible = new Set<string>()
  const roots = nodes.filter(n => (inDegree.get(n.id) ?? 0) === 0).map(n => n.id)
  if (roots.length === 0) {
    const earliest = [...nodes].sort((a, b) => a.startedAt - b.startedAt)[0]
    if (earliest) roots.push(earliest.id)
  }
  const queue = [...roots]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (visible.has(id)) continue
    visible.add(id)
    if (collapsedIds.has(id)) continue
    queue.push(...(childrenOf.get(id) ?? []))
  }
  // 兜底：未被 BFS 覆盖的节点纳入 visible —— 但排除“被折叠节点隐藏的子孙”。
  // 判断：若节点有任一前驱已在 visible 中，说明它是因前驱折叠而未展开，应保持隐藏。
  const predsOf = new Map<string, string[]>()
  for (const e of edges) {
    if (!nodeMap.has(e.from) || !nodeMap.has(e.to)) continue
    if (!predsOf.has(e.to)) predsOf.set(e.to, [])
    predsOf.get(e.to)!.push(e.from)
  }
  for (const n of nodes) {
    if (visible.has(n.id)) continue
    const preds = predsOf.get(n.id) ?? []
    if (preds.some(p => visible.has(p))) continue // 前驱可见但未展开本节点 → 折叠隐藏，跳过
    visible.add(n.id)
  }

  // ── 连通分量检测（无向：边的两端连通） ──
  const uf = new UnionFind()
  for (const id of visible) uf.find(id)
  for (const e of edges) {
    if (visible.has(e.from) && visible.has(e.to)) uf.union(e.from, e.to)
  }
  const groups = new Map<string, string[]>()
  for (const id of visible) {
    const root = uf.find(id)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(id)
  }
  // 分量按组内最早 startedAt 排序（早的在上）
  const sortedGroups = [...groups.values()].sort((a, b) => {
    const ta = Math.min(...a.map(id => nodeMap.get(id)?.startedAt ?? Infinity))
    const tb = Math.min(...b.map(id => nodeMap.get(id)?.startedAt ?? Infinity))
    return ta - tb
  })

  // ── 分量内分层 + 分量间多列网格布局（避免单列过高失衡） ──
  // 每行最多放置 ceil(sqrt(分量数)) 个聚类，按行排列；行内分量顶部对齐。
  const groupCount = sortedGroups.length
  const colsPerRow = Math.max(1, Math.ceil(Math.sqrt(groupCount)))
  // 每列宽度 = 一个分量最大宽度 + 列间距
  const COL_BLOCK_W = 360
  const COL_BLOCK_GAP = 32
  const ROW_BLOCK_GAP = 40

  let globalMaxWidth = NODE_W
  let maxRowBottom = PADDING

  // 先计算每个分量的尺寸（宽高），再按网格摆放
  interface GroupBox { ids: string[]; w: number; h: number; positions: Map<string, LayeredPosition> }
  const boxes: GroupBox[] = []
  for (const groupIds of sortedGroups) {
    const groupSet = new Set(groupIds)
    // 分量内 depth
    const depth = new Map<string, number>()
    const inDeg = new Map<string, number>()
    for (const id of groupIds) inDeg.set(id, 0)
    for (const e of edges) {
      if (groupSet.has(e.from) && groupSet.has(e.to)) {
        inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1)
      }
    }
    const dq = groupIds.filter(id => (inDeg.get(id) ?? 0) === 0)
    dq.forEach(id => depth.set(id, 0))
    let guard = groupIds.length * 2 + 10
    while (dq.length > 0 && guard-- > 0) {
      const id = dq.shift()!
      const d = depth.get(id) ?? 0
      for (const c of (childrenOf.get(id) ?? [])) {
        if (!groupSet.has(c)) continue
        depth.set(c, Math.max(depth.get(c) ?? 0, d + 1))
        const nd = (inDeg.get(c) ?? 1) - 1
        inDeg.set(c, nd)
        if (nd <= 0) dq.push(c)
      }
    }
    for (const id of groupIds) if (!depth.has(id)) depth.set(id, 0)

    const maxDepth = Math.max(0, ...depth.values())
    const groupHeight = (maxDepth + 1) * (NODE_H + LAYER_GAP)

    // 分量内局部布局：严格树形分层（保证不穿插遮挡）。
    // - Y 轴 = depth（父在上、子在下），层间 LAYER_GAP 足够大
    // - 同层节点独占 x 列（紧凑水平排列，按 startedAt 排序体现时间左→右）
    // - 父子边仅相邻层间走垂直直角折线，因同层独占列、层间有间距，不穿越无关节点
    // - 子节点 x 尽量靠近父 x（按父 x 中点排序），减少边交叉
    const byDepth = new Map<number, string[]>()
    for (const id of groupIds) {
      const d = depth.get(id) ?? 0
      if (!byDepth.has(d)) byDepth.set(d, [])
      byDepth.get(d)!.push(id)
    }
    const localParents = new Map<string, string[]>()
    for (const id of groupIds) localParents.set(id, [])
    for (const e of edges) {
      if (groupSet.has(e.from) && groupSet.has(e.to)) localParents.get(e.to)!.push(e.from)
    }

    const gp = new Map<string, LayeredPosition>()
    const slotW = NODE_W + COL_GAP
    for (let d = 0; d <= maxDepth; d++) {
      const ids = byDepth.get(d) ?? []
      if (d === 0) {
        ids.sort((a, b) => (nodeMap.get(a)?.startedAt ?? 0) - (nodeMap.get(b)?.startedAt ?? 0))
        ids.forEach((id, i) => gp.set(id, { x: i * slotW, y: d * (NODE_H + LAYER_GAP), depth: d, seq: 0 }))
      } else {
        // 非根层：按父 x 中点排序，使子靠近父，减少交叉
        const items = ids.map(id => {
          const ps = localParents.get(id) ?? []
          const xs = ps.map(p => gp.get(p)?.x ?? 0)
          const mid = xs.length > 0 ? xs.reduce((s, x) => s + x, 0) / xs.length : 0
          return { id, mid, t: nodeMap.get(id)?.startedAt ?? 0 }
        })
        items.sort((a, b) => a.mid - b.mid || a.t - b.t)
        items.forEach((it, i) => gp.set(it.id, { x: i * slotW, y: d * (NODE_H + LAYER_GAP), depth: d, seq: 0 }))
      }
    }
    const groupMaxWidth = Math.max(...[...gp.values()].map(p => p.x + NODE_W), slotW)
    globalMaxWidth = Math.max(globalMaxWidth, groupMaxWidth)
    boxes.push({ ids: groupIds, w: groupMaxWidth, h: groupHeight, positions: gp })
  }

  // 按网格摆放各分量，每个分量内独立从 1 编号
  boxes.forEach((box, idx) => {
    const row = Math.floor(idx / colsPerRow)
    const col = idx % colsPerRow
    // 该行内分量的最大宽度（用于确定该行 x 起始，使行内居中）
    const rowStart = row * colsPerRow
    const rowBoxes = boxes.slice(rowStart, Math.min(rowStart + colsPerRow, boxes.length))
    const rowWidth = rowBoxes.reduce((s, b) => s + b.w, 0) + (rowBoxes.length - 1) * COL_BLOCK_GAP
    const rowXBase = PADDING + Math.max(0, (globalMaxWidth * colsPerRow + (colsPerRow - 1) * COL_BLOCK_GAP - rowWidth) / 2)
    // 计算 x 偏移：前面分量的累计宽度
    let xOffset = rowXBase
    for (let c = 0; c < col; c++) xOffset += rowBoxes[c].w + COL_BLOCK_GAP
    // 该行顶部 y
    const rowTop = PADDING + row * (Math.max(...rowBoxes.map(b => b.h)) + ROW_BLOCK_GAP)
    // 分量内独立序号：按 startedAt 升序从 1
    const sortedLocal = [...box.positions.keys()].sort((a, b) => (nodeMap.get(a)?.startedAt ?? 0) - (nodeMap.get(b)?.startedAt ?? 0))
    sortedLocal.forEach((id, i) => {
      const p = box.positions.get(id)!
      positions.set(id, { x: xOffset + p.x, y: rowTop + p.y, depth: p.depth, seq: i + 1 })
    })
    maxRowBottom = Math.max(maxRowBottom, rowTop + box.h + ROW_BLOCK_GAP)
  })

  const width = Math.max(globalMaxWidth, COL_BLOCK_W) * Math.min(colsPerRow, groupCount) + (Math.min(colsPerRow, groupCount) - 1) * COL_BLOCK_GAP + PADDING * 2
  const height = maxRowBottom
  return { positions, width, height }
}
