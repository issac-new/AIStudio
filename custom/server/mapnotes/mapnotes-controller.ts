/**
 * 业务地图标注 REST（/api/hermes/map-annotations/*，挂账清偿批二 C1）。
 *
 * GET    /?key=            该需求指纹的标注清单
 * POST   /                 upsert 单节点标注（body {key,nodeId,note,checked,by}）
 * DELETE /?key=&nodeId=    删除单节点标注
 *
 * key=需求指纹（sha1 hex，impact 响应下发）；upsert 同 nodeId 覆盖=最后写胜出。
 * 挂载：patches/698（bootstrap/routes.ts import+app.use，545 同款范式）。
 */
import Router from '@koa/router'
import { deleteAnnotation, listAnnotations, upsertAnnotation } from './mapnotes-store'

const router = new Router({ prefix: '/api/hermes/map-annotations' })

function bad(ctx: { status: number; body: unknown }, msg: string): void {
  ctx.status = 400
  ctx.body = { ok: false, error: msg }
}

router.get('/', (ctx) => {
  const key = typeof ctx.query.key === 'string' ? ctx.query.key : ''
  if (!key) { bad(ctx, 'key 必填（需求指纹）'); return }
  try {
    ctx.body = { ok: true, key, annotations: listAnnotations(key) }
  } catch (e) {
    bad(ctx, (e as Error).message)
  }
})

router.post('/', (ctx) => {
  // bodyparser 增强类型不在编译集（typecheck:harness 白名单）——显式收窄
  const body = ((ctx.request as { body?: unknown }).body ?? {}) as Record<string, unknown>
  const key = typeof body.key === 'string' ? body.key.trim() : ''
  const nodeId = typeof body.nodeId === 'string' ? body.nodeId.trim() : ''
  if (!key || !nodeId) { bad(ctx, 'key 与 nodeId 必填'); return }
  if (typeof body.note !== 'string' || typeof body.checked !== 'boolean') { bad(ctx, 'note 须字符串、checked 须布尔'); return }
  try {
    const annotation = upsertAnnotation(key, {
      nodeId,
      note: body.note,
      checked: body.checked,
      by: typeof body.by === 'string' ? body.by : 'anonymous',
    })
    ctx.body = { ok: true, annotation }
  } catch (e) {
    bad(ctx, (e as Error).message)
  }
})

router.delete('/', (ctx) => {
  const key = typeof ctx.query.key === 'string' ? ctx.query.key : ''
  const nodeId = typeof ctx.query.nodeId === 'string' ? ctx.query.nodeId : ''
  if (!key || !nodeId) { bad(ctx, 'key 与 nodeId 必填'); return }
  try {
    const removed = deleteAnnotation(key, nodeId)
    ctx.body = { ok: true, removed }
  } catch (e) {
    bad(ctx, (e as Error).message)
  }
})

export const mapAnnotationsRoutes = router
