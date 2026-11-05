// custom/platform/contracts/evidence.ts
// 平台证据契约（P0 Task 6 三字段 → P1 Task 2 九字段）：证据状态统一四值——
// pass/fail/unknown/waived。设计书全局约束：任何缺失、损坏、过期或来源不明的输入
// 均为 unknown，不补猜。
// 本文件只定义形状（与 identity.ts/execution.ts 同层的单一事实源），不含实现；
// 九字段校验与 JSONL 存储在 server/platform/evidence/evidence-store，
// 六闸适配器（gate-evidence）与消费方（治理 run-metrics）各居其位。

/** 证据状态：pass 通过 / fail 失败 / unknown 未观测（缺证不猜）/ waived 显式豁免。 */
export type EvidenceStatus = 'pass' | 'fail' | 'unknown' | 'waived'

/** 证据记录九字段契约（设计书 §3.4-1）：主体、状态、产出者、绑定 commit、
 *  起止时戳与来源摘要，缺一不可——「记录在档」必须能回答谁在哪个提交上观测了什么。
 *  如实缺席（非遗漏）用 null 表达：commit 未绑定=null、sourceDigest 未观测=null；
 *  校验面（validateEvidenceRecord）区分「键缺席」（非法）与「显式 null」（合法）。 */
export interface EvidenceRecord {
  /** 证据条目唯一标识（producer 侧生成；如 gate-evidence/G1/<ts>）。 */
  evidenceId: string
  /** 证据主体标识（能力/闸/检查项）。 */
  subjectId: string
  status: EvidenceStatus
  /** 产出者标识（如 'gate-evidence'）；谁产的证谁负责，禁匿名证据。 */
  producer: string
  /** 证据绑定的 git commit（HEAD）；未绑定=显式 null。 */
  commit: string | null
  /** 观测起时戳（epoch ms）。 */
  startedAt: number
  /** 观测止时戳（epoch ms）；瞬时观测 startedAt===endedAt。 */
  endedAt: number
  /** 状态判定的来源摘要（完成键值/判词行等）；未观测=null，禁编造引用。 */
  sourceDigest: string | null
  /** 佐证工件引用（相对仓/运行目录路径）；无工件=空数组。 */
  artifactRefs: string[]
}
