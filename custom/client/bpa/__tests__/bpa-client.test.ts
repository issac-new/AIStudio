// 流程架构客户端测试：i18n zh/en 键齐平 + 路由注册冒烟 + PEMM 常量完整性（skillgov 同款纪律）。
import { describe, it, expect } from 'vitest'
import { bpaMessages } from '../i18n'
import { PEMM_FACTORS, PEMM_LEVEL_NAMES, pemmOverall, pemmProgress, type PemmScores } from '../pemm'

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
    expect(zh.tabs).toHaveProperty('admission')
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

  it('第三轮结构：体检留痕/评审周期/雷达趋势/导出键齐备', () => {
    const zh = bpaMessages.zh.bpa
    expect(zh.governance).toHaveProperty('auditTitle')
    expect(zh.governance).toHaveProperty('reviewOverdue')
    expect(zh.governance).toHaveProperty('exportBtn')
    expect(Object.keys(zh.governance.sourceNames).sort()).toEqual(['validate', 'write'])
    expect(Object.keys(zh.governance.auditCol).sort()).toEqual(['at', 'high', 'kpi', 'medium', 'owner', 'source'])
    expect(zh.maturity).toHaveProperty('radarTitle')
    expect(zh.maturity).toHaveProperty('trendTitle')
  })

  it('PEMM：5 能动因素 + 4 企业能力 + P0-P4 五级', () => {
    expect(PEMM_FACTORS.filter((f) => f.board === 'enabler')).toHaveLength(5)
    expect(PEMM_FACTORS.filter((f) => f.board === 'capability')).toHaveLength(4)
    expect(new Set(PEMM_FACTORS.map((f) => f.key)).size).toBe(9)
    expect(PEMM_LEVEL_NAMES.map((l) => l.level)).toEqual([0, 1, 2, 3, 4])
  })
})

describe('PEMM 总体成熟度：九项打齐才给结论（2026-11-28）', () => {
  const all = (level: number) => Object.fromEntries(PEMM_FACTORS.map((f) => [f.key, level]))

  it('九项全 3：总体 P3，九项都是最短板', () => {
    const r = pemmOverall(all(3))
    expect(r).toMatchObject({ complete: true, overall: 3, scoredCount: 9, missing: [] })
    expect(r.weakest).toHaveLength(9)
  })

  it('九项打齐、其中一项最低：总体取最低分，最短板只列最低的那项', () => {
    const r = pemmOverall({ ...all(4), staff: 1, culture: 1 })
    expect(r.complete).toBe(true)
    expect(r.overall).toBe(1)
    expect(r.weakest).toEqual(['流程员工', '文化'])
  })

  it('只打一项 P4：不给总体结论——没打分的八项可能正是最短板', () => {
    const r = pemmOverall({ design: 4 })
    expect(r.complete).toBe(false)
    expect(r.overall).toBeNull()
    expect(r.weakest).toEqual([])
    expect(r.scoredCount).toBe(1)
    expect(r.missing).toHaveLength(8)
    expect(r.missing).toContain('staff')
  })

  it('差一项没打：即使已打八项全是 P4，也不给结论', () => {
    const { owner, ...rest } = all(4)
    const r = pemmOverall(rest)
    expect(r.complete).toBe(false)
    expect(r.overall).toBeNull()
    expect(r.missing).toEqual(['owner'])
  })

  it('空表与空值：进度为零、无结论', () => {
    expect(pemmOverall({})).toMatchObject({ complete: false, overall: null, scoredCount: 0 })
    expect(pemmOverall(null)).toMatchObject({ complete: false, overall: null, scoredCount: 0 })
    expect(pemmOverall(undefined)).toMatchObject({ complete: false, overall: null, scoredCount: 0 })
  })

  it('非法分值不算已打分：超出 0–4、小数、字符串、NaN 都记为未打', () => {
    const r = pemmOverall({ ...all(2), design: 5, staff: 1.5, owner: '3', infrastructure: NaN })
    expect(r.scoredCount).toBe(5)
    expect(r.missing.sort()).toEqual(['design', 'infrastructure', 'owner', 'staff'])
    expect(r.complete).toBe(false)
  })

  it('表里的多余键不参与：打了一堆不存在的因素不算进度', () => {
    const r = pemmOverall({ ghost: 4, another: 3 } as PemmScores)
    expect(r.scoredCount).toBe(0)
    expect(r.missing).toHaveLength(9)
  })
})

describe('场景准入（2026-11-28 B2/B3）', () => {
  it('admission 命名空间键齐备（四规则三态、推导、签署）', () => {
    const zh = bpaMessages.zh.bpa
    expect(zh.tabs).toHaveProperty('admission')
    for (const k of ['hint', 'ruleOwner', 'ruleBaseline', 'ruleData', 'ruleMajor', 'verdictHit', 'verdictUndetermined', 'verdictClear', 'derivedEligible', 'derivedBlocked', 'conclusionPilot', 'conclusionDeferred', 'signPilot', 'signDeferred']) {
      expect(zh.admission, `admission.${k}`).toHaveProperty(k)
    }
    for (const k of ['admissionFields', 'trigger', 'dataCompliance', 'complianceCleared', 'compliancePending', 'complianceNone', 'majorImpact', 'reviewer']) {
      expect(zh.registry, `registry.${k}`).toHaveProperty(k)
    }
  })
})
