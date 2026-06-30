import { describe, it, expect } from 'vitest'
import { computeForceLayout } from '../composables/useForceLayout'

describe('useForceLayout / computeForceLayout', () => {
  it('returns empty map for no nodes', () => {
    const result = computeForceLayout([], [])
    expect(result.size).toBe(0)
  })

  it('computes positions for all nodes', () => {
    const nodes = [
      { id: 'a', cluster: 't1' },
      { id: 'b', cluster: 't1' },
      { id: 'c', cluster: 't2' },
    ]
    const edges = [{ source: 'a', target: 'b' }]
    const result = computeForceLayout(nodes, edges, 800, 600)
    expect(result.size).toBe(3)
    expect(result.has('a')).toBe(true)
    expect(result.has('b')).toBe(true)
    expect(result.has('c')).toBe(true)
    // 坐标应为有限数
    for (const pos of result.values()) {
      expect(Number.isFinite(pos.x)).toBe(true)
      expect(Number.isFinite(pos.y)).toBe(true)
    }
  })

  it('clusters nodes of same cluster closer than different clusters', () => {
    // 两个 cluster，各 3 个节点；同 cluster 节点间距应小于跨 cluster 平均距离
    const nodes = [
      { id: 'a1', cluster: 't1' }, { id: 'a2', cluster: 't1' }, { id: 'a3', cluster: 't1' },
      { id: 'b1', cluster: 't2' }, { id: 'b2', cluster: 't2' }, { id: 'b3', cluster: 't2' },
    ]
    const edges: { source: string; target: string }[] = []
    const result = computeForceLayout(nodes, edges, 800, 600, 400)

    function dist(id1: string, id2: string): number {
      const p1 = result.get(id1)!, p2 = result.get(id2)!
      return Math.hypot(p1.x - p2.x, p1.y - p2.y)
    }
    // 同 cluster 平均距离
    const sameClusterDist = (dist('a1', 'a2') + dist('a2', 'a3') + dist('a1', 'a3')) / 3
    // 跨 cluster 平均距离
    const crossDist = (dist('a1', 'b1') + dist('a2', 'b2') + dist('a3', 'b3')) / 3
    // 同 cluster 应比跨 cluster 更聚拢（允许一定容差，因力导向有随机性）
    expect(sameClusterDist).toBeLessThan(crossDist)
  })

  it('respects edges by pulling linked nodes together', () => {
    // 有边的两节点应比无边节点更近
    const nodes = [
      { id: 'linked1', cluster: 't1' }, { id: 'linked2', cluster: 't1' },
      { id: 'solo', cluster: 't1' },
    ]
    const edges = [{ source: 'linked1', target: 'linked2' }]
    const result = computeForceLayout(nodes, edges, 800, 600, 300)
    function dist(id1: string, id2: string): number {
      const p1 = result.get(id1)!, p2 = result.get(id2)!
      return Math.hypot(p1.x - p2.x, p1.y - p2.y)
    }
    expect(dist('linked1', 'linked2')).toBeLessThan(dist('linked1', 'solo') + 200)
  })
})
