// overlay/custom/client/cockpit/composables/useForceLayout.ts
// d3-force 力导向布局：为 Run Observatory 聚类图谱计算节点坐标。
// 按 cluster（任务 t_xxx）分组聚拢，cluster 间排斥分离，边约束拉近关联节点。
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY } from 'd3-force'
import type { SimulationNodeDatum, SimulationLinkDatum } from 'd3-force'

export interface ForceNode extends SimulationNodeDatum {
  id: string
  cluster: string
  kind?: string
}
export interface ForceEdge {
  source: string
  target: string
}
export interface ForcePosition { x: number; y: number }

/**
 * 计算力导向布局坐标。
 * @param nodes 节点（含 cluster 分组键）
 * @param edges 边（source/target 为节点 id）
 * @param width 画布宽（用于 cluster 中心点分布）
 * @param height 画布高
 * @param ticks 迭代次数（默认 300，足够收敛）
 * @returns Map<nodeId, {x,y}>
 */
export function computeForceLayout(
  nodes: ForceNode[],
  edges: ForceEdge[],
  width = 800,
  height = 600,
  ticks = 300,
): Map<string, ForcePosition> {
  if (nodes.length === 0) return new Map()

  // 为每个 cluster 分配一个中心点（圆形分布在画布中心周围）
  const clusters = [...new Set(nodes.map(n => n.cluster))]
  const clusterCenters = new Map<string, { x: number; y: number }>()
  const cx = width / 2
  const cy = height / 2
  const radius = Math.min(width, height) * 0.32
  clusters.forEach((c, i) => {
    const angle = (i / Math.max(1, clusters.length)) * Math.PI * 2
    clusterCenters.set(c, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) })
  })

  // 初始化节点坐标（聚集在各自 cluster 中心附近，加随机抖动避免重叠）
  const simNodes: ForceNode[] = nodes.map(n => {
    const center = clusterCenters.get(n.cluster) ?? { x: cx, y: cy }
    return {
      ...n,
      x: center.x + (Math.random() - 0.5) * 40,
      y: center.y + (Math.random() - 0.5) * 40,
    }
  })

  // 节点 id → 索引映射（forceLink 需索引或对象引用）
  const idToNode = new Map(simNodes.map(n => [n.id, n]))
  const simLinks: SimulationLinkDatum<ForceNode>[] = edges
    .filter(e => idToNode.has(e.source) && idToNode.has(e.target))
    .map(e => ({ source: e.source, target: e.target }))

  const simulation = forceSimulation<ForceNode>(simNodes)
    .force('link', forceLink<ForceNode, SimulationLinkDatum<ForceNode>>(simLinks)
      .id((d: ForceNode) => d.id)
      .distance(80)
      .strength(0.3))
    .force('charge', forceManyBody().strength(-120))
    .force('collide', forceCollide(28))
    // 按 cluster 中心点吸引：forceX/forceY 朝各自 cluster 中心，strength 控制聚拢强度
    .force('x', forceX<ForceNode>((d: ForceNode) => clusterCenters.get(d.cluster)?.x ?? cx).strength(0.15))
    .force('y', forceY<ForceNode>((d: ForceNode) => clusterCenters.get(d.cluster)?.y ?? cy).strength(0.15))
    .stop()

  // 同步迭代到收敛（不调用 alphaTarget，避免异步）
  for (let i = 0; i < ticks; i++) simulation.tick()

  const result = new Map<string, ForcePosition>()
  for (const n of simNodes) {
    result.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 })
  }
  return result
}
