// 三档扫描守门（qoder：按风险选档/发现分级/成本递增）。
import { describe, it, expect } from 'vitest'
import { gradeFinding, planScan } from '../code-security'

describe('三档扫描（qoder 语义）', () => {
  it('按风险选档（静态/语义/数据流逐级叠加）', () => {
    expect(planScan('low').tiers).toEqual(['static'])
    expect(planScan('medium').tiers).toEqual(['static', 'semantic'])
    expect(planScan('high').tiers).toEqual(['static', 'semantic', 'dataflow'])
  })

  it('发现分级（tier 深度定默认 severity；可显式覆盖）', () => {
    expect(gradeFinding({ tier: 'static', file: 'a', line: 1, detail: 'x' })).toMatchObject({ severity: 'low' })
    expect(gradeFinding({ tier: 'semantic', file: 'a', line: 1, detail: 'x' })).toMatchObject({ severity: 'medium' })
    expect(gradeFinding({ tier: 'dataflow', file: 'a', line: 1, detail: 'x' })).toMatchObject({ severity: 'high' })
    expect(gradeFinding({ tier: 'static', file: 'a', line: 1, detail: 'x', severity: 'high' })).toMatchObject({ severity: 'high' })
  })
})
