// canvas-export 适配器测试（挂账清账件）：CanvasDoc+校验态 → 导出模型三裁决。
import { describe, expect, it } from 'vitest'
import { editorDocToFlowExport } from '../adapters/canvas-export'
import type { CanvasDoc } from '../adapters/editor'

function doc(): CanvasDoc {
  return {
    id: 'd1',
    version: 1,
    description: '审批编排',
    channels: {},
    nodes: [
      { id: 'start', type: 'function', config: { label: '起草' }, x: 0, y: 0 },
      { id: 'gate', type: 'gate', config: {}, x: 240, y: 0 },
      { id: 'end', type: 'converge', config: { label: '收口' }, x: 480, y: 0 },
    ],
    edges: [
      { from: 'start', to: 'gate' },
      { from: 'gate', to: 'end', guard: { maxIterations: 3 } },
      { from: 'gate', to: 'start', label: '退回' },
    ],
    entryNode: 'start',
    limits: { maxSteps: 50 },
    containers: [],
  } as unknown as CanvasDoc
}

describe('editorDocToFlowExport（D-10 三裁决）', () => {
  const out = editorDocToFlowExport({
    doc: doc(),
    invalidEdgeIds: ['gate->start'],
    warningNodeIds: ['gate'],
  })

  it('label 取 config.label 兜底 id；sublabel=节点类型', () => {
    const start = out.nodes.find((n) => n.id === 'start')!
    expect(start.label).toBe('起草')
    const gate = out.nodes.find((n) => n.id === 'gate')!
    expect(gate.label).toBe('gate') // 无 config.label → id 兜底（镜像画布口径）
    expect(gate.sublabel).toBe('gate')
    expect(out.nodes.find((n) => n.id === 'end')!.label).toBe('收口')
  })

  it('警告节点 status=warning；无警告节点不带状态', () => {
    expect(out.nodes.find((n) => n.id === 'gate')!.status).toBe('warning')
    expect(out.nodes.find((n) => n.id === 'start')!.status).toBeUndefined()
  })

  it('guard 边 ×N + 虚线；非法边 invalid=true；普通边干净', () => {
    const guardEdge = out.edges.find((e) => e.from === 'gate' && e.to === 'end')!
    expect(guardEdge.label).toBe('×3')
    expect(guardEdge.dashed).toBe(true)
    const invalidEdge = out.edges.find((e) => e.from === 'gate' && e.to === 'start')!
    expect(invalidEdge.invalid).toBe(true)
    // 非法边自带 label 保留（guard 优先级更高只作用于 guard 边）
    expect(invalidEdge.label).toBe('退回')
    const plain = out.edges.find((e) => e.from === 'start')!
    expect(plain.invalid).toBeFalsy()
    expect(plain.dashed).toBeFalsy()
  })

  it('布局忠实保留拖拽坐标（不重排版）', () => {
    const gate = out.nodes.find((n) => n.id === 'gate')!
    expect([gate.x, gate.y]).toEqual([240, 0])
  })
})
