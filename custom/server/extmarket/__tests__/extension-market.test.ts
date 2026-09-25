// 扩展市场守门（qoder：安装态三档/版本检测/入口可见性）。
import { describe, it, expect } from 'vitest'
import { marketEntryVisible, marketView, type MarketEntry } from '../extension-market'

const e = (id: string, over: Partial<MarketEntry> = {}): MarketEntry => ({
  extId: id, kind: 'skill', name: `Ext${id}`, source: 'store',
  installedVersion: null, marketVersion: '1.0', ...over,
})

describe('扩展市场（qoder 语义）', () => {
  it('安装态三档（版本检测）；字典序；入口可见性', () => {
    const v = marketView([
      e('a', { installedVersion: '1.0' }),           // installed
      e('b', { installedVersion: '0.9' }),           // update
      e('c'),                                        // available
    ])
    expect(v.entries.map((x) => [x.extId, x.state])).toEqual([['a', 'installed'], ['b', 'update'], ['c', 'available']])
    expect(v.installed).toBe(2)
    expect(v.updatable).toBe(1)
    expect(marketEntryVisible([])).toBe(false)
    expect(marketEntryVisible([e('x')])).toBe(true)
  })
})
