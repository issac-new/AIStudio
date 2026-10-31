// overlay[modelcap] 风险分档路由：任务风险 × 模型证据 → 选型决定。
// 高风险 fail-closed（无足量证据 → requiresHuman，不静默降级）；
// 低/中风险无证据时可回落显式 defaultModel，但标注 unknown/待独立验证。
import type {
  CapabilityCell,
  CapabilityMatrix,
  RouteCandidate,
  RouteDecision,
  RouteRequest,
  RiskTier,
} from './types'

interface RiskPolicy {
  minSamples: number
  minPassAt1: number
}

export const RISK_POLICY: Record<RiskTier, RiskPolicy> = {
  high: { minSamples: 10, minPassAt1: 0.9 },
  medium: { minSamples: 5, minPassAt1: 0.75 },
  low: { minSamples: 3, minPassAt1: 0.6 },
}

function candidateOf(cell: CapabilityCell, policy: RiskPolicy): RouteCandidate {
  const qualifies = !cell.stale
    && !cell.insufficient
    && cell.samples >= policy.minSamples
    && cell.passAt1 !== null
    && cell.passAt1 >= policy.minPassAt1
  return {
    model: cell.model,
    provider: cell.provider,
    passAt1: cell.passAt1,
    samples: cell.samples,
    stale: cell.stale,
    insufficient: cell.insufficient,
    qualifies,
  }
}

function fallbackDecision(request: RouteRequest, candidates: RouteCandidate[], reason: string): RouteDecision {
  if (request.risk === 'high') {
    return {
      ok: false,
      model: null,
      provider: null,
      tier: request.risk,
      reason: `${reason}；高风险任务拒绝静默降级，升级人工/固定强模型`,
      candidates,
      requiresHuman: true,
      unknown: true,
    }
  }
  if (request.defaultModel) {
    return {
      ok: true,
      model: request.defaultModel,
      provider: null,
      tier: request.risk,
      reason: `${reason}；按 ${request.risk} 风险回落默认模型，结果需独立验证`,
      candidates,
      requiresHuman: false,
      unknown: false,
    }
  }
  return {
    ok: false,
    model: null,
    provider: null,
    tier: request.risk,
    reason: `${reason}；没有 defaultModel 可回落，保持 unknown`,
    candidates,
    requiresHuman: request.risk === 'medium',
    unknown: true,
  }
}

export function routeModel(request: RouteRequest, matrix: CapabilityMatrix | null): RouteDecision {
  if (!request || !RISK_POLICY[request.risk]) {
    throw new Error(`unknown risk tier: ${String(request?.risk)}`)
  }
  const policy = RISK_POLICY[request.risk]
  const cells = matrix?.cells ?? []
  const exact = cells.filter((cell) =>
    cell.category === request.category
    && (request.difficulty ? cell.difficulty === request.difficulty.toUpperCase() : true))
  // 高风险不跨难度借证据；低/中风险在缺精确难度时允许同类别证据兜底。
  const broad = cells.filter((cell) => cell.category === request.category)
  const pool = exact.length > 0 ? exact : (request.risk === 'high' ? [] : broad)
  const candidates = pool.map((cell) => candidateOf(cell, policy))
  const qualified = candidates
    .filter((candidate) => candidate.qualifies)
    .sort((a, b) =>
      (b.passAt1 ?? -1) - (a.passAt1 ?? -1)
      || b.samples - a.samples
      || a.model.localeCompare(b.model))

  if (qualified.length > 0) {
    const winner = qualified[0]
    return {
      ok: true,
      model: winner.model,
      provider: winner.provider,
      tier: request.risk,
      reason: `${request.risk} 风险要求 pass@1≥${policy.minPassAt1}、样本≥${policy.minSamples}；`
        + `选中 ${winner.model}（pass@1=${winner.passAt1?.toFixed(3)}，n=${winner.samples}）`,
      candidates,
      requiresHuman: false,
      unknown: false,
    }
  }

  const evidenceState = matrix === null
    ? '能力矩阵不可用'
    : exact.length === 0
      ? `没有 ${request.category}/${request.difficulty ?? '*'} 的历史证据`
      : '现有模型证据未达到风险阈值或已过期'
  return fallbackDecision(request, candidates, evidenceState)
}

/** 供派单/卡面消费的一行处置建议（不执行选型，只解释）。 */
export function routeHint(decision: RouteDecision): string {
  const head = `模型路由：${decision.tier} → ${decision.model ?? 'unknown'}`
  const tail = decision.requiresHuman ? '（需人工裁决）' : decision.unknown ? '（证据不足）' : ''
  return `${head}${tail}；依据：${decision.reason}`
}
