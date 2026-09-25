// 缓存 miss 归因守门（cc：归因优先序/命中率档位/建议文案）。
import { describe, it, expect } from 'vitest'
import { attributeCacheMiss } from '../cache-attribution'

describe('缓存 miss 归因（cc 语义）', () => {
  it('归因优先序（首个已知）；命中率三档', () => {
    expect(attributeCacheMiss({ hitRate: 0.8, causes: ['model-switched', 'unknown'] })).toMatchObject({
      cause: 'model-switched', level: 'good',
    })
    expect(attributeCacheMiss({ hitRate: 0.5, causes: ['unknown', 'tool-schema-changed'] })).toMatchObject({
      cause: 'tool-schema-changed', level: 'low',
    })
    const c = attributeCacheMiss({ hitRate: 0.1, causes: ['unknown'] })
    expect(c).toMatchObject({ cause: 'unknown', level: 'critical' })
    expect(c.suggestion).toContain('四面对比')
    expect(attributeCacheMiss({ hitRate: 0.5, causes: ['history-prefix-changed'] }).suggestion).toContain('409')
  })
})
