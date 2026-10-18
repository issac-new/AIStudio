import { authFetch } from './auth-fetch'
// overlay：IDE 编码引擎模型目录取数（2026-09-26 用户指令的客户端半边）。
//
// 2026-10-18 用户裁定：模型选择使用 **Ycode/ZCode 实际配置**（~/.zcode/v2/config.json），
// 不是 Hermes/cc-switch 目录。服务端 GET /api/ide/engine-models 返回 zcode.groups
// （只投影 provider/模型 id，不出口密钥）；独立 IDE 目录作为次级来源，最后才回落
// appStore.modelGroups（过渡兼容，不空白）。
export interface EngineCatalogGroup {
  provider: string
  label?: string
  models: Array<{ id: string; reasoningLevels?: string[] }>
}

export interface EngineDefault {
  provider: string
  model: string
}

export interface EngineCatalog {
  groups: EngineCatalogGroup[]
  /** 是否有引擎目录可用（true=用 groups，不回落 hermes）。 */
  independent: boolean
  /** 目录来源（观测/测试用）。 */
  source: 'zcode' | 'independent' | 'hermes'
  /** 新会话默认模型（ZCode 首选 provider family 首模型；旧后端由独立目录 defaultModel 供给）。 */
  defaultModel?: EngineDefault | null
  /** P3 Auto 路由档位映射（config.route；缺省档不在此）。 */
  route?: Partial<Record<'economy' | 'standard' | 'power', { providerId: string; modelId: string }>>
}

function normalizeDefault(raw: unknown): EngineDefault | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as { provider?: unknown; model?: unknown; providerId?: unknown; modelId?: unknown }
  const provider = typeof o.provider === 'string' ? o.provider : (typeof o.providerId === 'string' ? o.providerId : '')
  const model = typeof o.model === 'string' ? o.model : (typeof o.modelId === 'string' ? o.modelId : '')
  return provider && model ? { provider, model } : null
}

/** 目录里可用的默认模型：优先服务端 default；目录里找不到时退回首个有模型的组。 */
export function engineDefaultModel(catalog: EngineCatalog | null | undefined): EngineDefault | null {
  const preferred = catalog?.defaultModel
  const usable = preferred && catalog?.groups.some(
    g => g.provider === preferred.provider && g.models.some(m => m.id === preferred.model),
  )
  if (usable && preferred) return preferred
  const group = catalog?.groups.find(g => g.models.length > 0)
  return group ? { provider: group.provider, model: group.models[0].id } : null
}

let rememberedDefault: EngineDefault | null = null
/** IdeChatPane 拉完目录后写入；命令面板等无异步上下文的入口同步读取。 */
export function rememberEngineDefault(value: EngineDefault | null): void { rememberedDefault = value }
export function engineDefaultFromCache(): EngineDefault | null { return rememberedDefault }
export function resetEngineDefaultCache(): void { rememberedDefault = null }

export async function fetchEngineCatalog(): Promise<EngineCatalog> {
  const res = await authFetch('/api/ide/engine-models')
  if (!res.ok) throw new Error(`engine-models ${res.status}`)
  const body = (await res.json()) as {
    config?: {
      providers?: Array<{ providerId: string; label?: string; models?: Array<{ modelId: string; reasoningLevels?: string[] }> }>
      defaultModel?: { providerId: string; modelId: string } | null
      route?: Partial<Record<'economy' | 'standard' | 'power', { providerId: string; modelId: string }>>
    }
    zcode?: {
      groups?: Array<{ provider: string; label?: string; models?: Array<{ id: string; reasoningLevels?: string[] }> }>
      default?: { provider: string; model: string } | null
    }
  }
  const zcodeGroups = (body.zcode?.groups ?? [])
    .filter((g) => (g.models ?? []).length > 0)
    .map((g) => ({
      provider: g.provider,
      label: g.label || g.provider,
      models: (g.models ?? []).map((m) => ({ id: m.id, ...(m.reasoningLevels ? { reasoningLevels: m.reasoningLevels } : {}) })),
    }))
  const independentDefault = normalizeDefault(body.config?.defaultModel)
  if (zcodeGroups.length > 0) {
    return {
      groups: zcodeGroups,
      independent: true,
      source: 'zcode',
      defaultModel: normalizeDefault(body.zcode?.default) ?? independentDefault,
      route: body.config?.route,
    }
  }
  const providers = body.config?.providers ?? []
  const groups = providers
    .filter((p) => (p.models ?? []).length > 0)
    .map((p) => ({
      provider: p.providerId,
      label: p.label || p.providerId,
      models: (p.models ?? []).map((m) => ({ id: m.modelId, ...(m.reasoningLevels ? { reasoningLevels: m.reasoningLevels } : {}) })),
    }))
  return {
    groups,
    independent: groups.length > 0,
    source: groups.length > 0 ? 'independent' : 'hermes',
    defaultModel: independentDefault,
    route: body.config?.route,
  }
}
