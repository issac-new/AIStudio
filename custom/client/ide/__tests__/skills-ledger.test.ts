// 技能清单守门（P0-3：skills=commands 合并口径/四品牌来源/成本 null 不显示）。
import { describe, it, expect } from 'vitest'
import { buildSkillsLedger, skillsSummary, type SkillEvent } from '../utils/skills-ledger'

const e = (over: Partial<SkillEvent> & { name: string }): SkillEvent => ({ kind: 'skill', ...over })

describe('技能清单（合并口径）', () => {
  it('技能与命令同表；四品牌来源映射；成本 null 不显示', () => {
    const ledger = buildSkillsLedger([
      e({ name: 'b-skill', kind: 'skill', source: '.claude', tokenCost: 1500 }),
      e({ name: 'a-cmd', kind: 'command', source: 'builtin', tokenCost: 0 }),
      e({ name: 'c-sk', source: 'project' }),
    ])
    expect(ledger.map((x) => x.name)).toEqual(['a-cmd', 'b-skill', 'c-sk'])  // 字典序
    expect(ledger[0]).toMatchObject({ isSkill: false, source: 'builtin', tokenCost: null })
    expect(ledger[1]).toMatchObject({ source: 'interop', tokenCost: 1500 })
    expect(skillsSummary(ledger)).toEqual({ skills: 2, commands: 1, interop: 1, enabled: 3 })
  })

  it('启用态默认 true；描述截 120', () => {
    const ledger = buildSkillsLedger([e({ name: 'x', enabled: false, description: 'y'.repeat(200) })])
    expect(ledger[0].enabled).toBe(false)
    expect(ledger[0].description).toHaveLength(120)
  })
})
