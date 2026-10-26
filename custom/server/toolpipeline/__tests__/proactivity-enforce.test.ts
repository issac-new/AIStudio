// enforce-gate 两轴策略源守门测试（挂账清偿批 H4）：四级链位置、三规则、
// 审批桥归类、总闸默认零行为变化。
import { describe, it, expect } from 'vitest'

import {
  APPROVAL_CLASS_RULES,
  evaluateEnforcement,
  proactivityRestriction,
  type EnforceEnv,
} from '../enforce-gate'

const L4 = { level: 'L4' as const }
const L4_CONTRACT = { level: 'L4' as const, contract: { goalExplicit: true, acceptanceCriteria: true } }

function envProact(policy: unknown, extra: Partial<EnforceEnv> = {}): EnforceEnv {
  return { masterOn: true, proactivityOn: true, proactivityOf: () => policy as never, ...extra }
}

describe('proactivityRestriction 纯函数', () => {
  it('read 类=观察面恒放行（含 L5——告知也要能看）', () => {
    expect(proactivityRestriction('read_file', { path: '/tmp/x' }, { level: 'L5' })).toBeNull()
    expect(proactivityRestriction('memory_search', { q: 'x' }, { level: 'L5' })).toBeNull()
  })

  it('L5 非 read → inform-only；L4 无契约 → draft-cap；L4 有契约 fresh → 放行', () => {
    expect(proactivityRestriction('write_file', { path: '/tmp/x' }, { level: 'L5' })!.rule).toBe('proactivity-inform-only')
    expect(proactivityRestriction('write_file', { path: '/tmp/x' }, L4)!.rule).toBe('proactivity-draft-cap')
    expect(proactivityRestriction('write_file', { path: '/tmp/x' }, { ...L4_CONTRACT, goalStatus: 'fresh' as const })).toBeNull()
  })

  it('漂移防线：L4 契约齐备但 stale/never-confirmed → goal-drift（契约不豁免）；L1-L3 恒过', () => {
    expect(proactivityRestriction('write_file', { path: '/x' }, { ...L4_CONTRACT, goalStatus: 'stale' as const })!.rule).toBe('proactivity-goal-drift')
    expect(proactivityRestriction('write_file', { path: '/x' }, { ...L4_CONTRACT, goalStatus: 'never-confirmed' as const })!.rule).toBe('proactivity-goal-drift')
    expect(proactivityRestriction('write_file', { path: '/x' }, { level: 'L3', goalStatus: 'stale' as const })).toBeNull()
  })

  it('高危命令在 L4 有契约下仍放行两轴面（纵轴代价由阶梯/风险链约束——不双算）', () => {
    expect(proactivityRestriction('terminal_exec', { command: 'rm -rf /tmp/xx' }, { ...L4_CONTRACT, goalStatus: 'fresh' as const })).toBeNull()
  })
})

describe('evaluateEnforcement 四级链接线', () => {
  it('总闸默认关（proactivityOn 未给且 env 未设）→ 两轴不执法', () => {
    delete process.env.HERMES_PROACTIVITY_ENFORCE
    const v = evaluateEnforcement('write_file', { path: '/x' }, 'p1', {
      masterOn: true,
      proactivityOf: () => ({ level: 'L5' }),
    })
    expect(v.rule).not.toMatch(/^proactivity-/)
  })

  it('总闸开+L5 策略：写工具拒 inform-only；读工具穿过两轴（后续无阶梯/模式=no-config）', () => {
    const v = evaluateEnforcement('write_file', { path: '/x' }, 'p1', envProact({ level: 'L5' }))
    expect(v).toMatchObject({ enforcing: true, allow: false, rule: 'proactivity-inform-only' })
    const r = evaluateEnforcement('read_file', { path: '/x' }, 'p1', envProact({ level: 'L5' }))
    expect(r.rule).not.toMatch(/^proactivity-/)
  })

  it('L4 无契约拒 draft-cap；有契约+fresh 放行；漂移拒 goal-drift', () => {
    expect(evaluateEnforcement('write_file', { path: '/x' }, 'p1', envProact(L4)).rule).toBe('proactivity-draft-cap')
    expect(evaluateEnforcement('write_file', { path: '/x' }, 'p1', envProact({ ...L4_CONTRACT, goalStatus: 'fresh' })).rule)
      .not.toMatch(/^proactivity-/)
    expect(evaluateEnforcement('write_file', { path: '/x' }, 'p1', envProact({ ...L4_CONTRACT, goalStatus: 'stale' })).rule)
      .toBe('proactivity-goal-drift')
  })

  it('该 profile 无两轴策略 → 不执法（不装已治理）', () => {
    const v = evaluateEnforcement('write_file', { path: '/x' }, 'p1', envProact(null))
    expect(v.rule).not.toMatch(/^proactivity-/)
  })

  it('draft-cap 进审批桥（人核=起草语义闭环）；inform-only/goal-drift 不可批', () => {
    expect(APPROVAL_CLASS_RULES.has('proactivity-draft-cap')).toBe(true)
    expect(APPROVAL_CLASS_RULES.has('proactivity-inform-only')).toBe(false)
    expect(APPROVAL_CLASS_RULES.has('proactivity-goal-drift')).toBe(false)
  })
})
