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
    // ── R2：semantica 知识库状态（hermes agent 层配置，非 studio MCP 层）──
    if (method === 'GET' && path === '/api/ide/semantica-status') {
      await handleSemanticaStatus(ctx)
      return
    }
    // ── 遗留清单 L6：缓存 miss 归因（cc-switch.db 只读聚合）──
    if (method === 'GET' && path === '/api/ide/cache-attribution') {
      await handleCacheAttribution(ctx)
      return
    }
    // ── B7：自定义斜杠命令（zcode CommandsSection 对照）──
    if (method === 'GET' && path === '/api/ide/slash-commands') {
      await handleSlashCommandsGet(ctx)
      return
    }
    if (method === 'POST' && path === '/api/ide/slash-commands/save') {
      await handleSlashCommandsSave(ctx)
      return
    }
    await next()
  }
}

// B7 存储：runtime/ide-slash-commands.json（原子写；SLASH_COMMAND_STORE 守门注入）。
function slashCommandStorePath(): string {
  return process.env.SLASH_COMMAND_STORE?.trim()
    ? resolve(process.env.SLASH_COMMAND_STORE)
    // 层级勘误（2026-09-29 隔离走查实录）：controllers/ide 到 overlay 根需 4 级——
    // 3 级指向 custom/（无 runtime/，写盘 ENOENT 被错误链吞成 404；同根因即历史
    // 「PUT /api/ide/engine-models 真进程 404 学理未解」悬案病灶）。
    : resolve(__dirname, '../../../../runtime/ide-slash-commands.json')
}

async function handleSlashCommandsGet(ctx: Context): Promise<void> {
  const store = slashCommandStorePath()
  if (!existsSync(store)) {
    ctx.body = { ok: true, commands: [] }
    return
  }
  try {
    const raw = JSON.parse(readFileSync(store, 'utf8')) as { commands?: unknown }
    const { normalizeSlashCommands } = await import('../../slashcmd/slash-commands')
    ctx.body = { ok: true, commands: normalizeSlashCommands(raw.commands) }
  } catch {
    ctx.body = { ok: true, commands: [] }
  }
}

async function handleSlashCommandsSave(ctx: Context): Promise<void> {
  const { validateSlashCommands, normalizeSlashCommands } = await import('../../slashcmd/slash-commands')
  const body = (ctx.request as { body?: Record<string, unknown> }).body ?? {}
  const commands = normalizeSlashCommands(body.commands)
  const problems = validateSlashCommands(commands)
  if (problems.length) {
    ctx.status = 400
    ctx.body = { ok: false, problems }
    return
  }
  const store = slashCommandStorePath()
  const tmp = `${store}.tmp`
  writeFileSync(tmp, JSON.stringify({ commands }, null, 2), 'utf8')
  renameSync(tmp, store)
  ctx.body = { ok: true, commands }
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
  const store = resolve(__dirname, '../../../../runtime/ide-engine-models.json')
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

// ── 缓存 miss 归因（L6，cc 语义）：cc-switch.db 只读（proxy_request_logs，
// 28 万行真实缓存字段——cache_read/creation_tokens）；聚合窗口近 200 条请求的
// 命中率+按 (model) 断档归因（模型切换=缓存跨模型不共享）+建议。
async function handleCacheAttribution(ctx: Context): Promise<void> {
  const { DatabaseSync } = await import('node:sqlite')
  const { join } = await import('path')
  const { homedir } = await import('os')
  const dbPath = join(homedir(), '.cc-switch', 'cc-switch.db')
  let db: import('node:sqlite').DatabaseSync | null = null
  try {
    db = new DatabaseSync(dbPath, { readOnly: true })
    const rows = db.prepare(
      'SELECT model, input_tokens, cache_read_tokens, cache_creation_tokens FROM proxy_request_logs ORDER BY created_at DESC LIMIT 200',
    ).all() as Array<{ model: string; input_tokens: number; cache_read_tokens: number; cache_creation_tokens: number }>
    db.close(); db = null
    const { attributeCacheMiss } = await import('../../cacheattr/cache-attribution')
    let input = 0, cacheRead = 0, cacheCreate = 0
    const models = new Set<string>()
    for (const r of rows) {
      input += Number(r.input_tokens ?? 0)
      cacheRead += Number(r.cache_read_tokens ?? 0)
      cacheCreate += Number(r.cache_creation_tokens ?? 0)
      models.add(String(r.model ?? ''))
    }
    const denom = input + cacheRead || 1
    const hitRate = cacheRead / denom
    // 归因启发式：窗口内多模型混用=model-switched；余 unknown（上下文差异面在引擎侧）。
    const causes = models.size > 1 ? ['model-switched' as const] : ['unknown' as const]
    const attribution = attributeCacheMiss({ hitRate, causes })
    ctx.body = {
      ok: true,
      window: rows.length,
      hitRate: Math.round(hitRate * 1000) / 10,
      cacheReadTokens: cacheRead,
      cacheCreationTokens: cacheCreate,
      inputTokens: input,
      models: [...models].slice(0, 6),
      attribution,
    }
  } catch (err) {
    try { db?.close() } catch { /* 已闭 */ }
    ctx.status = 503
    ctx.body = { ok: false, detail: err instanceof Error ? err.message.slice(0, 200) : String(err) }
  }
}

// ── semantica 状态（R2）：配置于 ~/.hermes/config.yaml mcp_servers.semantica——
// 装载在 agent 会话启动时（studio MCP 面板列的是另一层，判不到它）。
async function handleSemanticaStatus(ctx: Context): Promise<void> {
  const { readFileSync } = await import('fs')
  const { join } = await import('path')
  const { homedir } = await import('os')
  try {
    const cfg = readFileSync(join(homedir(), '.hermes', 'config.yaml'), 'utf8')
    const configured = /mcp_servers:[\s\S]*?\n\s{2,}semantica:/.test(cfg)
    const kgPath = cfg.match(/SEMANTICA_KG_PATH:\s*(\S+)/)?.[1] ?? null
    const venvOk = existsSync(join(homedir(), '.hermes', 'hermes-agent', 'venv', 'lib'))
    ctx.body = { ok: true, configured, kgPath, venvOk, note: configured ? '工具在 agent 会话启动时装载（15 只知识工具）' : '未配置（hermes mcp install semantica）' }
  } catch (err) {
    ctx.status = 503
    ctx.body = { ok: false, detail: err instanceof Error ? err.message.slice(0, 200) : String(err) }
  }
}
