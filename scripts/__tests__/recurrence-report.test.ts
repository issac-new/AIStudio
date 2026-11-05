// 守门:复发账本的分类/聚合与规则三。
// spec: docs/superpowers/specs/2026-11-05-governance-truth-restoration.md（批次 B1）
import { describe, expect, it } from 'vitest'
import { classifyTitle, aggregateFailureClasses, buildReport, renderTable, main } from '../recurrence-report.mjs'

describe('classifyTitle', () => {
  it('fix(harness) → harness；根治标记', () => {
    const r = classifyTitle('fix(harness): run25 全流程复盘根治——采集链')
    expect(r.category).toBe('harness')
    expect(r.rootCauseClaim).toBe(true)
    expect(r.isFix).toBe(true)
  })
  it('merge: fix/run26... → harness（关键词兜底）', () => {
    expect(classifyTitle('merge: fix/run26-pending-clearance——挂账清偿').category).toBe('harness')
  })
  it('client 路径 → client', () => {
    expect(classifyTitle('fix(client): 驾驶舱布局').category).toBe('client')
  })
})

describe('aggregateFailureClasses', () => {
  it('按故障类计数，≥3 标 needsDesignReview', () => {
    const titles = [
      'fix(harness): 采集链根治',
      'fix(harness): 采集补流根治',
      'fix(harness): 采集帧根治',
      'fix(harness): 复评读旧稿根治',
    ]
    const rows = aggregateFailureClasses(titles)
    const collection = rows.find((r) => r.failureClass === 'collection')
    expect(collection.count).toBe(3)
    expect(collection.needsDesignReview).toBe(true)
  })
})

describe('buildReport/renderTable', () => {
  it('汇总 category 与 failureClasses；表格含 NEEDS-DESIGN-REVIEW', () => {
    const report = buildReport({
      titles: ['fix(harness): 采集根治', 'fix(harness): 采集根治', 'fix(harness): 采集根治'],
      gateDenies: [{ target: 'custom/server/harness/a.ts' }],
      errorHistory: [],
      since: '90.days',
    })
    expect(report.rows[0].category).toBe('harness')
    expect(report.rows[0].rootCauseClaims).toBe(3)
    expect(report.failureClasses.find((r) => r.failureClass === 'collection').count).toBe(3)
    expect(renderTable(report)).toContain('NEEDS-DESIGN-REVIEW')
  })
})

describe('main', () => {
  it('--help 返回 0', () => {
    const out = { text: '', write(s) { this.text += s } }
    expect(main(['--help'], out, { write() {} })).toBe(0)
    expect(out.text).toContain('recurrence-report')
  })
})
