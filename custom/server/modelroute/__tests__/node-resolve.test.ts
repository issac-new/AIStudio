/** 节点级执行规格解析测试（2026-11-19 调度智能批）。 */
import { describe, expect, it } from 'vitest'
import { resolveNodeExecution } from '../node-resolve'
import type { TierRouteMap } from '../model-routing'

const routeMap: TierRouteMap = {
  economy: { providerId: 'engine:cheap', modelId: 'cheap-1' },
  standard: { providerId: 'engine:std', modelId: 'std-1' },
  power: { providerId: 'engine:strong', modelId: 'strong-1' },
}

describe('resolveNodeExecution', () => {
  it('无规格不 pin', () => {
    expect(resolveNodeExecution(undefined)).toEqual({ source: 'none' })
    expect(resolveNodeExecution({})).toEqual({ source: 'none' })
  })

  it('显式模型最高优先，provider/reasoning 透传', () => {
    const out = resolveNodeExecution({
      model: 'explicit', provider: 'hermes-provider', reasoning: 'high', tier: 'power',
    }, { routeMap })
    expect(out).toMatchObject({
      model: 'explicit', provider: 'hermes-provider', reasoning: 'high', source: 'explicit',
    })
  })

  it('显式 tier 命中档位映射：只回 modelId，engine providerId 仅审计', () => {
    const out = resolveNodeExecution({ tier: 'economy' }, { routeMap })
    expect(out).toMatchObject({
      model: 'cheap-1', reasoning: 'low', source: 'tier', tier: 'economy',
      routeProviderId: 'engine:cheap', unmapped: false,
    })
    expect(out.provider).toBeUndefined()
  })

  it('complexity 走 autoRoute，reasoning 取档位 thinkLevel', () => {
    const out = resolveNodeExecution({ complexity: 'complex' }, { routeMap })
    expect(out).toMatchObject({
      model: 'strong-1', reasoning: 'max', source: 'tier', tier: 'power',
    })
  })

  it('档位映射缺失时回落 defaultModel 并标 unmapped', () => {
    const out = resolveNodeExecution({ tier: 'power' }, { routeMap: {}, defaultModel: 'fallback' })
    expect(out).toMatchObject({
      model: 'fallback', source: 'default', tier: 'power', unmapped: true,
    })
  })

  it('映射与默认都缺：不猜模型', () => {
    const out = resolveNodeExecution({ complexity: 'simple' }, { routeMap: {} })
    expect(out).toMatchObject({ source: 'none', tier: 'economy', unmapped: true })
    expect(out.model).toBeUndefined()
  })
})
