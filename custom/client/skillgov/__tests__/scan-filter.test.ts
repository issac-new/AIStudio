// overlay/custom/client/skillgov/__tests__/scan-filter.test.ts
// 技能扫描筛选守门（2026-10-19 P2-7）：左栏搜索 + 判定档位。
import { describe, it, expect } from 'vitest'
import { filterScanRows } from '../utils/filter'

const rows = [
  { name: 'tavily-search', dir: '/skills/tavily', verdict: 'safe' },
  { name: 'wechat-article', dir: '/skills/wechat', verdict: 'caution' },
  { name: 'danger-shell', dir: '/skills/danger', verdict: 'dangerous' },
]

describe('filterScanRows', () => {
  it('空查询 + all 原样返回', () => {
    expect(filterScanRows(rows, '', 'all')).toHaveLength(3)
  })
  it('按名称/目录搜索（大小写不敏感）', () => {
    expect(filterScanRows(rows, 'TAVILY', 'all').map(r => r.name)).toEqual(['tavily-search'])
    expect(filterScanRows(rows, 'wechat', 'all').map(r => r.name)).toEqual(['wechat-article'])
  })
  it('判定档位与搜索取交集', () => {
    expect(filterScanRows(rows, '', 'caution').map(r => r.name)).toEqual(['wechat-article'])
    expect(filterScanRows(rows, 'search', 'dangerous')).toEqual([])
  })
  it('空白查询不误伤', () => {
    expect(filterScanRows(rows, '   ', 'all')).toHaveLength(3)
  })
})
