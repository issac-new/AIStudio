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

/** 候选生命周期（批一 b 变更 3）：candidate→（批准）probation→（结算）approved/
 *  retired；probation 可注入（试用期=带观察的生产，简报行带标记）、retired 不注入；
 *  存量 approved 兼容不迁移仍可注入。rejected 仍为人工否决终态。 */
export type CandidateStatus = 'candidate' | 'approved' | 'rejected' | 'probation' | 'retired'

/** 试用期窗口缺省（spec：20 任务窗口/最小 5 决断样本；结算是「到期且样本够才判」）。 */
export const PROBATION_WINDOW_TASKS = 20
export const PROBATION_MIN_SAMPLES = 5

/** 试用期结算判定：promoted=转正；probation_regression=劣化退役；probation_extended=
 *  首次样本不足延长窗口（未结算）；effect_unknown=二次仍不足挂人工（结算终态，不再自动判）。 */
export type ProbationVerdict = 'promoted' | 'probation_regression' | 'probation_extended' | 'effect_unknown'

/** 结算落档统计（历史保留：settled 后 probation.stats 即判档快照）。 */
export interface ProbationStats {
  injections: number
  success: number
  failure: number
  unknown: number
  baselineTasks?: number
  baselineSuccess?: number
  /** 双比例 z 值（不可判时 null——不猜数）。 */
  z?: number | null
}

/** 试用期状态（ExpCandidate.probation）。 */
export interface ProbationState {
  startedAt: string
  windowTasks: number
  minSamples: number
  /** 首次样本不足延长后的窗口起点（延长仅一次——「首延 probation_extended 次记 effect_unknown」）。 */
  extendedAt?: string
  /** 结算时刻（probation_extended 不结算不落此键；effect_unknown 也落——人工接管、自动面终态）。 */
  settledAt?: string
  verdict?: ProbationVerdict
  stats?: ProbationStats
}

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
  /** 批二 T6 结果学习链（可选）：来源结果合同与结算锚——候选由结算触发生成，
   *  幂等键=sourceSettlementId（同结算不重复生成）；对照链引用（comparison 消费）。 */
  outcomeId?: string
  sourceSettlementId?: string
  baselineOutcomeRef?: string
  evaluationOutcomeRefs?: string[]
  /** 试用期状态（批一 b 变更 3）：status=probation/retired（试用期退役）时在场。 */
  probation?: ProbationState
  /** workbench 提案回指（批一 b 变更 3）：退役联动 rollbackProposal 的显式门键
   *  （HARNESS2_AUTO_ROLLBACK=1 才调——数据面自动、文件面显式）；无此键不联动。 */
  sourceProposalId?: string
}

export interface ExpStoreShape {
  candidates: ExpCandidate[]
  nextSeq: number
  /** 批二 T5 召回留痕（追加制，上限 EXP_INJECTION_LOG_CAP）：每次派单快照注入
   *  approved 经验记一行——runLabel＋snapshotId＋ids 三元组可反查快照指纹
   *  （approvedExperienceVersions 含被注入候选）。「已注入」≠「有效」，效果
   *  断言走 outcome 对照投影（comparison.ts），本账只留事实。 */
  injectionLog?: ExpInjectionRecord[]
}

/** 注入来源通道（批一 b 变更 4）：exp=经验候选路（旧数据缺省同义）；dual=双轨经验；fewshot=飞轮教训。 */
export type ExpInjectionKind = 'exp' | 'dual' | 'fewshot'

/** 召回留痕行（批二 T5）。批一 b 变更 1/4 补键：taskId（效果归因 join 键）、kind
 *  （来源通道）、column/specialist（注入现场作用域，基线同口径对照用）。旧数据
 *  缺这些键照旧可读——taskId 到场才可归因，kind 缺席按 'exp' 归一（读取侧）。 */
export interface ExpInjectionRecord {
  runLabel: string
  /** 快照指纹（快照路回执恒有）；派单简报路回执无快照——taskId 到场即留痕。 */
  snapshotId?: string
  ids: string[]
  at: number
  /** 派单链路任务 id（板内 id）：join 任务终态做效果归因（effect-report）。 */
  taskId?: string
  kind?: ExpInjectionKind
  column?: string
  specialist?: string
}
