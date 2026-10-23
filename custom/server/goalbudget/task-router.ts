// overlay/custom/server/goalbudget/task-router.ts
// 任务五档路由器（2026-10-23 HarnessPro 吸收轮挂账清偿 G2）。
//
// 来源（HarnessPro repo harnesses/terminal-bench-2/medium/runtime/profile_rubric.md，
// arXiv 2610.26770）：任务按可观测特征选五档 profile 之一（compact/lean/standard/
// deep/research），各档配推理强度与工具预算阶梯——「看任务下菜碟的动态路由」。
// rubric 本质是证据门序（先试 compact，再 research，再 deep，再 lean，兜底 standard；
// 只用任务文本显式描述的证据，禁用历史结果），不是文本理解。
//
// 本仓承接（诚实边界）：输入是调用方归好的结构化 TaskFacts（分发侧/探针负责从任务
// 描述归纳），本模块只做门序决策与档位策略映射，不解析自然语言。
// 五档阶梯阈值以 TB2 medium policy.json（唯一公开全表）的比例关系实例化为
// stage-ladder 分数旋钮：compact(2/4/14)→(0.15/0.35/0.95)、lean(6/10/22)→(0.30/0.50/0.95)、
// standard(14/26/44)→(0.40/0.70/1.0)、deep(16/30/54)→(0.35/0.60/1.0 阶梯更宽)、
// research(8/20/46)→(0.20/0.45/0.95 早收敛防发散)。
import { thresholdsValid, type StageThresholds } from './stage-ladder'

/** 任务可观测事实（调用方从任务描述归纳；rubric 证据规则的域内结构化）。 */
export interface TaskFacts {
  /** 有界且大体确定性（lean 门判据一）。 */
  boundedDeterministic: boolean
  /** 有效不确定项数（lean 门判据二：≤2）。 */
  uncertaintyCount: number
  /** 直接本地校验覆盖几乎全部决定性行为（lean 门判据四）。 */
  directLocalCheck: boolean
  /** 可证据分辨的假设数（deep 门判据：≥2 才有迭代空间）。 */
  evidenceResolvableHypotheses: number
  /** 强本地判定源：explicit=任务显式给出 / constructible=可由确定性参照构造 / none。 */
  strongLocalOracle: 'explicit' | 'constructible' | 'none'
  /** 主交付物是多源事实重建（版本/日期对齐、溯源、历史快照）——research 特征。 */
  multiSourceReconstruction: boolean
  /** 决定性来源显式不可达（research 门反例：不可达 → compact）。 */
  inaccessibleDecisiveSources: boolean
  /** 长串图形/远程/虚拟化/人工交互，正确性依赖视觉或隐藏态——compact 门判据一。 */
  visualHiddenState: boolean
  /** 单次候选评估代价大到吃掉时限的可观比例（deep 门的降档条款）。 */
  costlyEvaluations: boolean
}

export type TaskProfile = 'compact' | 'lean' | 'standard' | 'deep' | 'research'

export interface ProfilePolicy {
  profile: TaskProfile
  reasoningEffort: 'low' | 'medium' | 'high'
  /** 工具预算阶梯（占 maxSteps 比例；stage-ladder 消费）。 */
  ladder: StageThresholds
}

/** 五档预设（TB2 medium policy.json 比例实例化；全部过 thresholdsValid）。 */
export const PROFILE_PRESETS: Record<TaskProfile, ProfilePolicy> = {
  compact: { profile: 'compact', reasoningEffort: 'low', ladder: { economyAfter: 0.15, strictAfter: 0.35, finalizeAfter: 0.95, strictReminderEvery: 2 } },
  lean: { profile: 'lean', reasoningEffort: 'low', ladder: { economyAfter: 0.30, strictAfter: 0.50, finalizeAfter: 0.95, strictReminderEvery: 4 } },
  standard: { profile: 'standard', reasoningEffort: 'medium', ladder: { economyAfter: 0.40, strictAfter: 0.70, finalizeAfter: 1.0, strictReminderEvery: 8 } },
  deep: { profile: 'deep', reasoningEffort: 'high', ladder: { economyAfter: 0.35, strictAfter: 0.60, finalizeAfter: 1.0, strictReminderEvery: 8 } },
  research: { profile: 'research', reasoningEffort: 'high', ladder: { economyAfter: 0.20, strictAfter: 0.45, finalizeAfter: 0.95, strictReminderEvery: 6 } },
}

