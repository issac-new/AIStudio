// overlay/modelroute 域：模型路由（qoder §四 P2-10 吸收，矩阵 §3.2 qoder P2）。
//
// qoder 语义（Auto 模型路由 ~0.5×/2.0× 档 + low~max 思考强度参数）：
// - **Auto 路由**：按任务复杂度选档（0.5× 便宜档/1× 标准/2× 强档——成本档位）；
// - **思考强度**：low~max 四档推理深度（qoder low~max 参数）。
// 衔接 408 per-model 工具覆盖（模型选好后按模型调工具面）与 403 token 计量。
export type CostTier = 'economy' | 'standard' | 'power'
export type ThinkLevel = 'low' | 'medium' | 'high' | 'max'

export interface RoutingFacts {
  /** 任务复杂度（调用方给：简单/标准/复杂）。 */
  complexity: 'simple' | 'standard' | 'complex'
}

export interface RoutingDecision {
  tier: CostTier
  thinkLevel: ThinkLevel
  detail: string
}

/** Auto 路由（qoder：简单→0.5× economy+low；复杂→2× power+max）。 */
export function autoRoute(facts: RoutingFacts): RoutingDecision {
  switch (facts.complexity) {
    case 'simple':
      return { tier: 'economy', thinkLevel: 'low', detail: '简单任务：0.5× 便宜档+low 思考' }
    case 'standard':
      return { tier: 'standard', thinkLevel: 'medium', detail: '标准任务：1× 标准档+medium 思考' }
    case 'complex':
      return { tier: 'power', thinkLevel: 'max', detail: '复杂任务：2× 强档+max 思考' }
  }
}

/** 思考强度档位（low~max 四档——qoder 参数化）。 */
export function normalizeThinkLevel(v: unknown): ThinkLevel {
  return (typeof v === 'string' && ['low', 'medium', 'high', 'max'].includes(v))
    ? (v as ThinkLevel) : 'medium'
}

// ── P3 接线（2026-10-04 九源轮）：档位→具体模型解析 ──

/** 档位映射（engine-models config.route 的形状；client/服务端共用）。 */
export interface TierModelRef { providerId: string; modelId: string }
export type TierRouteMap = Partial<Record<CostTier, TierModelRef>>

/**
 * 档位映射归一：只保留"provider+model 都齐"的条目（半截映射丢弃并报告）。
 * 返回 [归一映射, 丢弃的档位名]。
 */
export function normalizeTierRouteMap(raw: unknown): [TierRouteMap, CostTier[]] {
  const out: TierRouteMap = {}
  const dropped: CostTier[] = []
  if (!raw || typeof raw !== 'object') return [out, dropped]
  for (const tier of ['economy', 'standard', 'power'] as CostTier[]) {
    const ref = (raw as Record<string, unknown>)[tier]
    if (!ref || typeof ref !== 'object') continue
    const providerId = (ref as Record<string, unknown>).providerId
    const modelId = (ref as Record<string, unknown>).modelId
    if (typeof providerId === 'string' && providerId && typeof modelId === 'string' && modelId) {
      out[tier] = { providerId, modelId }
    } else {
      dropped.push(tier)
    }
  }
  return [out, dropped]
}

/**
 * Auto 路由解析：复杂度 → 档位决策 + 具体模型目标。
 * 映射缺该档时 target=null（调用方走回落链：localStorage/目录摊平序），
 * 如实返回 unmapped 而不是猜一个模型。
 */
export function resolveAutoRouteTarget(
  complexity: RoutingFacts['complexity'],
  routeMap: TierRouteMap,
): RoutingDecision & { target: TierModelRef | null; unmapped: boolean } {
  const decision = autoRoute({ complexity })
  const target = routeMap[decision.tier] ?? null
  return { ...decision, target, unmapped: target === null }
}
