// overlay/enginemodels：节点路由用的只读配置投影（2026-11-19 调度智能接线批）。
//
// 与 controllers/ide/engine-models.ts 读同一份文件（ENGINE_MODEL_STORE 覆盖），
// 但只暴露路由需要的两件事：档位映射 + 默认模型 id。不导出 baseURL/key，
// 不写穿引擎配置。按 mtime 缓存，避免每个节点都读盘。
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeTierRouteMap, type TierRouteMap } from '../modelroute/model-routing'

export interface EngineRoutingConfig {
  /** economy/standard/power → {providerId, modelId}；缺失档不在 map 里。 */
  route: TierRouteMap
  /** 默认模型 id（只取 modelId；providerId 属 engine 命名空间，不透传给 hermes）。 */
  defaultModel: string | null
  store: string
}

interface Cached {
  path: string
  mtimeMs: number
  value: EngineRoutingConfig
}

let cached: Cached | null = null

export function engineModelStorePath(): string {
  const override = process.env.ENGINE_MODEL_STORE?.trim()
  if (override) return override
  return join(__dirname, '../../../runtime/ide-engine-models.json')
}

function emptyConfig(store: string): EngineRoutingConfig {
  return { route: {}, defaultModel: null, store }
}

export function readEngineRoutingConfig(): EngineRoutingConfig {
  const store = engineModelStorePath()
  let mtimeMs = -1
  try {
    if (!existsSync(store)) return emptyConfig(store)
    mtimeMs = statSync(store).mtimeMs
  } catch {
    return emptyConfig(store)
  }
  if (cached && cached.path === store && cached.mtimeMs === mtimeMs) return cached.value
  let value = emptyConfig(store)
  try {
    const raw = JSON.parse(readFileSync(store, 'utf8')) as Record<string, unknown>
    const [route] = normalizeTierRouteMap(raw.route)
    const dm = raw.defaultModel
    let defaultModel: string | null = null
    if (typeof dm === 'string' && dm.trim()) defaultModel = dm.trim()
    else if (dm && typeof dm === 'object') {
      const modelId = (dm as Record<string, unknown>).modelId
      if (typeof modelId === 'string' && modelId.trim()) defaultModel = modelId.trim()
    }
    value = { route, defaultModel, store }
  } catch {
    value = emptyConfig(store)
  }
  cached = { path: store, mtimeMs, value }
  return value
}

/** 测试隔离：清空 mtime 缓存。 */
export function _resetEngineRoutingConfigForTests(): void {
  cached = null
}
