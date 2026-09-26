// overlay/enginemodels 域：IDE 编码引擎独立模型配置（用户指令 2026-09-26：
// "IDE 工作台的编程工具的模型配置（功能同 zcode）与 hermes agent 的模型不同，
// 为独立设置"）。
//
// 隔离红线：IDE 编码引擎（zcode 底座）的模型目录**独立存储/独立端点**，与
// hermes agent 的 providers（config.yaml/hermes-web-ui.db）零共享——改一边
// 绝不影响另一边。功能对齐 zcode ListModels 语义：providers（id/baseURL/
// apiKeyEnv）× models（id+推理档）+默认模型。
export interface EngineModelEntry {
  modelId: string
  /** 推理档位（zcode reasoningLevels 语义；空=该模型无档位）。 */
  reasoningLevels?: string[]
}

export interface EngineProviderEntry {
  providerId: string
  baseURL: string
  /** API key 的环境变量名（只存名字不存值——凭据经 env 注入）。 */
  apiKeyEnv?: string
  models: EngineModelEntry[]
}

export interface EngineModelConfig {
  providers: EngineProviderEntry[]
  defaultModel: { providerId: string; modelId: string } | null
}

export interface ConfigValidation {
  ok: boolean
  problems: string[]
}

/** 配置校验：provider/model 唯一性+默认模型可达。 */
export function validateEngineModelConfig(config: EngineModelConfig): ConfigValidation {
  const problems: string[] = []
  const providerIds = new Set<string>()
  for (const p of config.providers) {
    if (!p.providerId.trim()) problems.push('empty providerId')
    if (providerIds.has(p.providerId)) problems.push(`duplicate providerId: ${p.providerId}`)
    providerIds.add(p.providerId)
    if (!/^https?:\/\//.test(p.baseURL)) problems.push(`bad baseURL for ${p.providerId}`)
    const modelIds = new Set<string>()
    for (const m of p.models) {
      if (!m.modelId.trim()) problems.push(`empty modelId under ${p.providerId}`)
      if (modelIds.has(m.modelId)) problems.push(`duplicate modelId ${p.modelId} under ${p.providerId}`)
      modelIds.add(m.modelId)
    }
  }
  const d = config.defaultModel
  if (d) {
    const provider = config.providers.find((p) => p.providerId === d.providerId)
    if (!provider) problems.push(`defaultModel provider 不存在: ${d.providerId}`)
    else if (!provider.models.some((m) => m.modelId === d.modelId)) {
      problems.push(`defaultModel ${d.modelId} 不在 ${d.providerId} 目录内`)
    }
  }
  return { ok: problems.length === 0, problems }
}

/** 隔离断言：本域存储路径与 hermes providers 源零交集（守门用）。 */
export function assertIsolated(engineStorePath: string, hermesConfigSources: readonly string[]): boolean {
  return !hermesConfigSources.some((src) => src === engineStorePath)
}

/** 切换器目录投影：(provider, model) 平铺（对齐 appStore.modelGroups 消费形态）。 */
export function engineModelGroups(config: EngineModelConfig): Array<{
  provider: string
  models: Array<{ id: string; reasoningLevels?: string[] }>
}> {
  return config.providers.map((p) => ({
    provider: p.providerId,
    models: p.models.map((m) => ({ id: m.modelId, ...(m.reasoningLevels ? { reasoningLevels: m.reasoningLevels } : {}) })),
  }))
}
