// 守门：能力验收矩阵评估器（2026-11-12 设计复盘 P0-5）。
// 核心语义锁三件：available 声明必须 static 全绿；带 runtime 证据的必须证据在档且未过期
//（过期=UNVERIFIED 不是 PASS）；experimental/retired 必须给 claimNote 依据。
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { evaluateMatrix, evaluateCheck, isStale } from '../capability-matrix.mjs'

let root: string
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'cap-matrix-'))
  mkdirSync(join(root, 'custom/x'), { recursive: true })
  writeFileSync(join(root, 'custom/x/a.vue'), 'stage shell')
  writeFileSync(join(root, 'evidence.md'), '# run 数据\n')
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

const base = (over: Record<string, unknown>) => ({
  staleDays: 30,
  capabilities: [{ id: 'c1', claim: 'x', status: 'available', checks: [], ...over }],
})

describe('evaluateCheck', () => {
  it('fileExists/fileContains 按事实判', () => {
    expect(evaluateCheck({ type: 'fileExists', path: 'custom/x/a.vue' }, root).ok).toBe(true)
    expect(evaluateCheck({ type: 'fileExists', path: 'custom/x/ghost.vue' }, root).ok).toBe(false)
    expect(evaluateCheck({ type: 'fileContains', path: 'custom/x/a.vue', pattern: 'stage' }, root).ok).toBe(true)
    expect(evaluateCheck({ type: 'fileContains', path: 'custom/x/a.vue', pattern: 'nope' }, root).ok).toBe(false)
    expect(evaluateCheck({ type: 'wat' }, root).ok).toBe(false)
  })
})

describe('isStale', () => {
  it('过期窗口按 staleDays 判；不可解析日期视为过期', () => {
    const now = new Date('2026-12-15T00:00:00Z')
    expect(isStale('2026-11-12', 30, now)).toBe(true)   // 33 天 > 30
    expect(isStale('2026-11-20', 30, now)).toBe(false)  // 25 天
    expect(isStale('不是日期', 30, now)).toBe(true)
  })
})

describe('evaluateMatrix', () => {
  it('available + static 失败 → FAIL 且 blocking', () => {
    const r = evaluateMatrix(base({ checks: [{ type: 'fileExists', path: 'ghost' }] }), { root })
    expect(r.results[0].verdict).toBe('FAIL')
    expect(r.results[0].blocking).toBe(true)
    expect(r.pass).toBe(false)
  })

  it('available + runtime 证据过期 → UNVERIFIED 且 blocking（过期不是 PASS）', () => {
    const r = evaluateMatrix(base({ runtimeEvidence: { evidencePath: 'evidence.md', collectedAt: '2026-09-01', metric: 'm', value: 'v' } }), { root, now: new Date('2026-11-12') })
    expect(r.results[0].verdict).toBe('UNVERIFIED')
    expect(r.results[0].blocking).toBe(true)
  })

  it('available + 新鲜 runtime 证据 → PASS', () => {
    const r = evaluateMatrix(base({ runtimeEvidence: { evidencePath: 'evidence.md', collectedAt: '2026-11-10', metric: 'm', value: 'v' } }), { root, now: new Date('2026-11-12') })
    expect(r.results[0].verdict).toBe('PASS')
    expect(r.pass).toBe(true)
  })

  it('experimental 不拦发布，但缺 claimNote 要拦（防无声降级）', () => {
    const withNote = evaluateMatrix(base({ status: 'experimental', claimNote: '依据' }), { root })
    expect(withNote.results[0].verdict).toBe('experimental')
    expect(withNote.results[0].blocking).toBe(false)
    const noNote = evaluateMatrix(base({ status: 'experimental' }), { root })
    expect(noNote.pass).toBe(false)
    expect(noNote.problems[0]).toContain('claimNote')
  })

  it('未知 status 报 invalid-status', () => {
    const r = evaluateMatrix(base({ status: 'GA' }), { root })
    expect(r.results[0].verdict).toBe('invalid-status')
    expect(r.pass).toBe(false)
  })
})
