// overlay[expdual] 双轨经验台账类型（TTSE 吸收，2026-11-12）。
//
// 语义：经验分两轨——FACT（环境事实：环境是什么样，无动作、无条件）与
// TIP（条件式技巧：「在什么条件下：做什么」）。两轨独立编号、独立证据计数、
// 独立生命周期；方法论来源 openJiuwen TTSE（arXiv 2609.24289，量子位 2026-11-12 刊载）。
// 计数与阈值照论文表 10 原值：ADD +2 / AGREE +1 / EDIT +1 /
// REMOVE −1（冗余）或 −3（矛盾），count ≤ 0 自动删除；blame 阈值 τ=1（首次归因即退役）。
// 纪律：本层不猜语义——分类只做结构初判（拿不准默认 TIP），矛盾只出候选对，
// 归纳操作由调用方（agent/人）起草、引擎确定性校验（DESIGN 4.8「AI 只起草」）。

export type RuleChannel = 'fact' | 'tip'

export type RuleStatus = 'active' | 'retired'

/** 退役原因：blame=归因命中；contradiction=矛盾合成后旧规则退场；manual=人工；budget=容量。 */
export type RetireReason = 'blame' | 'contradiction' | 'manual' | 'budget'

/** 证据类型：chunk=批次轨迹；task=单任务；manual=人工；synthesis=矛盾合成产物。 */
export type EvidenceKind = 'chunk' | 'task' | 'manual' | 'synthesis'

/** 论文表 10 的证据计数增量（单一事实源，改值即改语义）。 */
export const COUNT_DELTA = {
  ADD: 2,
  AGREE: 1,
  EDIT: 1,
  REMOVE_REDUNDANT: -1,
  REMOVE_CONTRADICTORY: -3,
} as const

/** 归因退役阈值 τ：论文默认 1（首次归因即退役）。 */
export const BLAME_THRESHOLD = 1

/** 每批归纳操作上限与每规则操作上限（论文：每阶段 ≤4 操作、每规则 ≤1 操作）。 */
export const MAX_INDUCE_OPS = 4
export const MAX_OPS_PER_RULE = 1

/** 分通道注入条数：默认 3，上限 8（防止派单简报膨胀）。 */
export const DEFAULT_TOP_K = 3
export const MAX_TOP_K = 8

/** 经验作用域：与 expcandidates 同语义（列/specialist 两维，空=不限）。 */
export interface DualScope {
  columns?: string[]
  specialists?: string[]
}

export interface RuleEvidence {
  kind: EvidenceKind
  ref: string
  note?: string
  at: number
}

export interface DualRule {
  /** 通道内稳定 id：f-<seq> / t-<seq>（退役后空号不复用，防引用漂移）。 */
  id: string
  channel: RuleChannel
  /** 通道内序号（渲染编号按当前选择位置重排，seq 只作身份）。 */
  seq: number
  /** FACT=陈述句；TIP=由 condition/action 规范化的条件-动作句。 */
  text: string
  /** 仅 TIP：条件。FACT 禁止携带。 */
  condition?: string
  /** 仅 TIP：动作。FACT 禁止携带。 */
  action?: string
  /** 证据计数（论文计数体系）。 */
  count: number
  blameCount: number
  evidence: RuleEvidence[]
  scope?: DualScope
  status: RuleStatus
  createdAt: number
  updatedAt: number
}

export interface RetiredRule {
  id: string
  channel: RuleChannel
  seq: number
  text: string
  condition?: string
  action?: string
  /** 退役时的证据计数（保留现场，便于复盘为什么退）。 */
  count: number
  reason: RetireReason
  /** 触发退役的批次（chunk 序号）。 */
  chunk: number
  blameCount: number
  retiredAt: number
  note?: string
  /** 矛盾合成落库后回指新 TIP id（可追溯）。 */
  synthesizedInto?: string
}

/** count ≤ 0 被删除的规则（与「退役」区分：删除是证据耗尽，退役是归因/矛盾）。 */
export interface RemovedRule {
  id: string
  channel: RuleChannel
  text: string
  count: number
  reason: 'redundant' | 'contradictory'
  chunk: number
  removedAt: number
}

export interface BlameRecord {
  /** bl-<chunk>-<n> */
  id: string
  chunk: number
  /** 失败轨迹引用（看板任务 id / 轨迹文件名）。 */
  taskRef: string
  /** 必须指出出错步骤——归因不定位到步骤即不可追溯。 */
  step: string
  ruleId: string
  note: string
  at: number
}

/** 矛盾候选对：只出结构证据，不宣称「真矛盾」（语义判断留给合成提交者）。 */
export interface SynthesisCandidate {
  /** sc-<n> */
  id: string
  retiredIds: [string, string]
  /** 结构证据说明（同条件不同动作 / 同动作相反极性）。 */
  reason: string
  status: 'open' | 'committed' | 'dismissed'
  createdAt: number
  tipId?: string
  note?: string
}

export interface ChunkSnapshot {
  /** 刚关闭的批次号。 */
  chunk: number
  at: number
  facts: number
  tips: number
  retired: number
  removed: number
  /** 双库（id+count+text）摘要，用于批次间对账。 */
  digest: string
}

export interface DualStoreShape {
  version: 1
  /** 当前批次（下一次演进所属的 chunk）。 */
  chunk: number
  nextSeq: Record<RuleChannel, number>
  rules: DualRule[]
  retired: RetiredRule[]
  removed: RemovedRule[]
  blames: BlameRecord[]
  synthesis: SynthesisCandidate[]
  snapshots: ChunkSnapshot[]
}

export type InduceOp =
  | {
      op: 'ADD'
      channel: RuleChannel
      text: string
      condition?: string
      action?: string
      scope?: DualScope
    }
  | { op: 'AGREE'; ruleId: string; evidence?: RuleEvidence[] }
  | {
      op: 'EDIT'
      ruleId: string
      text: string
      condition?: string
      action?: string
      reason?: string
    }
  | { op: 'REMOVE'; ruleId: string; reason: 'redundant' | 'contradictory' }

export interface BlameInput {
  chunk: number
  taskRef: string
  step: string
  ruleId: string
  note: string
}

export interface RetireInput {
  reason: RetireReason
  chunk: number
  note?: string
}

export interface SynthesisInput {
  candidateId: string
  condition: string
  action: string
  chunk: number
  note?: string
}

export function emptyStore(): DualStoreShape {
  return {
    version: 1,
    chunk: 1,
    nextSeq: { fact: 1, tip: 1 },
    rules: [],
    retired: [],
    removed: [],
    blames: [],
    synthesis: [],
    snapshots: [],
  }
}

export function ruleId(channel: RuleChannel, seq: number): string {
  return `${channel === 'fact' ? 'f' : 't'}-${seq}`
}
