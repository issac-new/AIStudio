// 模型路由守门（qoder：三档成本/思考强度四档/归一）。
import { describe, it, expect } from 'vitest'
import { autoRoute, normalizeThinkLevel } from '../model-routing'

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
