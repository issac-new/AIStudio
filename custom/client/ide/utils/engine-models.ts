// overlay：IDE 编码引擎独立模型目录取数（2026-09-26 用户指令的客户端半边）。
//
// 数据源=/api/ide/engine-models（patch 477 挂载，runtime/ide-engine-models.json
// 独立存储——与 hermes providers 零共享）。**独立目录优先，空则回落
// appStore.modelGroups**（未配置前工作台不空白——过渡兼容）。
export interface EngineCatalogGroup {
  provider: string
  models: Array<{ id: string; reasoningLevels?: string[] }>
}

export interface EngineCatalog {
  groups: EngineCatalogGroup[]
  /** 独立配置是否非空（false=回落 hermes 目录）。 */
  independent: boolean
}

export async function fetchEngineCatalog(): Promise<EngineCatalog> {
  const res = await fetch('/api/ide/engine-models')
  if (!res.ok) throw new Error(`engine-models ${res.status}`)
  const body = (await res.json()) as {
    config?: { providers?: Array<{ providerId: string; models?: Array<{ modelId: string; reasoningLevels?: string[] }> }> }
  }
  const providers = body.config?.providers ?? []
  const groups = providers
    .filter((p) => (p.models ?? []).length > 0)
    .map((p) => ({
      provider: p.providerId,
      models: (p.models ?? []).map((m) => ({ id: m.modelId, ...(m.reasoningLevels ? { reasoningLevels: m.reasoningLevels } : {}) })),
    }))
  return { groups, independent: groups.length > 0 }
}
