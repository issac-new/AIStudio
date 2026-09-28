/**
 * IDE 原生中间件路由（404 缺陷修复，2026-09-28 实弹验收轮）。
 *
 * 背景：custom 新增的**非 GET** koa-router 路由在真进程 404（指纹日志证模块加载+
 * 路由注册均执行；独立文件化亦复现——疑 ts-node FILES 对 custom 新文件编译时序）。
 * 修复：绕开 koa-router 注册路径，在 bootstrap 层用**原生 koa 中间件**（app.use
 * 直挂）匹配方法+路径——koa 洋葱层与 router 无关，不经过该失效面。
 *
 * 覆盖两个端点（逻辑与 controller 同源复用纯函数）：
 *   PUT  /api/ide/engine-models     独立模型配置写穿入口
 *   POST /api/ide/video-frames      视频抽帧入口
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import type { Context, Next } from 'koa'

interface EngineModelEntry { modelId: string; reasoningLevels?: string[] }
interface EngineProviderEntry { providerId: string; baseURL: string; apiKeyEnv?: string; models: EngineModelEntry[] }
interface EngineModelConfig { providers: EngineProviderEntry[]; defaultModel: { providerId: string; modelId: string } | null }

/** 原生 koa 中间件：精确匹配方法+路径（非匹配直接 next 放行）。 */
export function ideNativeRoutes(): (ctx: Context, next: Next) => Promise<void> {
  return async (ctx: Context, next: Next): Promise<void> => {
    const path = String(ctx.path ?? '')
    const method = String(ctx.method ?? '').toUpperCase()

    if (method === 'PUT' && path === '/api/ide/engine-models') {
      await handleEngineModelsPut(ctx)
      return
    }
    if (method === 'POST' && path === '/api/ide/video-frames') {
      await handleVideoFrames(ctx)
      return
    }
    await next()
  }
}

async function handleEngineModelsPut(ctx: Context): Promise<void> {
  // 动态引用 controller 模块的校验纯函数（同源单一事实源）。
  const { validateEngineModelConfig } = await import('../../enginemodels/engine-model-config')
  const body = (ctx.request as { body?: Partial<EngineModelConfig> }).body ?? {}
  const config: EngineModelConfig = {
    providers: Array.isArray(body.providers) ? body.providers! : [],
    defaultModel: body.defaultModel ?? null,
  }
  const validation = validateEngineModelConfig(config)
  if (!validation.ok) {
    ctx.status = 400
    ctx.body = { ok: false, problems: validation.problems }
    return
  }
  // overlay 独立存储（物理路径锚=本文件 overlay 侧——与 controller 同型）。
  const store = resolve(__dirname, '../../../runtime/ide-engine-models.json')
  const tmp = `${store}.tmp`
  writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8')
  renameSync(tmp, store)
  // 层 2 写穿 ~/.zcode/v2/config.json（ide-engine: 前缀隔离）。
  const passthrough = writeThrough(config)
  ctx.body = { ok: true, config, enginePassthrough: passthrough }
}

interface EnginePassthrough { wrote: boolean; providerKeys: string[]; note: string }

function writeThrough(config: EngineModelConfig): EnginePassthrough {
  try {
    const root = process.env.ZCODE_HOME?.trim() ? resolve(process.env.ZCODE_HOME) : join(homedir(), '.zcode')
    const path = join(root, 'v2', 'config.json')
    if (!existsSync(path)) return { wrote: false, providerKeys: [], note: `zcode config 不存在（${path}）` }
    const engine = JSON.parse(readFileSync(path, 'utf8')) as { provider?: Record<string, Record<string, unknown>> }
    engine.provider = engine.provider ?? {}
    const keys: string[] = []
    for (const p of config.providers) {
      const key = `ide-engine:${p.providerId}`
      const apiKey = p.apiKeyEnv ? (process.env[p.apiKeyEnv] ?? '').trim() : ''
      const models: Record<string, unknown> = {}
      for (const m of p.models) {
        models[m.modelId] = {
          name: m.modelId, limit: { context: 1048576, output: 128000 },
          modalities: { input: ['text'], output: ['text'] },
          ...(m.reasoningLevels ? { reasoningLevels: m.reasoningLevels } : {}),
        }
      }
      engine.provider[key] = {
        name: `IDE · ${p.providerId}`, kind: 'anthropic',
        options: { baseURL: p.baseURL, ...(apiKey ? { apiKey } : {}) },
        enabled: apiKey !== '' || !p.apiKeyEnv, source: 'custom',
        ...(Object.keys(models).length ? { models } : {}),
      }
      keys.push(key)
    }
    const tmp = `${path}.tmp`
    writeFileSync(tmp, JSON.stringify(engine, null, 2), 'utf8')
    renameSync(tmp, path)
    return { wrote: true, providerKeys: keys, note: '已写穿 ~/.zcode/v2/config.json（ide-engine: 前缀）' }
  } catch (err) {
    return { wrote: false, providerKeys: [], note: `写穿失败：${err instanceof Error ? err.message.slice(0, 200) : String(err)}` }
  }
}

async function handleVideoFrames(ctx: Context): Promise<void> {
  const body = (ctx.request as { body?: Record<string, unknown> }).body ?? {}
  const videoPath = String(body.videoPath ?? '')
  const frames = Number(body.frames ?? 8)
  const widthPx = Number(body.widthPx ?? 1280)
  if (!videoPath || !Number.isFinite(frames) || frames <= 0 || frames > 32) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'videoPath 必填；frames 1-32' }
    return
  }
  if (!existsSync(videoPath)) {
    ctx.status = 404
    ctx.body = { ok: false, detail: '视频文件不存在' }
    return
  }
  try {
    const { extractFramesBase64 } = await import('../../videoref/frame-extract')
    const out = await extractFramesBase64(videoPath, { frames, widthPx })
    ctx.body = { ok: true, count: out.length, frames: out }
  } catch (err) {
    ctx.status = 422
    ctx.body = { ok: false, detail: err instanceof Error ? err.message.slice(0, 300) : String(err) }
  }
}