/** 预设合法性自检（防手改漂移；测试锁定）。 */
export function presetsValid(): boolean {
  return Object.values(PROFILE_PRESETS).every((p) => thresholdsValid(p.ladder))
}

export interface RouteDecision {
  profile: TaskProfile
  policy: ProfilePolicy
  /** 命中门与理由（rubric 门序逐门拷贝，可审计）。 */
  rationale: string
  /** 兜底提示（standard 命中时的未知 oracle 语义）。 */
  note?: string
}

/**
 * 门序路由（rubric 门序：compact→research→deep→lean→standard，先中先用）。
 * 证据规则（profile_rubric.md 逐门对译）：
 * - compact：视觉/隐藏态长交互，或决定性源不可达，且无忠实本地替代——低边际价值显式；
 * - research：主交付物=多源事实重建且决定性源可达；
 * - deep：强本地判定源（显式或可构造）且可分辨假设 ≥2 且单次评估代价不吞掉迭代空间；
 * - lean：有界确定性 ∧ 不确定项 ≤2 ∧ 有直接本地校验 ∧ 广泛探索前已有可信计划
 *   （本仓以 evidenceResolvableHypotheses ≤2 近似「探索前有计划」）；
 * - standard：其余一切（含未知 oracle 质量——未知≠弱，缺信息不另选档）。
 */
export function routeTaskProfile(facts: TaskFacts): RouteDecision {
  const p = (profile: TaskProfile, rationale: string, note?: string): RouteDecision => ({
    profile, policy: PROFILE_PRESETS[profile], rationale, ...(note ? { note } : {}),
  })

  if (facts.visualHiddenState) {
    return p('compact', 'Gate1 compact：正确性依赖视觉/隐藏态的长串交互且无忠实本地判定源——低边际价值显式（rubric Gate1）')
  }
  if (facts.inaccessibleDecisiveSources) {
    return p('compact', 'Gate1 compact：决定性来源显式不可达且无本地替代——再高的推理预算也买不到证据（rubric Gate2 不可达条款）')
  }
  if (facts.multiSourceReconstruction) {
    return p('research', 'Gate2 research：主交付物是多源事实重建（版本/日期/溯源对齐）——高推理+早收敛防发散（rubric Gate2）')
  }
  if ((facts.strongLocalOracle === 'explicit' || facts.strongLocalOracle === 'constructible')
    && facts.evidenceResolvableHypotheses >= 2 && !facts.costlyEvaluations) {
    return p('deep', 'Gate3 deep：强本地判定源在位且可分辨假设 ≥2，迭代空间足以回本（rubric Gate3；单次评估代价过大时降 standard）')
  }
  if (facts.boundedDeterministic && facts.uncertaintyCount <= 2
    && facts.directLocalCheck && facts.evidenceResolvableHypotheses <= 2) {
    return p('lean', 'Gate4 lean：有界确定性、不确定项 ≤2、直接本地校验覆盖决定性行为、探索前已有可信计划（rubric Gate4 四条件全显式）')
  }
  return p(
    'standard',
    'Gate5 standard：多子系统协同/若干可行动不确定项的常规实现与调试（rubric 兜底）',
    facts.strongLocalOracle === 'none'
      ? 'oracle 质量未知≠弱；缺信息不构成另选档的理由（rubric 证据规则）'
      : undefined,
  )
}
