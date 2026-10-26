// overlay/proactivity 域：主动性两轴模型（阿里技术《Personal Agent 落地思考》吸收轮 2026-10-26）。
//
// 文章两轴（原文 §3，图 4/图 5）：
//   横轴=谁定义问题：L1 指令 / L2 时间规则 / L3 事件触发 / L4 用户给目标 Agent 算差距 / L5 Agent 推断目标；
//   纵轴=做到哪一步：告知 / 建议 / 起草待确认 / 可逆执行 / 不可逆对外执行。
// 与既有域关系：autonomyladder（BCG 三档=执行自主度单轴）与 goalautonomy（停点判定）是纵轴近亲；
// 本域补「问题定义权」横轴与两轴组合裁决，纯函数不碰执行链（enforce-gate 接线见 spec 挂账）。
//
// 裁决规则（文章 §5/§6 的最小忠实实现）：
//   - L5 恒只告知：目标若猜错，差距/问题/任务全链跟错（§6.2）；观察到什么由人决定是不是目标；
//   - L4 无契约（目标未说清或无验收规则）上限起草：问题由 Agent 定义、责任还在人——
//     作者 Daisy 实证：276 条 todo 中 Agent 自动核销 0 条，责任不对称下人只肯让它停在建议（§4.1/§4.2）；
//   - L4 有契约（目标明确+验收规则）=升仓通道（§6.3 杠杆），放开到不可逆执行但仍受失败代价约束——
//     授权跟着子任务走，不跟着目标走（§2.2②）；
//   - L1-L3 问题与边界皆用户定义、责任在用户，全档可及，同样受失败代价约束。

/** 横轴：谁定义问题（L1-L5；文章 §3.1「L3 到 L4 是质变」）。 */
export const PROBLEM_DEFINER_LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5'] as const
export type ProblemDefinerLevel = (typeof PROBLEM_DEFINER_LEVELS)[number]

export interface ProblemDefinerMeta {
  title: string
  definer: string
  example: string
}

export const PROBLEM_DEFINER_TITLES: Record<ProblemDefinerLevel, ProblemDefinerMeta> = {
  L1: { title: '指令', definer: '用户逐条下达', example: '「跑一下目标测试」即时执行' },
  L2: { title: '时间规则', definer: '用户定时间规则，Agent 按时执行', example: '每晚 20:00 收敛当日会话产出待办' },
  L3: { title: '事件触发', definer: '用户定事件条件，Agent 被事件唤醒', example: 'git push 后跑验收（automations 四源同款时机）' },
  L4: { title: '目标差距', definer: '用户给目标，Agent 自己算「缺什么补什么」', example: '「把里程碑推到上线」→Agent 对照现状拆任务' },
  L5: { title: '推断目标', definer: 'Agent 推断用户目标（含未说出口的）', example: '「今天涉猎到、可能值得沉淀的话题」discover' },
}

/** 纵轴：做到哪一步（低→高有序；文章 §3.2/§5 五档）。 */
export const ACTION_TIERS = ['inform', 'suggest', 'draft', 'reversible_exec', 'irreversible_exec'] as const
export type ActionTier = (typeof ACTION_TIERS)[number]

export const ACTION_TIER_TITLES: Record<ActionTier, string> = {
  inform: '告知（只报告观察，不动手）',
  suggest: '建议（给出该做什么，等人决定）',
  draft: '起草待确认（产出可检查的草稿，人核后生效）',
  reversible_exec: '可逆执行（出错可撤回）',
  irreversible_exec: '不可逆/对外执行（回不去、影响他人）',
}

const TIER_ORDER: Record<ActionTier, number> = {
  inform: 0,
  suggest: 1,
  draft: 2,
  reversible_exec: 3,
  irreversible_exec: 4,
}

/** 目标契约（文章 §6.3 杠杆：说清目标 L5 变 L4；说清验收规则 L4 的一部分变「按规则执行」）。 */
export interface GoalContract {
  /** 目标已显式说清（不靠 Agent 猜）。 */
  goalExplicit: boolean
  /** 有可检查的验收规则（做没做对能被验证）。 */
  acceptanceCriteria: boolean
}

/** 失败代价三要素（文章 §5：能不能撤回 / 影响到谁 / 结果能不能验证）。 */
export type ImpactScope = 'self' | 'team' | 'external'

export interface FailureCostFacts {
  reversible: boolean
  impactScope: ImpactScope
  verifiable: boolean
}

export type FailureCostTier = 'low' | 'medium' | 'high'

/** 三要素→代价档：low=可撤回∧仅本人∧可验证（文章五档图左下角，最适合直接执行）；high=不可撤回∧（对外影响∨不可验证）（右上角，人工把关）；其余 medium。 */
export function failureCostTier(f: FailureCostFacts): FailureCostTier {
  if (f.reversible && f.impactScope === 'self' && f.verifiable) return 'low'
  if (!f.reversible && (f.impactScope === 'external' || !f.verifiable)) return 'high'
  return 'medium'
}

/** 代价档→执行上限：low 不降档；medium 上限可逆执行；high 上限起草（人在关键节点把关）。 */
export function failureCostCap(tier: FailureCostTier): ActionTier {
  if (tier === 'low') return 'irreversible_exec'
  if (tier === 'medium') return 'reversible_exec'
  return 'draft'
}

