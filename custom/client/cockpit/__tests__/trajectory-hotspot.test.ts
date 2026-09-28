// hotspot 聚合守门（dsh：工具/阶段排名/own-duration 防重复计数）。
import { describe, it, expect } from 'vitest'
import { buildHotspots, type HotspotEvent } from '../adapters/trajectory-hotspot'

const ev = (kind: 'tool' | 'llm', name: string, durationMs: number, over: Partial<HotspotEvent> = {}): HotspotEvent => ({ kind, name, durationMs, ...over })

describe('hotspot 排名（dsh 时间去哪了）', () => {
  it('工具排名降序+own-duration 防双计；阶段排名', () => {
    const h = buildHotspots([
      ev('tool', 'read', 1000), ev('tool', 'read', 500),
      ev('tool', 'patch', 800),
      ev('tool', 'nested', 900, { parentOf: 'read' }),  // 子步不计
      ev('llm', 'x', 200, { phase: 'ttft' }), ev('llm', 'x', 3000, { phase: 'decode' }),
    ])
    expect(h.byTool.map((e) => e.key)).toEqual(['read', 'patch'])  // read 1500 > patch 800；nested 不计
    expect(h.byTool[0]).toMatchObject({ count: 2, avgMs: 750 })
    expect(h.byPhase.map((e) => [e.key, e.totalMs])).toEqual([['decode', 3000], ['ttft', 200]])
    expect(buildHotspots([], 3)).toEqual({ byTool: [], byPhase: [] })
  })
})
