// 评审治理·夜间存量扫描守门：归并口径、报告落盘、同日幂等。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildNightlyReport, localDate, maybeRunNightly, runNightlyScan } from '../nightly'
import { createCase } from '../convergence'
import { readLatestNightly } from '../store'
import { DEFAULT_POLICY, type ReviewCase, type ReviewFinding } from '../types'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'review-nightly-'))
  process.env.HERMES_REVIEW_GOV_DIR = dir
})
afterEach(() => {
  delete process.env.HERMES_REVIEW_GOV_DIR
  rmSync(dir, { recursive: true, force: true })
})

function finding(id: string, over: Partial<ReviewFinding>): ReviewFinding {
  return {
    findingId: id,
    file: 'a.ts',
    line: 1,
    body: 'x',
    severity: 'preexisting',
    origin: 'preexisting',
    authorKind: 'agent',
    round: 3,
    dedupeKey: id,
    state: 'deferred',
    deferred: true,
    duplicateCount: 0,
    verifications: [],
    createdAt: 100,
    ...over,
  }
}

function caseWith(id: string, findings: ReviewFinding[]): ReviewCase {
  const c = createCase({ caseId: id, title: id, changedPaths: ['a.ts'] }, DEFAULT_POLICY)
  return { ...c, findings }
}

describe('夜间报告聚合', () => {
  it('按文件+bug 类归并，统计存量与涉及案例数', () => {
    const cases = [
      caseWith('c1', [
        finding('f1', { file: 'a.ts', bugClass: 'null-deref', createdAt: 100 }),
        finding('f2', { file: 'a.ts', bugClass: 'null-deref', createdAt: 50 }),
        finding('f3', { file: 'b.ts', bugClass: 'race', createdAt: 80 }),
      ]),
      caseWith('c2', [finding('f4', { file: 'a.ts', bugClass: 'null-deref', createdAt: 60 })]),
    ]
    const r = buildNightlyReport(cases, 1_000)
    expect(r.backlog).toBe(4)
    expect(r.caseCount).toBe(2)
    expect(r.groups).toHaveLength(2)
    expect(r.groups[0]).toMatchObject({ file: 'a.ts', bugClass: 'null-deref', count: 3, oldestAt: 50 })
    expect(r.groups[0].caseIds.sort()).toEqual(['c1', 'c2'])
    expect(r.date).toBe(localDate(1_000))
  })

  it('已关闭的发现不计入；无延后项时报告为空', () => {
    const cases = [caseWith('c1', [
      finding('f1', { state: 'resolved', deferred: false }),
      finding('f2', { state: 'open', deferred: false }),
    ])]
    const r = buildNightlyReport(cases, 1_000)
    expect(r.backlog).toBe(0)
    expect(r.groups).toEqual([])
    expect(r.caseCount).toBe(0)
  })
})

describe('扫描落盘与同日幂等', () => {
  it('runNightlyScan 写 latest；同一天 maybeRunNightly 返回 null；跨天再跑', () => {
    const cases = [caseWith('c1', [finding('f1', {})])]
    const first = runNightlyScan(cases, 1_000)
    expect(readLatestNightly()).toMatchObject({ reportId: first.reportId, backlog: 1 })
    expect(maybeRunNightly(cases, 2_000)).toBeNull()
    const nextDay = maybeRunNightly(cases, 1_000 + 24 * 3600_000)
    expect(nextDay?.reportId).not.toBe(first.reportId)
  })
})
