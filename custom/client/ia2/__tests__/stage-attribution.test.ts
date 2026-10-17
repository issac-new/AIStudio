// 页签级阶段归属单一事实源（2026-10-17 层级批第二阶段）：
// 阶段页挂出的每个工具目标、搭建五步的每个落点都必须在归属表里有条目；
// 路径最长前缀解析、单/多/全程三种归属形态、阶段页恒等归属。
import { describe, it, expect } from 'vitest'
import {
  hasStageAttribution,
  routeNameForPath,
  stageCircles,
  stageKeyOf,
  stageOwnersForPath,
  stageOwnersForRouteName,
  stageToolTargetPaths,
  setupStepTargetNames,
} from '../stage-attribution'

describe('stage-attribution — 页签级归属单一事实源', () => {
  it('阶段页工具卡与搭建步落点全部登记（可见性与归属两本账都对得上）', () => {
    for (const p of stageToolTargetPaths()) {
      const name = routeNameForPath(p)
      expect(name, `工具卡落点未登记路径：${p}`).not.toBeNull()
      expect(hasStageAttribution(name!), `工具卡落点未登记归属：${p}`).toBe(true)
    }
    for (const n of setupStepTargetNames()) {
      expect(hasStageAttribution(n), `搭建步落点未登记归属：${n}`).toBe(true)
    }
  })

  it('路径最长前缀解析（段边界安全）', () => {
    expect(routeNameForPath('/app/sim/supervision')).toBe('ia2.simSupervision')
    expect(routeNameForPath('/app/sim')).toBe('ia2.sim')
    expect(routeNameForPath('/app/gov/model-providers')).toBe('ia2.modelProviders')
    expect(routeNameForPath('/app/simulation')).toBe(null)
    expect(stageOwnersForPath('/app/gov/org-assets')).toEqual([1])
    expect(stageOwnersForPath('/app/bpa')).toEqual([])
    expect(hasStageAttribution('ia2.bpa')).toBe(true)
    expect(hasStageAttribution('ia2.unknown')).toBe(false)
  })

  it('单归属/多归属/全程三种形态', () => {
    expect(stageOwnersForRouteName('ia2.govOrgAssets')).toEqual([1])
    expect(stageOwnersForRouteName('ia2.simSupervision')).toEqual([3, 4])
    expect(stageOwnersForRouteName('ia2.sim')).toEqual([])
    expect(stageOwnersForRouteName('ia2.simSettings')).toEqual([])
    expect(stageCircles([3, 4])).toBe('③④')
    expect(stageKeyOf(4)).toBe('stage4')
  })

  it('阶段页自身恒等归属', () => {
    for (const no of [1, 2, 3, 4, 5, 6] as const) {
      expect(stageOwnersForRouteName(`ia2.stage${no}`)).toEqual([no])
    }
  })
})
