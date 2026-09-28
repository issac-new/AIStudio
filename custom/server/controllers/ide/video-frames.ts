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
