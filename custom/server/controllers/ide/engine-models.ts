/**
 * IDE 编码引擎独立模型配置 REST（/api/ide/engine-models）——用户指令 2026-09-26：
 * IDE 工作台编程工具（zcode 底座）的模型配置与 hermes agent 独立设置。
 *
 * GET /api/ide/engine-models   读独立配置（空=未配置，客户端回落 hermes 目录兼容）
 * PUT /api/ide/engine-models   校验+原子写（幂等全量替换）
 *
 * 存储：runtime/ide-engine-models.json（与 hermes config.yaml/db 零共享）。
 * 挂载：patch 477 在 bootstrap/routes.ts（session-share 356 同款两行）。
 */
import Router from '@koa/router'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import {
  validateEngineModelConfig, type EngineModelConfig,
} from '../../enginemodels/engine-model-config'

const engineModelsRouter = new Router({ prefix: '/api/ide/engine-models' })

// 存储路径支持 ENGINE_MODEL_STORE 覆盖（守门注入临时文件；生产默认 runtime/）。
const STORE_PATH = process.env.ENGINE_MODEL_STORE?.trim()
  ? resolve(process.env.ENGINE_MODEL_STORE)
  : join(__dirname, '../../../runtime/ide-engine-models.json')

function readConfig(): EngineModelConfig {
  if (!existsSync(STORE_PATH)) return { providers: [], defaultModel: null }
  try {
    const raw = JSON.parse(readFileSync(STORE_PATH, 'utf8')) as EngineModelConfig
    if (!Array.isArray(raw.providers)) return { providers: [], defaultModel: null }
    return raw
  } catch {
    return { providers: [], defaultModel: null }
  }
}

function writeAtomic(config: EngineModelConfig): void {
  const tmp = `${STORE_PATH}.tmp`
  writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8')
  renameSync(tmp, STORE_PATH)
}

engineModelsRouter.get('/', (ctx) => {
  ctx.body = { ok: true, config: readConfig(), store: 'runtime/ide-engine-models.json' }
})

engineModelsRouter.put('/', (ctx) => {
  const body = ctx.request?.body as Partial<EngineModelConfig> | undefined
  const config: EngineModelConfig = {
    providers: Array.isArray(body?.providers) ? body!.providers! : [],
    defaultModel: body?.defaultModel ?? null,
  }
  const validation = validateEngineModelConfig(config)
  if (!validation.ok) {
    ctx.status = 400
    ctx.body = { ok: false, problems: validation.problems }
    return
  }
  writeAtomic(config)
  const passthrough = writeThroughToEngine(config)
  ctx.body = { ok: true, config, enginePassthrough: passthrough }
})

// ── 层 2 写穿：IDE 独立配置 → zcode 引擎真实读的 ~/.zcode/v2/config.json ──
// 键位隔离：只写 `ide-engine:<providerId>` 前缀条目（用户已有条目零触碰）。
// apiKeyEnv 语义：服务端解析 env 取真值；env 缺失→enabled:false 占位（不写空 key）。
// 生效时点：引擎按自身配置装载节奏消费（写穿后新会话/引擎重载生效）。
function zcodeConfigPath(): string {
  const root = process.env.ZCODE_HOME?.trim() ? resolve(process.env.ZCODE_HOME) : join(homedir(), '.zcode')
  return join(root, 'v2', 'config.json')
}

export interface EnginePassthrough {
  wrote: boolean
  providerKeys: string[]
  note: string
}

export function writeThroughToEngine(config: EngineModelConfig): EnginePassthrough {
  try {
    const path = zcodeConfigPath()
    if (!existsSync(path)) {
      return { wrote: false, providerKeys: [], note: `zcode config 不存在（${path}）——引擎未初始化，跳过写穿` }
    }
    const engine = JSON.parse(readFileSync(path, 'utf8')) as {
      provider?: Record<string, Record<string, unknown>>
    }
    engine.provider = engine.provider ?? {}
    const keys: string[] = []
    for (const p of config.providers) {
      const key = `ide-engine:${p.providerId}`
      const apiKey = p.apiKeyEnv ? (process.env[p.apiKeyEnv] ?? '').trim() : ''
      const models: Record<string, unknown> = {}
      for (const m of p.models) {
        models[m.modelId] = {
          name: m.modelId,
          limit: { context: 1048576, output: 128000 },
          modalities: { input: ['text'], output: ['text'] },
          ...(m.reasoningLevels ? { reasoningLevels: m.reasoningLevels } : {}),
        }
      }
      engine.provider[key] = {
        name: `IDE · ${p.providerId}`,
        kind: 'anthropic',
        options: { baseURL: p.baseURL, ...(apiKey ? { apiKey } : {}) },
        enabled: apiKey !== '' || !p.apiKeyEnv,
        source: 'custom',
        ...(Object.keys(models).length ? { models } : {}),
      }
      keys.push(key)
    }
    const tmp = `${path}.tmp`
    writeFileSync(tmp, JSON.stringify(engine, null, 2), 'utf8')
    renameSync(tmp, path)
    return { wrote: true, providerKeys: keys, note: '已写穿 ~/.zcode/v2/config.json（ide-engine: 前缀条目；引擎重载/新会话生效）' }
  } catch (err) {
    return { wrote: false, providerKeys: [], note: `写穿失败：${err instanceof Error ? err.message.slice(0, 200) : String(err)}` }
  }
}

export default engineModelsRouter
