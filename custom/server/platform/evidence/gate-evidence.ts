// custom/server/platform/evidence/gate-evidence.ts
// 六闸证据适配器（P0 Task 6 → P1 Task 2 九字段化）：把完成键、打回判词、补证标记
// 三路输入归一为平台 EvidenceRecord（contracts/evidence 九字段）。判定序是本文件
// 唯一的职责（设计书证据规则：打回证据优先于完成键）：
//   ① 明确 FAIL（闸段判词含打回语义）→ fail——即使完成键也缺席，判词是更强的观测；
//   ② 完成键缺失/空 → unknown——未观测不猜首过（旧口径「无记录即首过」退役，
//     空状态曾把六闸算成 6/6 首过）；
//   ③ 其余 → pass，supplement 标记区分补过形态（补证不掩盖缺键：②优先于③）。
// P1 Task 2 产出面：producer='gate-evidence'、commit 由调用方传入（未接线=null +
// declaredMissing 显式标记，P1 Task 9 release:gate 接线时传真值）、瞬时观测
// startedAt===endedAt（now 可注入，测试确定性）、artifactRefs 空（六闸无工件面）。
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
  /** 证据绑定的 git commit（HEAD）；调用点未接线时显式传 null（→declaredMissing）。 */
  commit?: string | null
  /** 观测时戳 epoch ms（测试注入位；缺省 Date.now()，瞬时观测起止同值）。 */
  now?: number
}

/** 六闸证据记录：九字段 EvidenceRecord + 补证标记 + commit 缺席显式声明。
 *  supplement=true 且 status=pass=补过形态；declaredMissing=true=commit 未绑定
 *  （P1 Task 9 接线前的过渡口径，接线后传真值即 false）。 */
export interface GateEvidence extends EvidenceRecord {
  supplement: boolean
  declaredMissing: boolean
}

export function gateEvidenceFromState(input: GateEvidenceInput): GateEvidence {
  const now = input.now ?? Date.now()
  const commit = input.commit ?? null
  // 九字段公共面：evidenceId 由 producer 侧按主体+时戳确定性生成
  const base = {
    evidenceId: `gate-evidence/${input.gate}/${now}`,
    subjectId: input.gate,
    producer: 'gate-evidence',
    commit,
    startedAt: now,
    endedAt: now,
    artifactRefs: [] as string[],
    declaredMissing: commit === null,
  }
  if (input.failed) {
    return { ...base, status: 'fail', sourceDigest: '闸段判词含 FAIL/打回语义', supplement: false }
  }
  if (input.completionValue == null || input.completionValue === '') {
    return { ...base, status: 'unknown', sourceDigest: null, supplement: false }
  }
  return { ...base, status: 'pass', sourceDigest: input.completionValue, supplement: input.supplement }
}
