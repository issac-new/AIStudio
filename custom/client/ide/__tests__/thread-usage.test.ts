// ThreadUsage 分组守门（codex：(model,effort) 分组降序/日桶升序/总量）。
import { describe, it, expect } from 'vitest'
import { buildThreadUsage } from '../utils/thread-usage'

describe('ThreadUsage 分组（codex 语义）', () => {
  it('(model,effort) 分组降序；effort 缺省 default；日桶升序', () => {
    const b = buildThreadUsage([
      { model: 'glm', effort: 'high', tokens: 300, day: '2026-09-22' },
      { model: 'glm', effort: 'high', tokens: 200, day: '2026-09-23' },
      { model: 'glm', effort: 'low', tokens: 50, day: '2026-09-22' },
      { model: 'qwen', tokens: 100, day: '2026-09-21' },
    ])
    expect(b.groups.map((g) => [g.key, g.tokens])).toEqual([['glm·high', 500], ['qwen·default', 100], ['glm·low', 50]])
    expect(b.groups[0].turns).toBe(2)
    expect(b.daily.map((d) => d.day)).toEqual(['2026-09-21', '2026-09-22', '2026-09-23'])
    expect(b.totalTokens).toBe(650)
    expect(buildThreadUsage([])).toMatchObject({ groups: [], totalTokens: 0 })
  })
})
