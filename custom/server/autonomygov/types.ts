/**
 * 自治刻度与责任边界（A 组，2026-11-05 组织治理能力批）。
 *
 * 来源：泊珩简澈《组织重写：AI 时代组织设计的第一性问题》中篇原理二（责任边界决定
 * 自动化上限，而非模型能力）与下篇 Step5 界碑（自主圈/协作圈/人类圈、零 AL5 红线）；
 * 《从规划未来到生成未来》Step4 的 60 分线与「八种假 AI 化」的停掉判据。
 *
 * 定位：配置面 + 判定面。执行面拦截挂在 qgate 门（.qgate/gates/governance.orgscale.yaml），
 * 本域不越界假装能拦。AL 刻度（任务级「AI 干了多少活」）与既有 autonomyladder 的
 * 三档（流程级自治）语义正交，只做只读映射，不合并配置。
 */

/** 任务级自主等级：AL0 全人工 → AL5 完全自主（须配抽样审计与人工扫描方成立）。 */
export type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5

/** 治理三圈：人类圈 / 协作圈 / 自主圈。由 al 派生，不入库。 */
export type Tier = 'human' | 'collab' | 'auto'

/** 流程级自治阶梯（既有 autonomyladder 口径），仅用于映射提示。 */
export type LadderLevel = 'insight' | 'assist' | 'auto'

/** 60 分线：什么叫「这个产出可以直接用」。三字段任一为空即判未解码完成。 */
export interface Dod {
  /** 验收判据（逐条，可判定） */
  criteria: string[]
  /** 一个真实历史样例（防止判据是凭空写的） */
  sample: string
  /** 什么条件下这个任务应当被停掉（辨伪底线：拿不出判据即假 AI 化） */
  stopCondition: string
}

export interface AutonomyScaleEntry {
  /** 配置对象：profile 名 或 workflow:<workflow>:<node> */
  target: string
  al: AutonomyLevel
  dod: Dod
  /** 抽样审计比例 0..1（AL4 须 > 0；AL5 亦须 > 0） */
  auditSampling: number
  /** 是否存在人工策略扫描（AL5 须为 true） */
  humanScan: boolean
  reviewedAt: number
  updatedBy?: string
  note?: string
}

export type Verdict = 'ok' | 'warn' | 'blocked'

export type RuleId = 'al5-condition' | 'al4-sampling' | 'dod-complete'

export interface RuleFinding {
  rule: RuleId
  verdict: Verdict
  /** 一句话说清缺什么（人读，不写代号） */
  detail: string
}

export interface Assessment {
  target: string
  al: AutonomyLevel
  tier: Tier
  /** 三条规矩里最严的一条 */
  verdict: Verdict
  findings: RuleFinding[]
  /** 停止条件缺失即真：这是文章的辨伪底线 */
  fakeAi: boolean
  /** 流程级阶梯映射提示（无对应配置时为 undefined） */
  ladderHint?: LadderLevel
}

export interface TierCounts {
  human: number
  collab: number
  auto: number
}

export interface TierShare {
  human: number
  collab: number
  auto: number
}

export interface DistributionSelfCheck {
  id: 'all-human' | 'no-autonomy' | 'no-data'
  verdict: Verdict
  detail: string
}

export interface DistributionReport {
  total: number
  counts: TierCounts
  shares: TierShare
  /** 每条配置的判定汇总（含 blocked/warn 计数） */
  verdicts: { ok: number; warn: number; blocked: number }
  /** 文章经验值 80/15/5 仅作偏离展示，不作合规线 */
  reference: { auto: number; collab: number; human: number }
  checks: DistributionSelfCheck[]
}
