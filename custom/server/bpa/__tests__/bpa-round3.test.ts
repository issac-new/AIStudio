// bpa 第三轮测试：体检留痕（audit）+ 评审周期判定 + 报告导出六账完整性。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readAudit, recordAudit, reviewDue } from '../bpa-audit'
import { exportArchitectureMarkdown } from '../bpa-export'
import { validateArchitecture } from '../bpa-validate'
import { seedArchitecture } from '../bpa-seed'
import { readArchitecture, writeArchitecture } from '../bpa-store'
import type { BpaValidationReport, PemmAssessment } from '../bpa-types'

let dir: string
const reportOf = (over: Partial<BpaValidationReport> = {}): BpaValidationReport => ({
  checkedAt: Date.now(), nodes: 22, l3Count: 8, violations: [],
  bySeverity: { high: 0, medium: 0 }, ownerCoverage: 100, kpiCoverage: 100, ...over,
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bpa-r3-'))
  process.env.BPA_STORE = join(dir, 'arch.json')
  process.env.BPA_AUDIT_STORE = join(dir, 'audit.json')
  process.env.BPA_MATURITY_STORE = join(dir, 'mat.json')
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.BPA_STORE
  delete process.env.BPA_AUDIT_STORE
  delete process.env.BPA_MATURITY_STORE
})

describe('bpa-audit', () => {
  it('fail-soft 读 + 落账回读 + 截尾 50', () => {
    expect(readAudit()).toEqual([])
    for (let i = 0; i < 55; i++) recordAudit(reportOf({ checkedAt: i, high: i % 3 }), 'validate')
    const h = readAudit()
    expect(h).toHaveLength(50)
    expect(h[0]?.at).toBe(5)
    expect(h[49]?.source).toBe('validate')
  })

  it('评审周期：无记录→null；有记录→daysSince/daysUntilDue 联动 reviewCycleDays', () => {
    const none = reviewDue(180)
    expect(none.daysSince).toBeNull()
    expect(none.daysUntilDue).toBeNull()
    const at = Date.now() - 10 * 86_400_000
    recordAudit(reportOf({ checkedAt: at }), 'write')
    const due = reviewDue(180, at + 30 * 86_400_000)
    expect(due.daysSince).toBe(30)
    expect(due.daysUntilDue).toBe(150)
    const overdue = reviewDue(30, at + 45 * 86_400_000)
    expect(overdue.daysUntilDue).toBeLessThan(0) // 逾期为负
  })
})

describe('bpa-export', () => {
  it('六账齐备：清单/地图/体检/链路/对标/PEMM（含种子数据锚点）', () => {
    const seeded = seedArchitecture()
    writeArchitecture(seeded.nodes, seeded.config)
    const arch = readArchitecture()
    const mat: PemmAssessment = { id: 'x', scoredAt: 1, scores: { design: 2, leadership: 1 } }
    const md = exportArchitectureMarkdown(arch, validateArchitecture(arch), mat)
    for (const anchor of [
      '# 流程架构报告',
      '## 一、流程分级清单',
      'L3-01-01-01', '需求澄清与验收标准', '需求分析师A',
      '## 二、L1 流程地图',
      'O 运营', 'E 使能', 'S 支撑',
      '## 三、治理体检',
      '零违规',
      '## 四、端到端链路',
      '交接物',
      '## 五、APQC PCF 对标',
      '覆盖 6/12',
      '1.0 制定愿景与战略',
      '## 六、PEMM 成熟度',
      'P1', '短板决定',
    ]) {
      expect(md, `缺锚点：${anchor}`).toContain(anchor)
    }
    // 表格行含 KPI 与 IO 列
    expect(md).toContain('验收标准一次通过率')
    expect(md).toContain('PCF 4.0')
  })

  it('空态与缺评估态不炸（引导语兜底）', () => {
    const arch = readArchitecture() // 空架构
    const report = validateArchitecture(arch)
    const md = exportArchitectureMarkdown(arch, report, null)
    expect(md).toContain('节点 0 个')
    expect(md).toContain('暂无端到端路径')
    expect(md).toContain('尚未评估')
  })
})
