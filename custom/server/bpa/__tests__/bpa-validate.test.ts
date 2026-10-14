// bpa 治理体检测试：八规则逐条触发 + 种子全合规（零高危）+ 覆盖率量化。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readArchitecture, writeArchitecture } from '../bpa-store'
import { validateArchitecture } from '../bpa-validate'
import { seedArchitecture } from '../bpa-seed'
import type { BpaNode } from '../bpa-types'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bpa-val-'))
  process.env.BPA_STORE = join(dir, 'arch.json')
  process.env.BPA_MATURITY_STORE = join(dir, 'mat.json')
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.BPA_STORE
  delete process.env.BPA_MATURITY_STORE
})

function n(partial: Partial<BpaNode> & { id: string; level: number; parentId: string | null }): BpaNode {
  return { name: `节点${partial.id}`, updatedAt: 0, ...partial } as BpaNode
}

const rules = (arch: ReturnType<typeof readArchitecture>) => validateArchitecture(arch).violations.map((v) => `${v.rule}:${v.nodeId}`)

describe('bpa-validate 八规则', () => {
  it('种子示例全合规：零违规、覆盖率 100%', () => {
    const seeded = seedArchitecture()
    const report = validateArchitecture(seeded)
    expect(report.violations).toEqual([])
    expect(report.bySeverity.high).toBe(0)
    expect(report.ownerCoverage).toBe(100)
    expect(report.kpiCoverage).toBe(100)
    expect(report.l3Count).toBe(8)
    expect(report.nodes).toBe(seeded.nodes.length)
  })

  it('缺 Owner：L3 无 owner 触发 MISSING_OWNER', () => {
    const arch = readArchitecture()
    arch.nodes = [
      n({ id: 'L1-01', level: 1, parentId: null, section: 'OPERATING', owner: '甲' }),
      n({ id: 'L2-01-01', level: 2, parentId: 'L1-01', owner: '乙' }),
      n({ id: 'L3-01-01-01', level: 3, parentId: 'L2-01-01', kpis: [{ name: 'k', target: 't' }], inputs: ['x'], drivers: ['L3-99-01-01'] }),
    ]
    expect(rules(arch)).toContain('MISSING_OWNER:L3-01-01-01')
  })

  it('缺 KPI：L3 空 kpis 触发 MISSING_KPI；配置可关', () => {
    const arch = readArchitecture()
    arch.nodes = [
      n({ id: 'L1-01', level: 1, parentId: null, section: 'OPERATING', owner: '甲' }),
      n({ id: 'L2-01-01', level: 2, parentId: 'L1-01', owner: '乙' }),
      n({ id: 'L3-01-01-01', level: 3, parentId: 'L2-01-01', owner: '丙', outputs: ['y'] }),
    ]
    expect(rules(arch)).toContain('MISSING_KPI:L3-01-01-01')
    arch.config.requireL3Kpi = false
    expect(rules(arch)).not.toContain('MISSING_KPI:L3-01-01-01')
  })

  it('断链孤岛：L3 无输入输出无驱动支撑触发 ORPHAN_L3', () => {
    const arch = readArchitecture()
    arch.nodes = [
      n({ id: 'L1-01', level: 1, parentId: null, section: 'OPERATING', owner: '甲' }),
      n({ id: 'L2-01-01', level: 2, parentId: 'L1-01', owner: '乙' }),
      n({ id: 'L3-01-01-01', level: 3, parentId: 'L2-01-01', owner: '丙', kpis: [{ name: 'k', target: 't' }] }),
    ]
    expect(rules(arch)).toContain('ORPHAN_L3:L3-01-01-01')
    // 给一条输出即接入链路
    arch.nodes[2].outputs = ['交付物']
    expect(rules(arch)).not.toContain('ORPHAN_L3:L3-01-01-01')
  })

  it('超深：level>maxDepth 触发 DEPTH_EXCEEDED', () => {
    const arch = readArchitecture()
    arch.config.maxDepth = 3
    arch.nodes = [n({ id: 'L4-01-01-01-01', level: 4, parentId: 'L3-01-01-01', name: '越深' })]
    expect(rules(arch)).toContain('DEPTH_EXCEEDED:L4-01-01-01-01')
  })

  it('跨级与父悬空：L3 直挂 L1 触发 LEVEL_SKIP；父不存在触发 DANGLING_REF(high)', () => {
    const arch = readArchitecture()
    arch.nodes = [
      n({ id: 'L1-01', level: 1, parentId: null, section: 'OPERATING', owner: '甲' }),
      n({ id: 'L3-01-01-01', level: 3, parentId: 'L1-01', owner: '乙' }),
      n({ id: 'L3-02-01-01', level: 3, parentId: 'L2-不存在', owner: '丙' }),
    ]
    const got = rules(arch)
    expect(got).toContain('LEVEL_SKIP:L3-01-01-01')
    expect(got).toContain('DANGLING_REF:L3-02-01-01')
  })

  it('编号非法 + 分区非法：BAD_ID 与 SECTION_INVALID（L1 缺分区/非 L1 带分区）', () => {
    const arch = readArchitecture()
    arch.nodes = [
      n({ id: 'LX-01', level: 1, parentId: null, owner: '甲' }), // 编号非法 + 缺分区
      n({ id: 'L2-01-01', level: 2, parentId: 'LX-01', owner: '乙', section: 'OPERATING' }), // 非 L1 带分区
    ]
    const got = rules(arch)
    expect(got).toContain('BAD_ID:LX-01')
    expect(got).toContain('SECTION_INVALID:LX-01')
    expect(got).toContain('SECTION_INVALID:L2-01-01')
  })

  it('引用悬空：drivers 指向不存在流程触发 DANGLING_REF(medium)', () => {
    const arch = readArchitecture()
    arch.nodes = [
      n({ id: 'L1-01', level: 1, parentId: null, section: 'OPERATING', owner: '甲' }),
      n({ id: 'L2-01-01', level: 2, parentId: 'L1-01', owner: '乙' }),
      n({ id: 'L3-01-01-01', level: 3, parentId: 'L2-01-01', owner: '丙', kpis: [{ name: 'k', target: 't' }], outputs: ['y'], drivers: ['L3-88-88-88'] }),
    ]
    const v = validateArchitecture(arch).violations.find((x) => x.rule === 'DANGLING_REF')
    expect(v?.nodeId).toBe('L3-01-01-01')
    expect(v?.severity).toBe('medium')
  })

  it('体检报告量化面：owner/kpi 覆盖率分母正确（只算 L1-L3）', () => {
    const arch = seedArchitecture()
    // 摘掉一个 L3 的 KPI：覆盖率 7/8
    arch.nodes.find((x) => x.id === 'L3-02-01-01')!.kpis = []
    const report = validateArchitecture(arch)
    expect(report.kpiCoverage).toBe(88) // Math.round(7/8*100)=88
    expect(report.bySeverity.high).toBe(1)
  })

  it('写读回环：writeArchitecture → readArchitecture 一致', () => {
    const seeded = seedArchitecture()
    writeArchitecture(seeded.nodes, seeded.config)
    const back = readArchitecture()
    expect(back.nodes).toHaveLength(seeded.nodes.length)
    expect(back.config.framework).toBe('OES+PCF6')
    expect(validateArchitecture(back).violations).toEqual([])
  })
})
