// custom/server/platform/evidence/gate-evidence.ts
// 六闸证据适配器（P0 Task 6）：把完成键、打回判词、补证标记三路输入归一为平台
// EvidenceRecord（contracts/evidence）。判定序是本文件唯一的职责（设计书证据规则：
// 打回证据优先于完成键）：
//   ① 明确 FAIL（闸段判词含打回语义）→ fail——即使完成键也缺席，判词是更强的观测；
//   ② 完成键缺失/空 → unknown——未观测不猜首过（旧口径「无记录即首过」退役，
//     空状态曾把六闸算成 6/6 首过）；
//   ③ 其余 → pass，supplement 标记区分补过形态（补证不掩盖缺键：②优先于③）。
// 消费方（治理 run-metrics）只消费本记录的 status/supplement，不得自算四态。
import type { EvidenceRecord } from '../../../platform/contracts/evidence'

/** 六闸证据输入：完成键值（state.env 中 GATE_STATE_KEYS 落键原值）、闸段打回判定、补证标记。 */
export interface GateEvidenceInput {
  gate: string
  /** state.env 完成键值；缺席=undefined、空串=''，二者均为未观测。 */
  completionValue: string | undefined
  /** 闸段判词是否含明确打回语义（FAIL/打回/拒收/熔断/退回——判词面由调用方判定）。 */
  failed: boolean
  /** state.env g{n}_supplement 补证标记（只在 pass 分支生效）。 */
  supplement: boolean
}

/** 六闸证据记录：统一 EvidenceRecord + 补证标记（status=pass 且 supplement=true=补过形态）。 */
export interface GateEvidence extends EvidenceRecord {
  supplement: boolean
}

export function gateEvidenceFromState(input: GateEvidenceInput): GateEvidence {
  if (input.failed) {
    return { subject: input.gate, status: 'fail', source: '闸段判词含 FAIL/打回语义', supplement: false }
  }
  if (input.completionValue == null || input.completionValue === '') {
    return { subject: input.gate, status: 'unknown', source: null, supplement: false }
  }
  return { subject: input.gate, status: 'pass', source: input.completionValue, supplement: input.supplement }
}