/** 横轴档位上限（文章 §6 上限论 + §6.3 升仓通道）。 */
export function maxActionTierForLevel(level: ProblemDefinerLevel, contract?: GoalContract): ActionTier {
  if (level === 'L5') return 'inform'
  if (level === 'L4') {
    const hasContract = contract?.goalExplicit === true && contract?.acceptanceCriteria === true
    return hasContract ? 'irreversible_exec' : 'draft'
  }
  return 'irreversible_exec'
}

/** 目标对齐状态名（goal-alignment.alignmentStatus 的 status；此处只依赖名字以保持单向依赖）。 */
export type AlignmentStatusName = 'fresh' | 'stale' | 'never-confirmed'

export interface AssessInput {
  level: ProblemDefinerLevel
  action: ActionTier
  /** 目标契约（L4 升仓判定输入；缺省=无契约）。 */
  contract?: GoalContract
  /** 失败代价三要素（缺省=不按代价约束，仅按横轴判）。 */
  failureCost?: FailureCostFacts
  /** 目标对齐状态（仅约束 L4；漂移防线）。 */
  goalStatus?: AlignmentStatusName
}

export interface AssessResult {
  allowed: boolean
  /** 综合上限（横轴上限、代价上限、对齐约束三者取最低）。 */
  cappedAt: ActionTier
  /** 命中规则（人话，呈现面直接用）。 */
  reasons: string[]
}

function minTier(a: ActionTier, b: ActionTier): ActionTier {
  return TIER_ORDER[a] <= TIER_ORDER[b] ? a : b
}

/** 两轴组合裁决（纯函数；执行面接线见 spec 挂账 H4）。 */
export function assess(input: AssessInput): AssessResult {
  const reasons: string[] = []
  let cappedAt = maxActionTierForLevel(input.level, input.contract)

  if (input.level === 'L5') {
    reasons.push('L5（推断目标）只告知：目标猜错则差距/问题/任务全链跟错——观察到什么由人决定是不是目标')
  }
  if (input.level === 'L4') {
    if (cappedAt === 'draft') {
      reasons.push('L4 无契约上限起草：问题由 Agent 定义、责任还在人——目标与验收规则说清才能升仓（授权跟着子任务走）')
    } else {
      reasons.push('L4 有契约（目标明确+验收规则）升仓放开——仍逐子任务受失败代价约束')
    }
  }

  if (input.failureCost) {
    const tier = failureCostTier(input.failureCost)
    const cap = failureCostCap(tier)
    if (TIER_ORDER[cap] < TIER_ORDER[cappedAt]) {
      cappedAt = cap
      reasons.push(
        `失败代价 ${tier}（可撤回=${input.failureCost.reversible}、影响=${input.failureCost.impactScope}、可验证=${input.failureCost.verifiable}）→上限 ${ACTION_TIER_TITLES[cap]}`,
      )
    }
  }

  // 漂移防线（文章 §2.2③/§6.1）：周期越长目标越会漂——L4 拿着过期未确认的目标推进时压回起草，
  // 契约不豁免（旧目标的契约一样过期）。L1-L3 规则本身即对齐、L5 已被压到告知，均不受此约束。
  if (input.level === 'L4' && input.goalStatus && input.goalStatus !== 'fresh') {
    const driftCap: ActionTier = 'draft'
    if (TIER_ORDER[driftCap] < TIER_ORDER[cappedAt]) {
      cappedAt = driftCap
    }
    reasons.push(
      input.goalStatus === 'stale'
        ? '目标确认已过期（stale）：拿着旧目标用力推进是最危险的失败方式——先重新确认目标'
        : '目标从未与人确认（never-confirmed）：先显式对齐再让 Agent 按它推进',
    )
  }

  const allowed = TIER_ORDER[input.action] <= TIER_ORDER[cappedAt]
  return { allowed, cappedAt, reasons }
}

/** 升仓通道提示（文章 §6.3：能力不变，变的是交给 Agent 的东西）。纯建议不改裁决。 */
export function upgradeAdvice(
  level: ProblemDefinerLevel,
  contract: GoalContract = { goalExplicit: false, acceptanceCriteria: false },
): { note: string } {
  if (level === 'L5') {
    return contract.goalExplicit
      ? { note: '目标已说清——不用再猜，可从 L5 降为 L4（对照目标算差距）' }
      : { note: 'L5 卡在「目标靠猜」：把目标说清即可降为 L4（差距可计算是 L4 的前提）' }
  }
  if (level === 'L4') {
    if (!contract.goalExplicit) return { note: '先把目标说清（可量化或有可检查状态），差距才能算' }
    if (!contract.acceptanceCriteria) return { note: '补验收规则（做没做对能被检查）——符合规则、失败代价低的子任务才能自动执行' }
    return { note: '目标+验收规则齐备：符合验收规则、失败代价低的子任务可按规则自动执行（授权跟着子任务走，不跟着目标走）' }
  }
  return { note: 'L1-L3 问题与边界皆用户定义：把规则与确认点写清即可放心交出（autonomyladder 配置面）' }
}
