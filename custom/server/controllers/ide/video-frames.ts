/**
 * IDE 视频抽帧 REST（层 2 消费面；videoref 域）。独立文件（append 到既有
 * controller 的路由在真进程不生效——见 compaction-trace 独立文件模式）。
 * POST /api/ide/video-frames { videoPath, frames, widthPx }
 */
import Router from '@koa/router'

const router = new Router({ prefix: '/api/ide' })

router.post('/video-frames', async (ctx) => {
  const body = (ctx.request as { body?: Record<string, unknown> }).body ?? {}
  const videoPath = String(body.videoPath ?? '')
  const frames = Number(body.frames ?? 8)
  const widthPx = Number(body.widthPx ?? 1280)
  if (!videoPath || !Number.isFinite(frames) || frames <= 0 || frames > 32) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'videoPath 必填；frames 1-32' }
    return
  }
  const { existsSync: exists } = await import('fs')
  if (!exists(videoPath)) {
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
})

export default router


// PUT /api/ide/engine-models 在真进程 404（学理未解，见 native-routes.ts 头注）——
// 提供等价 POST 变体（POST 面实证稳定）：body 同 PUT，行为=校验+落盘+引擎写穿。
router.post('/engine-models-put', async (ctx) => {
  const { validateEngineModelConfig } = await import('../../enginemodels/engine-model-config')
  const body = (ctx.request as { body?: Record<string, unknown> }).body ?? {}
  const config = {
    providers: Array.isArray(body.providers) ? (body.providers as never[]) : [],
    defaultModel: (body.defaultModel as never) ?? null,
    // P3 档位映射透传（24h 审查补）：客户端已发 route，此处重建 config 漏抄会在
    // 每次保存时静默蒸发档位映射——对话框重开即空、switcher 永远走回落链
    route: (body.route && typeof body.route === 'object' ? body.route : undefined) as never,
  } as never
  const validation = validateEngineModelConfig(config)
  if (!validation.ok) {
    ctx.status = 400
    ctx.body = { ok: false, problems: validation.problems }
    return
  }
  const { writeThroughToEngine } = await import('./engine-models')
  const passthrough = writeThroughToEngine(config)
  ctx.body = { ok: true, config, enginePassthrough: passthrough }
})
