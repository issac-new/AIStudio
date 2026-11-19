// overlay/modelroute：节点级执行规格解析（2026-11-19 调度智能接线批）。
//
// 优先级（显式 > 档位 > 默认 > 不 pin）：
//   1. config.execution.model          —— 调用方显式钉模型（最高）；
//   2. config.execution.tier           —— economy/standard/power 显式档；
//   3. config.execution.complexity     —— simple/standard/complex 走 autoRoute；
//   4. defaultModel                    —— 档位映射缺失时回落引擎默认模型；
//   5. 全缺                             —— 不 pin，交给 profile/gateway 默认。
//
// 边界：engine providerId（如 `builtin:bigmodel-coding-plan`）与 hermes gateway
// 的 provider 命名空间不同，默认只回 modelId；provider 仅在调用方显式给出时
// 透传（由调用方自证命名空间一致）。档位命中的 engine providerId 只作审计字段。
import {
  autoRoute,
  resolveAutoRouteTarget,
  type CostTier,
  type ThinkLevel,
  type TierRouteMap,
} from './model-routing'

export interface NodeExecutionSpec {
  /** 显式模型 id（最高优先）。 */
  model?: string
  /** 显式 provider（仅当与 model 同命名空间时使用）。 */
  provider?: string
  /** 思考强度（low/medium/high/max）；缺省由档位推导。 */
  reasoning?: ThinkLevel | string
  /** 复杂度档：simple→economy、standard→standard、complex→power。 */
  complexity?: 'simple' | 'standard' | 'complex'
  /** 显式成本档（优先于 complexity）。 */
  tier?: CostTier
}

export interface ResolvedNodeExecution {
  model?: string
  provider?: string
  reasoning?: string
  source: 'explicit' | 'tier' | 'default' | 'none'
  tier?: CostTier
  /** 档位映射缺该档时为 true（如实报告，不猜模型）。 */
  unmapped?: boolean
  /** 审计：档位映射命中的 engine providerId（不直接作为 hermes provider 透传）。 */
  routeProviderId?: string | null
}

export interface ResolveNodeExecutionOptions {
  routeMap?: TierRouteMap
  defaultModel?: string | null
}

const THINK_BY_TIER: Record<CostTier, ThinkLevel> = {
  economy: 'low',
  standard: 'medium',
  power: 'max',
}

export function resolveNodeExecution(
  spec: NodeExecutionSpec | undefined,
  opts: ResolveNodeExecutionOptions = {},
): ResolvedNodeExecution {
  if (!spec) return { source: 'none' }

  const explicitModel = typeof spec.model === 'string' ? spec.model.trim() : ''
  if (explicitModel) {
    const provider = typeof spec.provider === 'string' ? spec.provider.trim() : ''
    const reasoning = typeof spec.reasoning === 'string' ? spec.reasoning.trim() : ''
    return {
      model: explicitModel,
      ...(provider ? { provider } : {}),
      ...(reasoning ? { reasoning } : {}),
      source: 'explicit',
    }
  }

  const reasoningOverride = typeof spec.reasoning === 'string' ? spec.reasoning.trim() : ''
  const routeMap = opts.routeMap ?? {}
  let tier: CostTier | undefined
  let target: { providerId: string; modelId: string } | null = null
  let unmapped = false
  let reasoning = reasoningOverride

  if (spec.tier) {
    tier = spec.tier
    target = routeMap[tier] ?? null
    unmapped = target === null
    reasoning = reasoning || THINK_BY_TIER[tier]
  } else if (spec.complexity) {
    const resolved = resolveAutoRouteTarget(spec.complexity, routeMap)
    tier = resolved.tier
    target = resolved.target
    unmapped = resolved.unmapped
    reasoning = reasoning || resolved.thinkLevel
  }

  if (tier) {
    if (target) {
      return {
        model: target.modelId,
        reasoning,
        source: 'tier',
        tier,
        unmapped: false,
        routeProviderId: target.providerId,
      }
    }
    const fallback = typeof opts.defaultModel === 'string' && opts.defaultModel.trim()
      ? opts.defaultModel.trim()
      : undefined
    return {
      ...(fallback ? { model: fallback } : {}),
      reasoning,
      source: fallback ? 'default' : 'none',
      tier,
      unmapped: true,
    }
  }

  const fallback = typeof opts.defaultModel === 'string' && opts.defaultModel.trim()
    ? opts.defaultModel.trim()
    : undefined
  if (fallback) return { model: fallback, source: 'default' }
  return { source: 'none' }
}
