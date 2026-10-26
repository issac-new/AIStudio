// 加挂微轮守门（2026-10-26）：⑥治理页签含「主动性两轴」，组件键可解析、深链合法。
import { describe, it, expect } from 'vitest'

import { STAGE_TABS, resolveTab, tabMeta } from '../stage-tabs'

describe('⑥治理·主动性两轴页签（加挂微轮）', () => {
  it('阶段 6 页签表含 proactivity，且为表尾追加（不打乱既有页签序）', () => {
    const tabs = STAGE_TABS[6]
    const keys = tabs.map((t) => t.key)
    expect(keys).toContain('proactivity')
    expect(keys[keys.length - 1]).toBe('proactivity')
    expect(keys.indexOf('gateLog')).toBe(keys.length - 2)  // 追加在质量门记录之后
    const meta = tabs.find((t) => t.key === 'proactivity')!
    expect(meta.component).toBe('proactivity')
    expect(meta.zh).toBe('主动性两轴')
  })

  it('深链 ?tab=proactivity 解析合法（tabMeta 命中），缺省页签不变', () => {
    expect(resolveTab(6, 'proactivity')).toBe('proactivity')
    expect(tabMeta(6, 'proactivity')?.component).toBe('proactivity')
    // 缺省页签仍是遗留项清算（加挂不改变落点）
    expect(resolveTab(6, undefined)).toBe('clearance')
  })

  it('其他阶段页签表不受影响（唯①搭建→环境与资产组件复用，页签键不冲突）', () => {
    for (const stage of [1, 2, 3, 4, 5] as const) {
      expect(STAGE_TABS[stage].some((t) => t.key === 'proactivity')).toBe(false)
    }
    // ①的 assets 页签仍指向 StageAssetsPanel（内含 GovRegistryRulesView→ProactivitySection 复挂面）
    expect(STAGE_TABS[1].find((t) => t.key === 'assets')!.component).toBe('assets')
  })
})
