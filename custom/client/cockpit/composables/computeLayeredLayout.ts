// overlay/custom/client/cockpit/composables/computeLayeredLayout.ts
// 依赖关系驱动的分层有向布局（为 Run Observatory 拓扑图）。
// 按节点间的边依赖关系分层，且按连通分量分组：无关联的任务分开展示、不互相穿插。
//   - 连通分量检测（无向）：通过边相连的节点归为同一组，孤立节点各自成组
//   - 分量内：根节点第 0 层，下游逐层 +1；同层按 startedAt 排序水平居中
//   - 分量间：从上到下垂直堆叠，各自独立居中，组间留较大间距
//   - 折叠：折叠节点的子孙不参与布局（隐藏）
import type { TraceNode } from '../adapters/run-trace-adapter'
import type { TraceEdge } from '../adapters/run-trace-adapter'

// 布局常量（px）
export const NODE_W = 190
export const NODE_H = 56
export const COL_GAP = 40
export const LAYER_GAP = 90
export const GROUP_GAP = 48          // 分量间垂直间距
export const PADDING = 24

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

  // ── 分量内分层 + 分量间垂直堆叠 ──
  let globalMaxWidth = NODE_W
  let cursorY = PADDING

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

    // 分量内按层分组 + startedAt 排序
    const byDepth = new Map<number, string[]>()
    for (const id of groupIds) {
      const d = depth.get(id) ?? 0
      if (!byDepth.has(d)) byDepth.set(d, [])
      byDepth.get(d)!.push(id)
    }
    for (const [, ids] of byDepth) {
      ids.sort((a, b) => (nodeMap.get(a)?.startedAt ?? 0) - (nodeMap.get(b)?.startedAt ?? 0))
    }
    const maxDepth = Math.max(0, ...depth.values())
    const layerWidths: number[] = []
    for (let d = 0; d <= maxDepth; d++) {
      const ids = byDepth.get(d) ?? []
      layerWidths[d] = ids.length * NODE_W + Math.max(0, ids.length - 1) * COL_GAP
    }
    const groupMaxWidth = Math.max(...layerWidths, NODE_W)
    globalMaxWidth = Math.max(globalMaxWidth, groupMaxWidth)

    // 分量内布局（水平居中，垂直从 cursorY 起）
    for (let d = 0; d <= maxDepth; d++) {
      const ids = byDepth.get(d) ?? []
      const lw = layerWidths[d] ?? NODE_W
      const xOffset = PADDING + (groupMaxWidth - lw) / 2
      ids.forEach((id, i) => {
        const x = xOffset + i * (NODE_W + COL_GAP)
        const y = cursorY + d * (NODE_H + LAYER_GAP)
        positions.set(id, { x, y, depth: d, seq: 0 })
      })
    }
    cursorY += (maxDepth + 1) * (NODE_H + LAYER_GAP) + GROUP_GAP
  }

  // 全局时序序号：所有可见节点按 startedAt 升序编号（1-based），用于节点上显示时序标号
  const sortedIds = [...positions.keys()].sort((a, b) => (nodeMap.get(a)?.startedAt ?? 0) - (nodeMap.get(b)?.startedAt ?? 0))
  sortedIds.forEach((id, i) => {
    const p = positions.get(id)!
    positions.set(id, { ...p, seq: i + 1 })
  })

  const width = globalMaxWidth + PADDING * 2
  const height = cursorY - GROUP_GAP + PADDING
  return { positions, width, height }
}
