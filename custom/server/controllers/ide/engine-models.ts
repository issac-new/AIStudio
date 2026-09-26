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
  ctx.body = { ok: true, config }
})

export default engineModelsRouter
