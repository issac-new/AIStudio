/**
 * 双签判定（A 组）——纯函数 + 高风险类清单，不触碰审批状态机。
 *
 * 来源：《断裂与重建：AI 时代 CHRO 的影响力》6.4 的双签制（凡涉员工数据、算法对员工的
 * 直接影响、岗位替代，HR 与技术共同签署）。本仓对应的高风险面是生产发布、权限提升、
 * 数据外发、模型替换、删除类操作。
 *
 * 纪律：本模块只判定「是否满足双签」，不阻断审批。裁决后置校验由控制器读 approval-log
 * 完成（缺第二签落缺口记录），真拦需要改 approval-inbox 裁决路径，属单独轮次。
 */

export const HIGH_RISK_CLASSES = [
  'production-release',
  'privilege-escalation',
  'data-egress',
  'model-replacement',
  'destructive-delete',
] as const

export type HighRiskClass = (typeof HIGH_RISK_CLASSES)[number]

export const HIGH_RISK_TITLES: Record<HighRiskClass, string> = {
  'production-release': '生产发布',
  'privilege-escalation': '权限提升',
  'data-egress': '数据外发',
  'model-replacement': '模型替换',
  'destructive-delete': '删除类操作',
}

export interface Signature {
  /** 签署人标识（账号名或 profile 名） */
  by: string
  at: number
  /** 签署角色（可选，仅记录不参与判定） */
  role?: string
}

export interface DualSignResult {
  satisfied: boolean
  /** 影响判定的理由一句话 */
  reason: string
  /** 去重后的签署人数 */
  distinctSigners: number
  /** 是否属于高风险类（false 时无需双签） */
  required: boolean
}

function isHighRiskClass(v: unknown): v is HighRiskClass {
  return typeof v === 'string' && (HIGH_RISK_CLASSES as readonly string[]).includes(v)
}

/**
 * 双签判定：高风险类须两个不同签署人；同一人签两次不算。
 *
 * 缺失签名者（空 by）不计入：空标识不能充数，否则「补个空签」就成了绕过路径。
 */
export function dualSignSatisfied(change: {
  klass?: unknown
  signatures?: unknown
}): DualSignResult {
  if (!isHighRiskClass(change.klass)) {
    return {
      satisfied: true,
      reason: '非高风险类，不要求双签',
      distinctSigners: 0,
      required: false,
    }
  }
  const list = Array.isArray(change.signatures) ? (change.signatures as Signature[]) : []
  const signers = new Set<string>()
  for (const s of list) {
    if (s && typeof s.by === 'string' && s.by.trim()) signers.add(s.by.trim())
  }
  const distinctSigners = signers.size
  if (distinctSigners >= 2) {
    return {
      satisfied: true,
      reason: `双签满足：${[...signers].join(' / ')}`,
      distinctSigners,
      required: true,
    }
  }
  return {
    satisfied: false,
    reason: distinctSigners === 0
      ? `${HIGH_RISK_TITLES[change.klass]}须双签：当前无签署记录`
      : `${HIGH_RISK_TITLES[change.klass]}须双签：当前仅 1 人签署（${[...signers][0]}），缺第二签`,
    distinctSigners,
    required: true,
  }
}

/** 供 UI 展示与请求校验共用的类清单。 */
export function highRiskOptions(): { klass: HighRiskClass; title: string }[] {
  return HIGH_RISK_CLASSES.map((klass) => ({ klass, title: HIGH_RISK_TITLES[klass] }))
}

// ── 审批期双签闸（2026-11-05 收口：从「只判定」升级为「真拦」）──

/** 批准类决策（需双签）；否决类不需要（收紧方向不加门槛）。 */
export const APPROVE_DECISIONS: readonly string[] = ['approve', 'once', 'session', 'always', 'approved_scoped', 'approved_once']
export const DENY_DECISIONS: readonly string[] = ['deny', 'reject']

/** 单操作员显式豁免理由（唯一合法 waiver 值——开放的 waiver 字段等于没有闸）。 */
export const SINGLE_OPERATOR_WAIVER = 'single-operator'

export interface DualSignGateInput {
  /** 审批目标 id（审批单 / 执法单） */
  targetId: string
  /** 本次裁决人 */
  actor: string
  /** 服务端重算的风险档（undefined=判不了，本闸不适用） */
  risk: string | undefined
  decision: string
  /** 请求自带豁免理由 */
  waiver?: string
  /** 该目标此前已签人（不含本次） */
  priorSigners: string[]
  /** 开关（控制器读 env 传入；纯函数不碰 env） */
  enabled: boolean
}

export interface DualSignGateResult {
  /** 是否放行 */
  allow: boolean
  /** 本闸是否适用（非高风险 / 判不了档位 / 关闭时为 false） */
  applicable: boolean
  /** 拒绝时的机器可读码 */
  code?: 'dual-sign-required'
  reason: string
  /** 记上本次签名后的签署人集合 */
  signers: string[]
  /** 是否走了单操作员豁免 */
  waived?: boolean
}

/**
 * 审批期双签闸：高风险批准须两个不同签署人，或单操作员显式豁免。
 *
 * 设计取舍（spec D1/D2/D3）：只拦「档位可重算 + 高风险 + 批准」这一格。
 * 判不了档位的分支不拦——不猜档位，也不假装拦了（响应里的 applicable 会说清）。
 */
export function decideDualSignGate(input: DualSignGateInput): DualSignGateResult {
  const signers = uniqueSigners([...input.priorSigners, input.actor])
  const base = { signers, applicable: false }

  if (!input.enabled) {
    return { ...base, allow: true, reason: '双签闸已关闭（AUTONOMY_DUAL_SIGN=off）' }
  }
  if (input.risk !== 'high') {
    return { ...base, allow: true, reason: `风险档非 high（${input.risk ?? '未评级'}），双签不适用` }
  }
  if (DENY_DECISIONS.includes(input.decision)) {
    return { ...base, allow: true, reason: '否决类决策不需要双签（收紧方向不加门槛）' }
  }
  if (!APPROVE_DECISIONS.includes(input.decision)) {
    // 未知决策词：不猜语义，按不适用放过（真正的合法性校验在路由分支里）
    return { ...base, allow: true, reason: `未知决策词「${input.decision}」，双签不适用` }
  }

  const applicable = { ...base, applicable: true }
  if (signers.length >= 2) {
    return { ...applicable, allow: true, reason: `双签满足：${signers.join(' / ')}` }
  }
  if (input.waiver === SINGLE_OPERATOR_WAIVER) {
    return {
      ...applicable,
      allow: true,
      waived: true,
      reason: `单操作员显式豁免（${signers.join(' / ') || '匿名'}）——豁免已落账可见`,
    }
  }
  return {
    ...applicable,
    allow: false,
    code: 'dual-sign-required',
    reason: signers.length === 0
      ? '高风险批准须双签：当前无签署记录'
      : `高风险批准须双签：当前仅 ${signers[0]} 签署，缺第二签（或显式声明 waiver='${SINGLE_OPERATOR_WAIVER}'）`,
  }
}

/** 签署人归一：去空、去重（同一人签两次不算两个签名）。 */
export function uniqueSigners(list: string[]): string[] {
  const out: string[] = []
  for (const raw of list) {
    const s = typeof raw === 'string' ? raw.trim() : ''
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}
