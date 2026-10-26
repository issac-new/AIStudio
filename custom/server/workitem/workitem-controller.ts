/**
 * 工作项全景串联 REST（/api/hermes/workitem/*，JoyAI 闭环吸收轮 P4）。
 *
 * GET /:taskId/panorama   全链路八面汇聚（卡片/事件/证据/评测/评审/计划/图运行/trace）
 *
 * 纯读侧投影，无任何写入面；每面独立 fail-soft（available:false 不猜数）。
 * 挂载：patches/ 追加 bootstrap/routes.ts（import + app.use，patch 590 同款范式）。
 */
import Router from '@koa/router'
import { buildPanorama } from './panorama'

const router = new Router({ prefix: '/api/hermes/workitem' })

router.get('/:taskId/panorama', async (ctx) => {
  const taskId = ctx.params.taskId?.trim() ?? ''
  if (!taskId || taskId.length > 128) {
    ctx.status = 400
    ctx.body = { ok: false, error: 'taskId 非法（非空且 ≤128 字符）' }
    return
  }
  try {
    const panorama = await buildPanorama(taskId)
    ctx.body = { ok: true, panorama }
  } catch (e) {
    // 聚合器内部各面已 fail-soft；此处兜底的是未预期异常（如实 500 不吞）
    ctx.status = 500
    ctx.body = { ok: false, error: `全景汇聚失败：${(e as Error).message}` }
  }
})

export const workitemRoutes = router
