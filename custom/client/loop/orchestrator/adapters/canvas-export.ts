// overlay/custom/client/loop/orchestrator/adapters/canvas-export.ts
// 编排编辑器 CanvasDoc → 品牌静态图导出模型（diagram-design 吸收轮挂账清账件）。
// 纯函数：EditorCanvas 的 doc + 校验态 → FlowExportNode/Edge。
// 裁决（spec D-10）：非法边/警告节点如实入图（镜像画布红边/琥珀描边，草稿态不化妆）；
// 选中态不入图（交互瞬态，非文档真值）；布局忠实保留用户拖拽坐标（不重排版）。
import type { CanvasDoc } from './editor'
import { edgeId } from './editor'
import type { FlowExportEdge, FlowExportNode } from '@/custom/ide/utils/diagram-export'

/** ed-node 卡片几何估计（min 120 / max-width 168，标签+类型两行）——与
 *  EditorCanvas CONTAINER 估计同源：估计值只影响呼吸感不影响拓扑。 */
export const EDITOR_NODE_W = 168
export const EDITOR_NODE_H = 52

export interface EditorExportInput {
  doc: CanvasDoc
  invalidEdgeIds: string[]
  warningNodeIds: string[]
}

export function editorDocToFlowExport(input: EditorExportInput): {
  nodes: FlowExportNode[]
  edges: FlowExportEdge[]
} {
  const { doc, invalidEdgeIds, warningNodeIds } = input
  const invalidSet = new Set(invalidEdgeIds)
  const warnSet = new Set(warningNodeIds)
  const nodes: FlowExportNode[] = doc.nodes.map((n) => ({
    id: n.id,
    label: (typeof n.config?.label === 'string' && n.config.label) || n.id,
    sublabel: n.type,
    status: warnSet.has(n.id) ? 'warning' : undefined,
    x: n.x,
    y: n.y,
    w: EDITOR_NODE_W,
    h: EDITOR_NODE_H,
  }))
  const edges: FlowExportEdge[] = doc.edges.map((e) => ({
    from: e.from,
    to: e.to,
    // 镜像画布渲染口径：guard → ×N；否则用边自带 label
    label: e.guard !== undefined ? `×${e.guard.maxIterations}` : e.label,
    dashed: e.guard !== undefined,
    invalid: invalidSet.has(edgeId(e.from, e.to)),
  }))
  return { nodes, edges }
}
