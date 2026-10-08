// overlay/custom/server/evidence/__tests__/evidence-gaps.test.ts
// 缺陷二分法分诊（六文调研轮 D）：gapClass 写入收敛 + /gaps 统计 + 链上可校验。
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendEvidence, listEvidence, verifyEvidenceChain, resetEvidenceDirForTests } from '../evidence-store'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ev-gaps-'))
  process.env.HERMES_EVIDENCE_DIR = dir
})

afterAll(() => {
  resetEvidenceDirForTests()
  rmSync(dir, { recursive: true, force: true })
})

describe('gap classification', () => {
  it('gapClass 落账、hash 链覆盖该字段（改 gapClass 会被链校验发现）', () => {
    appendEvidence({ evidenceId: 'g1', taskId: 't-gap', kind: 'artifact', at: 1, ref: './a.png', gapClass: 'product_gap' })
    appendEvidence({ evidenceId: 'g2', taskId: 't-gap', kind: 'artifact', at: 2, ref: './b.png', gapClass: 'implementation_gap' })
    const records = listEvidence('t-gap', undefined, 10)
    expect(records.find((r) => r.evidenceId === 'g1')?.gapClass).toBe('product_gap')
    expect(records.find((r) => r.evidenceId === 'g2')?.gapClass).toBe('implementation_gap')
    const v = verifyEvidenceChain('t-gap')
    expect(v.intact).toBe(true)
    expect(v.chained).toBe(2)
  })

  it('未标记的记录不参与二分法计数（untagged 如实呈现）', () => {
    appendEvidence({ evidenceId: 'g3', taskId: 't-gap2', kind: 'artifact', at: 3, ref: './c.png' })
    const records = listEvidence('t-gap2', undefined, 10)
    expect(records.every((r) => r.gapClass === undefined)).toBe(true)
  })
})
