// custom/platform/contracts/evidence.ts
// 平台证据契约（P0 Task 6）：证据状态统一四值——pass/fail/unknown/waived。
// 设计书全局约束：任何缺失、损坏、过期或来源不明的输入均为 unknown，不补猜。
// 本文件只定义形状（与 identity.ts/execution.ts 同层的单一事实源），不含实现；
// 六闸适配器（server/platform/evidence/gate-evidence）与消费方（治理 run-metrics）
// 各居其位，状态判定只在一处做。

/** 证据状态：pass 通过 / fail 失败 / unknown 未观测（缺证不猜）/ waived 显式豁免。 */
export type EvidenceStatus = 'pass' | 'fail' | 'unknown' | 'waived'

/** 证据记录最小契约：主体 + 状态 + 来源摘要。
 *  source 如实带观测锚（完成键值/判词行等）；未观测时为 null，禁编造引用。 */
export interface EvidenceRecord {
  /** 证据主体标识（能力/闸/检查项）。 */
  subject: string
  status: EvidenceStatus
  /** 状态判定的来源摘要；未观测=null。 */
  source: string | null
}
