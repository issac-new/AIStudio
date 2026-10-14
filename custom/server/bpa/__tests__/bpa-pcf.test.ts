// bpa PCF 对标面测试：参照集完整性、显式映射优先、名称启发兜底、差距汇总、未映射自留域。
import { describe, it, expect } from 'vitest'
import { PCF_CATEGORIES, pcfGapReport } from '../bpa-pcf'
import { seedArchitecture } from '../bpa-seed'

describe('bpa-pcf', () => {
  it('参照集：12 大跨行业分类、编号唯一、分区合法', () => {
    expect(PCF_CATEGORIES).toHaveLength(12)
    const codes = PCF_CATEGORIES.map((c) => c.code)
    expect(new Set(codes).size).toBe(12)
    for (const c of PCF_CATEGORIES) {
      expect(c.nameZh.length).toBeGreaterThan(2)
      expect(c.groupsZh.length).toBeGreaterThanOrEqual(3)
      expect(['OPERATING', 'ENABLING', 'SUPPORTING']).toContain(c.section)
    }
  })

  it('显式映射优先：pcfRef 命中即 covered（by=ref）', () => {
    const r = pcfGapReport([{ id: 'L1-01', name: '需求交付', pcfRef: '4.0' }])
    const row4 = r.rows.find((x) => x.code === '4.0')!
    expect(row4.status).toBe('covered')
    expect(row4.matched).toEqual([{ id: 'L1-01', name: '需求交付', by: 'ref' }])
  })

  it('名称启发兜底：无 pcfRef 时按别名包含匹配（by=name）；已显式映射到别处不再启发', () => {
    const r = pcfGapReport([{ id: 'L1-09', name: '安全与合规' }])
    const row10 = r.rows.find((x) => x.code === '10.0')!
    expect(row10.status).toBe('covered')
    expect(row10.matched[0].by).toBe('name')
    // 显式映射到 10.0 的同名节点不再被 7.0「安全」别名启发误匹配
    const r2 = pcfGapReport([{ id: 'L1-09', name: '安全与合规', pcfRef: '10.0' }])
    expect(r2.rows.find((x) => x.code === '7.0')!.matched).toEqual([])
    expect(r2.rows.find((x) => x.code === '10.0')!.matched[0].by).toBe('ref')
  })

  it('差距汇总与未映射自留域', () => {
    const r = pcfGapReport([
      { id: 'L1-A', name: '交付', pcfRef: '4.0' },
      { id: 'L1-B', name: '神秘域' },
    ])
    expect(r.summary.total).toBe(12)
    expect(r.summary.covered).toBe(1)
    expect(r.summary.missing).toBe(11)
    expect(r.unmappedMine).toEqual([{ id: 'L1-B', name: '神秘域' }])
  })

  it('种子对标：6 域显式映射 → 覆盖 6/12，缺 6 类（真实差距演示面）', () => {
    const seeded = seedArchitecture()
    const r = pcfGapReport(seeded.nodes.filter((n) => n.level === 1).map((n) => ({ id: n.id, name: n.name, pcfRef: n.pcfRef })))
    expect(r.summary.covered).toBe(6)
    const missing = r.rows.filter((x) => x.status === 'missing').map((x) => x.code)
    expect(missing.sort((a, b) => Number(a) - Number(b))).toEqual(['1.0', '2.0', '3.0', '6.0', '9.0', '11.0'])
    expect(r.unmappedMine).toEqual([])
  })
})
