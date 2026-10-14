// bpa 端到端链路面测试：路径枚举/逐跳交接物/孤岛/环路/断头（bpa-e2e.ts）。
import { describe, it, expect } from 'vitest'
import { enumerateE2E, downstreamAdjacency } from '../bpa-e2e'
import type { BpaNode } from '../bpa-types'
import { seedArchitecture } from '../bpa-seed'

function n(partial: Partial<BpaNode> & { id: string; level: number; parentId: string | null }): BpaNode {
  return { name: `节点${partial.id}`, updatedAt: 0, ...partial } as BpaNode
}
const L3 = (id: string, extra: Partial<BpaNode> = {}): BpaNode =>
  n({ id, level: 3, parentId: `P-${id}`, ...extra })

describe('bpa-e2e', () => {
  it('邻接合并：supports 与 drivers 双视图等价、悬空引用跳过', () => {
    const l3s = [
      L3('A', { supports: ['B'] }),
      L3('B', { drivers: ['A'] }),       // 与上互为同一语义
      L3('C', { drivers: ['B'] }),       // B 驱动 C（drivers 视图）
      L3('D', { drivers: ['X-不存在'] }), // 悬空
    ]
    const adj = downstreamAdjacency(l3s)
    expect(adj.get('A')).toEqual(['B'])
    expect(adj.get('B')).toEqual(['C'])  // 仅一条（去重）
    expect(adj.get('D')).toEqual([])
  })

  it('链路枚举：起点→终点全路径 + 最长优先 + 逐跳交接物', () => {
    const l3s = [
      L3('A', { supports: ['B', 'C'], outputs: ['PR'] }),
      L3('B', { drivers: ['A'], inputs: ['PR'], outputs: ['报告'], supports: ['D'] }),
      L3('C', { drivers: ['A'], inputs: ['PR'], outputs: ['报告'], supports: ['D'] }),
      L3('D', { drivers: ['B', 'C'], inputs: ['报告'] }),
    ]
    const r = enumerateE2E(l3s)
    expect(r.paths).toHaveLength(2)
    expect(r.paths[0].steps).toEqual(['A', 'B', 'D'])
    expect(r.paths[0].handoffs).toEqual(['PR', '报告'])
    expect(r.strandedL3).toEqual([])
    expect(r.unlinkedL3).toEqual([])
    expect(r.cycleL3).toEqual([])
  })

  it('孤岛：完全无引用的 L3 进 unlinked；反向视图（B 被 A 支撑）不算孤岛', () => {
    const l3s = [
      L3('A', { supports: ['B'] }),
      L3('B'),                 // A→B 即终点（A 无上游）→ 合法 2 步路径；B 有入边不算孤岛
      L3('孤儿'),               // 无任何引用
    ]
    const r = enumerateE2E(l3s)
    expect(r.unlinkedL3).toEqual(['孤儿'])
    expect(r.paths.map((p) => p.steps.join('>'))).toEqual(['A>B'])
    expect(r.strandedL3).toEqual([])
  })

  it('环路：驱动成环的节点全量进 cycleL3 且不入路径', () => {
    const l3s = [
      L3('A', { supports: ['X'] }),
      L3('X', { supports: ['Y'] }),
      L3('Y', { supports: ['X'] }), // X⇄Y 环
      L3('B', { drivers: ['A'] }),  // A→B 正常尾巴
    ]
    const r = enumerateE2E(l3s)
    expect(new Set(r.cycleL3)).toEqual(new Set(['X', 'Y']))
    expect(r.paths.map((p) => p.steps.join('>'))).toEqual(['A>B'])
    expect(r.strandedL3).toEqual([]) // 环路节点不计 stranded（单独呈现）
  })

  it('有界：路径数封顶 60、深度封顶 12 不失控', () => {
    // 链式 A1→A2→…→A15（超深度）+ 分层菱形 60 条路径上限
    const chain = Array.from({ length: 15 }, (_, i) => L3(`C${i}`, i === 0 ? { supports: [`C${i + 1}`] } : i === 14 ? {} : { drivers: [`C${i - 1}`], supports: [`C${i + 1}`] }))
    const r1 = enumerateE2E(chain)
    expect(r1.paths).toHaveLength(0) // 深度 >12 的路径被丢弃（15 节点链超过 MAX_DEPTH）
    const fan = Array.from({ length: 6 }, (_, i) => L3(`S${i}`, { supports: ['M1', 'M2', 'M3'] }))
    fan.push(L3('M1', { drivers: [] }), L3('M2', {}), L3('M3', {}))
    const r2 = enumerateE2E(fan)
    expect(r2.paths.length).toBeLessThanOrEqual(60)
    expect(r2.paths.length).toBe(18) // 6 起点 × 3 中转
  })

  it('种子示例：端到端路径非空且零孤岛零环路（全合规叙事的链路维度）', () => {
    const r = enumerateE2E(seedArchitecture().nodes)
    expect(r.paths.length).toBeGreaterThanOrEqual(3)
    expect(r.unlinkedL3).toEqual([])
    expect(r.cycleL3).toEqual([])
    expect(r.strandedL3).toEqual([])
    // 最长路径应跨域（需求→实现→验证类）
    expect(r.paths[0].steps.length).toBeGreaterThanOrEqual(3)
  })
})
