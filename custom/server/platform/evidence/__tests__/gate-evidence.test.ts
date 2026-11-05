// gate-evidence 守门（P0 Task 6）：六闸证据适配器——把完成键、打回、补证三路输入
// 归一为平台 EvidenceRecord。判定序钉死（设计书证据规则：打回证据优先于完成键）：
// 明确 FAIL → fail；完成键缺失/空 → unknown（未观测不猜首过）；其余 → pass
// （supplement 标记区分补过形态）。run-metrics 只消费这里的 status，不自算四态。
import { describe, expect, it } from 'vitest'
import { gateEvidenceFromState } from '../gate-evidence'

describe('gateEvidenceFromState（判定序：FAIL → 缺键 unknown → pass/补过）', () => {
  it('明确 FAIL 优先于完成键：键缺席仍判 fail', () => {
    const e = gateEvidenceFromState({ gate: 'G5', completionValue: undefined, failed: true, supplement: false })
    expect(e).toMatchObject({ subject: 'G5', status: 'fail', supplement: false })
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

  it('来源摘要如实：pass 带完成键值、缺键 source=null（不编造引用）', () => {
    expect(gateEvidenceFromState({ gate: 'G4', completionValue: '1790000003', failed: false, supplement: false }).source)
      .toBe('1790000003')
    expect(gateEvidenceFromState({ gate: 'G4', completionValue: undefined, failed: false, supplement: false }).source)
      .toBeNull()
    expect(gateEvidenceFromState({ gate: 'G4', completionValue: undefined, failed: true, supplement: false }).source)
      .toContain('FAIL')
  })
})
