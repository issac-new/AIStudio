// 流程架构客户端测试：i18n zh/en 键齐平 + 路由注册冒烟 + PEMM 常量完整性（skillgov 同款纪律）。
import { describe, it, expect } from 'vitest'
import { bpaMessages } from '../i18n'
import { PEMM_FACTORS, PEMM_LEVEL_NAMES } from '../pemm'

function assertKeyParity(a: unknown, b: unknown, path: string): void {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return
  const ka = Object.keys(a as object).sort()
  const kb = Object.keys(b as object).sort()
  expect(ka, `键不齐平 @${path}`).toEqual(kb)
  for (const k of ka) {
    assertKeyParity((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`)
  }
}

describe('bpa 客户端', () => {
  it('i18n zh/en 全树键齐平（递归）', () => {
    assertKeyParity(bpaMessages.zh, bpaMessages.en, 'root')
  })

  it('navTitle/navLabel/页签/八规则文案齐备', () => {
    const zh = bpaMessages.zh.bpa
    expect(zh.navTitle).toContain('流程架构')
    expect(zh.tabs).toHaveProperty('registry')
    expect(zh.tabs).toHaveProperty('map')
    expect(zh.tabs).toHaveProperty('link')
    expect(zh.tabs).toHaveProperty('pcf')
    expect(zh.tabs).toHaveProperty('governance')
    expect(zh.tabs).toHaveProperty('maturity')
    expect(Object.keys(zh.governance.ruleNames)).toEqual([
      'MISSING_OWNER', 'MISSING_KPI', 'ORPHAN_L3', 'DEPTH_EXCEEDED',
      'LEVEL_SKIP', 'BAD_ID', 'SECTION_INVALID', 'DANGLING_REF',
    ])
    expect(Object.keys(zh.levelNames)).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(Object.keys(zh.sectionNames).sort()).toEqual(['ENABLING', 'MANAGING', 'OPERATING', 'SUPPORTING'])
    expect(Object.keys(zh.decompositionNames).sort()).toEqual(['functional', 'lifecycle', 'pdca', 'scenario'])
  })

  it('第二轮结构：链路面/PCF 对标面/五步法/五误区键齐备', () => {
    const zh = bpaMessages.zh.bpa
    expect(zh.link.pathsTitle).toContain('端到端路径')
    expect(Object.keys(zh.pcf.traps).sort()).toEqual(['t1', 't2', 't3', 't4', 't5'])
    expect(Object.keys(zh.pcf.steps).filter((k) => k.startsWith('s') && !k.endsWith('d')).sort()).toEqual(['s1', 's2', 's3', 's4', 's5'])
    expect(zh.pcf.steps).toHaveProperty('s1d')
    expect(zh.registry).toHaveProperty('pcfRef')
  })

  it('PEMM：5 能动因素 + 4 企业能力 + P0-P4 五级', () => {
    expect(PEMM_FACTORS.filter((f) => f.board === 'enabler')).toHaveLength(5)
    expect(PEMM_FACTORS.filter((f) => f.board === 'capability')).toHaveLength(4)
    expect(new Set(PEMM_FACTORS.map((f) => f.key)).size).toBe(9)
    expect(PEMM_LEVEL_NAMES.map((l) => l.level)).toEqual([0, 1, 2, 3, 4])
  })
})
