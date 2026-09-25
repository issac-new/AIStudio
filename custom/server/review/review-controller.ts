/**
 * /review 评审域 REST（/api/review/*）——codex-product §五 P0-1 吸收（矩阵 §3.8 P0）。
 *
 * POST /api/review                     开评审（reviewId 幂等；domain 基线/uncommitted 两域）
 * POST /api/review/:id/comments        行内评论（file:line+body；commentId 幂等）
 * POST /api/review/:id/comments/:cid/resolve  评论回流收口（open→resolved）
 * POST /api/review/:id/verdict          三裁决（approve/request_changes/comment，一次定音）
 *                                      —— approve/request_changes 自动落 evidence verification 证据
 * GET  /api/review/:id                  评审查询
 *
 * 归属（已知边界，勿当无漏）：单租户信任模型——任意登录用户凭 reviewId 可读写任意评审，
 * 写入只记 actor 痕。多租户任务归属待接（同 evidence-store）。
 *
 * 挂载：B 类 patch 414 在 bootstrap/routes.ts。
 */
import Router from '@koa/router'
import type { Context } from 'koa'
import {
  addComment, isReviewVerdict, loadReview, openReview, resolveComment, setVerdict,
  type InlineComment, type ReviewVerdict,
} from './review-store'

const router = new Router({ prefix: '/api/review' })

/** 写入者：上游 requireUserJwt 写入 ctx.state.user；未启用鉴权的部署为 undefined（留空不伪造）。 */
function actorOf(ctx: Context): string | undefined {
  const user = (ctx.state as { user?: { id?: number | string; username?: string } } | undefined)?.user
  if (!user) return undefined
  return user.username ?? (user.id !== undefined ? String(user.id) : undefined)
}

/** 行内评论 file 归一（S-F）：项目相对路径；拒绝对路径/'..' 段/控制字符（路径穿越、盘符、
 *  不可见字符）；超 200 字符截断（与 evidence ref 同上限，评论定位符只作导航展示）。 */
function normalizeCommentFile(file: string): string | null {
  for (const ch of file) {
    const code = ch.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) return null
  }
  const norm = file.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^(?:\.\/)+/, '')
  if (!norm || norm.startsWith('/') || /^[A-Za-z]:/.test(norm)) return null
  if (norm.split('/').some((seg) => seg === '..')) return null
  const cps = [...norm]
  return cps.length <= 200 ? norm : cps.slice(0, 200).join('')
}

router.post('/', async (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const { reviewId, domain, taskId, baseRef, headRef } = body
  if (typeof reviewId !== 'string' || !reviewId) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'reviewId 必填' }
    return
  }
  if (domain !== 'baseline' && domain !== 'uncommitted') {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'domain 须为 baseline/uncommitted（codex-product 两域）' }
    return
  }
  const actor = actorOf(ctx)
  const rec = openReview({
    reviewId, domain,
    taskId: typeof taskId === 'string' ? taskId : undefined,
    baseRef: typeof baseRef === 'string' ? baseRef : undefined,
    headRef: typeof headRef === 'string' ? headRef : undefined,
    ...(actor ? { actor } : {}),
  })
  ctx.body = { ok: true, review: rec }
})

router.post('/:id/comments', async (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const { commentId, file, line, body: text } = body
  if (typeof commentId !== 'string' || !commentId || typeof file !== 'string' || !file
      || typeof line !== 'number' || !Number.isInteger(line) || line < 1 || typeof text !== 'string' || !text) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'commentId/file/line/body 必填（line 正整数）' }
    return
  }
  const normalized = normalizeCommentFile(file)
  if (!normalized) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'file 须为项目相对路径（拒绝对路径/.. 段/控制字符）' }
    return
  }
  const actor = actorOf(ctx)
  const c: InlineComment = {
    commentId, file: normalized, line, body: text, at: Date.now(), state: 'open',
    ...(actor ? { actor } : {}),
  }
  const result = addComment(ctx.params.id, c)
  if ('error' in result) {
    ctx.status = result.error.includes('不存在') ? 404 : 409
    ctx.body = { ok: false, detail: result.error }
    return
  }
  ctx.body = { ok: true, review: result }
})

router.post('/:id/comments/:cid/resolve', async (ctx) => {
  const result = resolveComment(ctx.params.id, ctx.params.cid)
  if ('error' in result) {
    ctx.status = 404
    ctx.body = { ok: false, detail: result.error }
    return
  }
  ctx.body = { ok: true, review: result }
})

router.post('/:id/verdict', async (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const verdict = body.verdict
  if (!isReviewVerdict(verdict)) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'verdict 须为 approve/request_changes/comment' }
    return
  }
  const result = setVerdict(
    ctx.params.id, verdict as ReviewVerdict,
    typeof body.note === 'string' ? body.note : undefined,
    actorOf(ctx),
  )
  if ('error' in result) {
    ctx.status = result.error.includes('不存在') ? 404 : 409
    ctx.body = { ok: false, detail: result.error }
    return
  }
  // 联动 evidence 已下沉 store.setVerdict（单一事实源），此处不再重复。
  ctx.body = { ok: true, review: result }
})

router.get('/:id', async (ctx) => {
  const rec = loadReview(ctx.params.id)
  if (!rec) {
    ctx.status = 404
    ctx.body = { ok: false, detail: '评审不存在' }
    return
  }
  ctx.body = { ok: true, review: rec }
})

export const reviewRoutes = router
