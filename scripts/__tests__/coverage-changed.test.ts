// 守门:改动行覆盖率脚本的解析与计算（不跑真实 coverage）。
// spec: docs/superpowers/specs/2026-11-05-governance-truth-restoration.md（批次 B4）
import { describe, expect, it } from 'vitest'
import { parseLcov, parseDiff, computeChangedCoverage, main } from '../coverage-changed.mjs'

const LCOV = [
  'TN:',
  'SF:custom/server/a.ts',
  'DA:1,1',
  'DA:2,0',
  'DA:3,5',
  'end_of_record',
  'SF:custom/client/b.vue',
  'DA:10,2',
  'end_of_record',
].join('\n')

const DIFF = [
  'diff --git a/custom/server/a.ts b/custom/server/a.ts',
  '--- a/custom/server/a.ts',
  '+++ b/custom/server/a.ts',
  '@@ -1,2 +1,3 @@',
  '+line1',
  '+line2',
  '+line3',
  'diff --git a/custom/client/b.vue b/custom/client/b.vue',
  '--- a/custom/client/b.vue',
  '+++ b/custom/client/b.vue',
  '@@ -9,0 +10,1 @@',
  '+line10',
].join('\n')

describe('parseLcov', () => {
  it('解析多文件 DA 记录', () => {
    const lcov = parseLcov(LCOV)
    expect(lcov.size).toBe(2)
    expect(lcov.get('custom/server/a.ts').lines.get(1)).toBe(1)
    expect(lcov.get('custom/server/a.ts').lines.get(2)).toBe(0)
  })
})

describe('parseDiff', () => {
  it('只取新增行范围，跳过 count=0 的删除块', () => {
    const diff = parseDiff(DIFF)
    expect([...diff.get('custom/server/a.ts')]).toEqual([1, 2, 3])
    expect([...diff.get('custom/client/b.vue')]).toEqual([10])
  })
})

describe('computeChangedCoverage', () => {
  it('按 DA 命中计算改动行覆盖率', () => {
    const report = computeChangedCoverage(parseLcov(LCOV), parseDiff(DIFF))
    expect(report.total).toBe(4)
    expect(report.covered).toBe(3)
    expect(report.coverage).toBeCloseTo(0.75)
    expect(report.rows.find((r) => r.file === 'custom/server/a.ts').uncovered).toEqual([2])
  })
  it('lcov 缺文件时标 missingCoverageData 并按 0 计', () => {
    const diff = parseDiff(['+++ b/custom/server/none.ts', '@@ -0,0 +1,2 @@', '+a', '+b'].join('\n'))
    const report = computeChangedCoverage(new Map(), diff)
    expect(report.total).toBe(2)
    expect(report.covered).toBe(0)
    expect(report.rows[0].missingCoverageData).toBe(true)
  })
})

describe('main', () => {
  it('--help 返回 0', () => {
    const out = { text: '', write(s) { this.text += s } }
    expect(main(['--help'], out, { write() {} })).toBe(0)
    expect(out.text).toContain('coverage-changed')
  })
  it('非法阈值返回 2', () => {
    const err = { text: '', write(s) { this.text += s } }
    expect(main(['--threshold', '101'], { write() {} }, err)).toBe(2)
    expect(err.text).toContain('0..100')
  })
})
