// gate-evidence 守门（P0 Task 6 → P1 Task 2 九字段化）：六闸证据适配器——把完成键、
// 打回、补证三路输入归一为平台 EvidenceRecord。判定序钉死（设计书证据规则：打回证据
// 优先于完成键）：明确 FAIL → fail；完成键缺失/空 → unknown（未观测不猜首过）；
// 其余 → pass（supplement 标记区分补过形态）。run-metrics 只消费这里的 status，不自算四态。
// P1 Task 2：产出补齐九字段（producer/commit/时戳/evidenceId/artifactRefs），
// 适配器产出必须直接可入 evidence-store（validateEvidenceRecord 不抛）。
import { describe, expect, it } from 'vitest'
import { gateEvidenceFromState } from '../gate-evidence'
import { validateEvidenceRecord } from '../evidence-store'

describe('gateEvidenceFromState（判定序：FAIL → 缺键 unknown → pass/补过）', () => {
  it('明确 FAIL 优先于完成键：键缺席仍判 fail', () => {
    const e = gateEvidenceFromState({ gate: 'G5', completionValue: undefined, failed: true, supplement: false })
    expect(e).toMatchObject({ subjectId: 'G5', status: 'fail', supplement: false })
  })

  it('完成键缺失或空串 → unknown（不猜首过；补证标记不得掩盖缺键）', () => {
    const missing = gateEvidenceFromState({ gate: 'G2', completionValue: undefined, failed: false, supplement: false })
    expect(missing.status).toBe('unknown')
    const blank = gateEvidenceFromState({ gate: 'G2', completionValue: '', failed: false, supplement: false })
    expect(blank.status).toBe('unknown')
    // 补证标记在、完成键缺：仍 unknown，supplement 不进状态面
    const supplementButMissing = gateEvidenceFromState({ gate: 'G1', completionValue: undefined, failed: false, supplement: true })
    expect(supplementButMissing).toMatchObject({ status: 'unknown', supplement: false })
  })

  it('键在无补证 → pass/首过形态；键在带补证 → pass/补过形态', () => {
    const plain = gateEvidenceFromState({ gate: 'G3', completionValue: '1790000002', failed: false, supplement: false })
    expect(plain).toMatchObject({ status: 'pass', supplement: false })
    const supp = gateEvidenceFromState({ gate: 'G1', completionValue: '1790000000', failed: false, supplement: true })
    expect(supp).toMatchObject({ status: 'pass', supplement: true })
  })

  it('来源摘要如实：pass 带完成键值、缺键 sourceDigest=null（不编造引用）', () => {
    expect(gateEvidenceFromState({ gate: 'G4', completionValue: '1790000003', failed: false, supplement: false }).sourceDigest)
      .toBe('1790000003')
    expect(gateEvidenceFromState({ gate: 'G4', completionValue: undefined, failed: false, supplement: false }).sourceDigest)
      .toBeNull()
    expect(gateEvidenceFromState({ gate: 'G4', completionValue: undefined, failed: true, supplement: false }).sourceDigest)
      .toContain('FAIL')
  })
})

describe('九字段契约填充（P1 Task 2：producer/commit/时戳/evidenceId/artifactRefs）', () => {
  it('producer=gate-evidence、commit 真值、now 注入位定住时戳与 evidenceId、artifactRefs 空', () => {
    const e = gateEvidenceFromState({
      gate: 'G3', completionValue: '1790000002', failed: false, supplement: false,
      commit: 'a1b2c3d', now: 1790000000000,
    })
    expect(e).toMatchObject({
      evidenceId: 'gate-evidence/G3/1790000000000',
      subjectId: 'G3',
      producer: 'gate-evidence',
      commit: 'a1b2c3d',
      startedAt: 1790000000000,
      endedAt: 1790000000000,
      artifactRefs: [],
      declaredMissing: false,
    })
    // 适配器产出必须直接可入存储（Produces↔Consumes 对账）
    expect(() => validateEvidenceRecord(e)).not.toThrow()
  })

  it('commit 未传 → null + declaredMissing=true（P1 Task 9 接线前过渡口径，产出仍可入存储）', () => {
    const e = gateEvidenceFromState({ gate: 'G1', completionValue: '1790000000', failed: false, supplement: false, now: 1790000000001 })
    expect(e.commit).toBeNull()
    expect(e.declaredMissing).toBe(true)
    expect(() => validateEvidenceRecord(e)).not.toThrow()
  })

  it('三分支（fail/unknown/pass）产出全部通过九字段校验', () => {
    const branches = [
      gateEvidenceFromState({ gate: 'G5', completionValue: undefined, failed: true, supplement: false, now: 1 }),
      gateEvidenceFromState({ gate: 'G2', completionValue: '', failed: false, supplement: false, now: 2 }),
      gateEvidenceFromState({ gate: 'G3', completionValue: '1790000002', failed: false, supplement: true, now: 3 }),
    ]
    for (const e of branches) expect(() => validateEvidenceRecord(e)).not.toThrow()
  })
})
