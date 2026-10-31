// overlay[modelcap] 类型：模型能力观测、矩阵、风险分档路由（2026-10-31 模型波动加固 C 层）。
// 原则：没有足量证据就是 unknown，不猜；高风险宁可不派也不静默降级。

export const MODELCAP_MATRIX_VERSION = 1
export const MODELCAP_STALE_DAYS = 14
export const MODELCAP_MIN_SAMPLES = 5

export type RiskTier = 'low' | 'medium' | 'high'

export const CAPABILITY_CATEGORIES = ['coding', 'review', 'planning', 'ops', 'research', 'other'] as const
export type CapabilityCategory = (typeof CAPABILITY_CATEGORIES)[number]

/** 一次评测观测（可按模型/类别/难度聚合）。 */
export interface CapabilityObservation {
  model: string
  provider?: string | null
  category: CapabilityCategory
  difficulty?: string | null
  passed: number
  total: number
  setHash?: string | null
  at: string
}

export interface CapabilityCell {
  model: string
  provider: string | null
  category: CapabilityCategory
  difficulty: string | null
  samples: number
  passes: number
  /** null = 样本不足，不伪装成 0 或全局均值 */
  passAt1: number | null
  setHash: string | null
  updatedAt: string
  stale: boolean
  insufficient: boolean
}

export interface CapabilityMatrix {
  version: number
  generatedAt: string
  minSamples: number
  cells: CapabilityCell[]
  sources?: string[]
}

export interface RouteRequest {
  category: CapabilityCategory
  risk: RiskTier
  difficulty?: string
  /** 低/中风险无合格证据时的保守回落（高风险忽略）。 */
  defaultModel?: string
}

export interface RouteCandidate {
  model: string
  provider: string | null
  passAt1: number | null
  samples: number
  stale: boolean
  insufficient: boolean
  qualifies: boolean
}

export interface RouteDecision {
  ok: boolean
  model: string | null
  provider: string | null
  tier: RiskTier
  reason: string
  candidates: RouteCandidate[]
  requiresHuman: boolean
  unknown: boolean
}
