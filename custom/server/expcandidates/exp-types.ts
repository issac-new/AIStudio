// overlay[expcandidates] 经验候选类型（2026-10-14 阿里调研轮 B1）。
//
// 语义：自动挡第一半环——从运行轨迹（看板 task_events）提取经验「候选」三形态：
//   antipattern  反模式：同类拦截反复出现（gate:reason 计数过阈值）
//   good_path    较优路径：零拦截且显著快于中位的卡
//   sop          同类流程：相同列路径签名被多卡采用且含零拦截样本
// 只出候选不改行为；审核（promote/reject）与受控注入是 B2 半环。
// 出处纪律：evidence 只记 taskId+说明+秒级时刻——不携带可被当作「本轮实测凭据」
// 的哈希/event_id 形态（跨轮注入时按「历史经验出处」形态重写，B2 执法）。
export type CandidateType = 'sop' | 'good_path' | 'antipattern'

export type CandidateStatus = 'candidate' | 'approved' | 'rejected'

/** 经验作用域（EvoTeam 吸收，2026-11-08）：复用约束卡口径——派单现场可判定的列/specialist。
 * 字段为空=该维不限；两维都空=全局。缺省（字段缺席）按全局处理，兼容存量。 */
export interface ExpScope {
  columns?: string[]
  specialists?: string[]
}

/** 产出侧 provenance：模型/执行者未知即 null（跨模型复测判定用，不猜）。 */
export interface ExpProvenance {
  model?: string | null
  executor?: string | null
  at?: string
}

export interface EvidenceItem {
  /** 源任务（板内 id，注入时重写为「历史经验出处」形态） */
  taskId: string
  note: string
  /** 秒级时刻 */
  at: number
}

export interface ExpCandidate {
  id: string
  type: CandidateType
  /** 候选陈述（面向人的经验句） */
  statement: string
  /** 去重指纹：type + 归一化键 */
  fingerprint: string
  evidence: EvidenceItem[]
  status: CandidateStatus
  createdAt: string
  updatedAt: string
  /** B2 注入留痕：approved 候选被注入过的轮次（追加制） */
  injectedRuns: string[]
  /** 作用域（可选）：限定只在指定列/specialist 的派单里注入。 */
  scope?: ExpScope
  /** 产出侧 provenance（可选）：模型/执行者/时刻；未知字段为 null。 */
  provenance?: ExpProvenance
}

export interface ExpStoreShape {
  candidates: ExpCandidate[]
  nextSeq: number
}
