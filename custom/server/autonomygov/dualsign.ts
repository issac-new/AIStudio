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
