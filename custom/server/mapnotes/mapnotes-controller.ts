/**
 * 业务地图标注 REST（/api/hermes/map-annotations/*，挂账清偿批二 C1 + 批三 D1 实时协同）。
 *
 * GET    /?key=            该需求指纹的标注清单
 * POST   /                 upsert 单节点标注（body {key,nodeId,note,checked,by?,rev?}）
 *                         ——LWW-Register：旧写被拒返回现存条目（applied:false 如实回显）
 * DELETE /?key=&nodeId=    删除单节点标注
 *
 * key=需求指纹（sha1 hex，impact 响应下发）；by 优先取鉴权身份（callerOf）。
 * 写操作成功即广播 mapnotes:changed（/mapnotes 房间——批三 D1 实时通道）。
 * 挂载：patches/698（bootstrap/routes.ts import+app.use，545 同款范式）。
 */
import Router from '@koa/router'
import { deleteAnnotation, listAnnotations, upsertAnnotation } from './mapnotes-store'
import { emitMapnotesEvent } from './mapnotes-socket'

const router = new Router({ prefix: '/api/hermes/map-annotations' })

function bad(ctx: { status: number; body: unknown }, msg: string): void {
  ctx.status = 400
  ctx.body = { ok: false, error: msg }
}

/** 鉴权身份优先（engine-controller callerOf 同源取法）；未启用鉴权回落 body.by。 */
function callerOf(ctx: { state?: unknown }): string | null {
  const user = (ctx.state as { user?: { username?: string } } | undefined)?.user
  return user?.username?.trim() || null
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
  const by = callerOf(ctx) ?? (typeof body.by === 'string' && body.by.trim() ? body.by.trim() : 'anonymous')
  const rev = typeof body.rev === 'number' && Number.isFinite(body.rev) && body.rev > 0 ? Math.floor(body.rev) : undefined
  try {
    const { annotation, applied } = upsertAnnotation(key, { nodeId, note: body.note, checked: body.checked, by, ...(rev ? { rev } : {}) })
    // 实时广播（applied 与否都广播——旧写被拒对其他端也是有效信号：本地态回正现存条目）
    emitMapnotesEvent({ kind: 'upsert', key, annotation, applied })
    ctx.body = { ok: true, applied, annotation }
  } catch (e) {
    bad(ctx, (e as Error).message)
  }
})

router.delete('/', (ctx) => {
  const key = typeof ctx.query.key === 'string' ? ctx.query.key : ''
  const nodeId = typeof ctx.query.nodeId === 'string' ? ctx.query.nodeId : ''
  if (!key || !nodeId) { bad(ctx, 'key 与 nodeId 必填'); return }
  const by = callerOf(ctx) ?? 'anonymous'
  try {
    const removed = deleteAnnotation(key, nodeId)
    if (removed) emitMapnotesEvent({ kind: 'delete', key, nodeId, by })
    ctx.body = { ok: true, removed }
  } catch (e) {
    bad(ctx, (e as Error).message)
  }
})

export const mapAnnotationsRoutes = router
