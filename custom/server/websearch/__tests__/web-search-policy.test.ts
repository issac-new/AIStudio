// web_search 四档+域收敛守门（codex：四档判定/交集收敛/域准入）。
import { describe, it, expect } from 'vitest'
import { SEARCH_TIERS, convergeDomains, domainAllowed, searchVerdict } from '../web-search-policy'

describe('搜索四档（codex 语义）', () => {
  it('四档冻结；off 禁搜；light 仅摘录；agent 自决', () => {
    expect([...SEARCH_TIERS]).toEqual(['off', 'light', 'full', 'agent'])
    expect(searchVerdict('off')).toMatchObject({ allowed: false })
    expect(searchVerdict('light')).toMatchObject({ allowed: true, consumption: 'excerpt-only' })
    expect(searchVerdict('full').consumption).toBe('full')
    expect(searchVerdict('agent').detail).toContain('自决')
  })

  it('restrict_to 交集收敛（多源取交）；域准入含子域', () => {
    expect(convergeDomains([['a.com', 'b.com'], ['b.com', 'c.com']])).toEqual(['b.com'])
    expect(convergeDomains([])).toEqual([])
    expect(domainAllowed('https://api.a.com/x', ['a.com'])).toBe(true)   // 子域放行
    expect(domainAllowed('https://evil.com/', ['a.com'])).toBe(false)
    expect(domainAllowed('https://any.com/', [])).toBe(true)              // 空名单全放行
  })
})
