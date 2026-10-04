// 模型路由守门（qoder：三档成本/思考强度四档/归一）。
import { describe, it, expect } from 'vitest'
import { autoRoute, normalizeThinkLevel, resolveAutoRouteTarget, normalizeTierRouteMap } from '../model-routing'

describe('Auto 模型路由（qoder 语义）', () => {
  it('三档成本+思考强度联动；思考档位归一', () => {
    expect(autoRoute({ complexity: 'simple' })).toMatchObject({ tier: 'economy', thinkLevel: 'low' })
    expect(autoRoute({ complexity: 'standard' })).toMatchObject({ tier: 'standard', thinkLevel: 'medium' })
    expect(autoRoute({ complexity: 'complex' })).toMatchObject({ tier: 'power', thinkLevel: 'max' })
    expect(normalizeThinkLevel('high')).toBe('high')
    expect(normalizeThinkLevel('bogus')).toBe('medium')
    expect(normalizeThinkLevel(undefined)).toBe('medium')
  })
})

// ── P3 接线（2026-10-04 九源轮）：档位映射解析 ──
describe('P3 resolveAutoRouteTarget / normalizeTierRouteMap', () => {
  it('复杂度→档位→具体模型全链；缺档如实 unmapped 不猜模型', () => {
    const map = { economy: { providerId: 'glm', modelId: 'flash' }, power: { providerId: 'glm', modelId: 'max' } }
    expect(resolveAutoRouteTarget('simple', map)).toMatchObject({ tier: 'economy', target: { modelId: 'flash' }, unmapped: false })
    expect(resolveAutoRouteTarget('standard', map)).toMatchObject({ tier: 'standard', target: null, unmapped: true })
    expect(resolveAutoRouteTarget('complex', map)).toMatchObject({ tier: 'power', target: { modelId: 'max' }, thinkLevel: 'max' })
  })

  it('normalize：半截条目丢弃并报告，坏输入安全', () => {
    const [map, dropped] = normalizeTierRouteMap({ economy: { providerId: 'a' }, standard: { providerId: 'b', modelId: 'm' }, junk: 1 })
    expect(map.standard).toEqual({ providerId: 'b', modelId: 'm' })
    expect(dropped).toEqual(['economy'])
    expect(normalizeTierRouteMap(null)[0]).toEqual({})
    expect(normalizeTierRouteMap('bad')[0]).toEqual({})
  })
})
