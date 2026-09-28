/**
 * 人工审批收件箱 REST（/api/approvals/*）——P1 §二（2026-09-28 产品 UI 缺陷修复）。
 *
 * GET  /api/approvals/pending            待审聚合（fleet 命令审批 + 评审域未裁决）
 * POST /api/approvals/:id/decide         就地裁决（id 前缀路由到对应域，决策落历史）
 * GET  /api/approvals/history?limit=50   决策历史（时间+操作人+对象+结果）
 *
 * 数据源复用既有域（不另起炉灶）：
 *   - fleet 命令审批：services/hermes/fleet-tap（buildFleetSnapshotFromTap 的
 *     sessions[].approvals；decide 走 respondFleetApproval，与 /api/hermes/fleet/approval 同源）
 *   - 评审卡：review/review-store（verdict 未落的 ReviewRecord；decide 走 setVerdict，
 *     与 /api/review/:id/verdict 同源——approve/request_changes 自动落 evidence）
 * 决策历史：approvals/approval-log（append-only；actor 取 ctx.state.user.username，
 * 与 fleet/review 控制器同源取法，body 自报身份不可信）。
 *
 * 挂载：B 类 patch 488 在 bootstrap/routes.ts（与 477/482 同款两行）。
 */
import Router from '@koa/router'
import { buildFleetSnapshotFromTap, respondFleetApproval } from '../services/hermes/fleet-tap'
import { loadReview, setVerdict, listReviews } from '../review/review-store'
import { isReviewVerdict, type ReviewVerdict } from '../review/review-store'
import { appendApprovalLog, queryApprovalLog } from './approval-log'

const router = new Router({ prefix: '/api/approvals' })

export interface PendingItem {
  id: string
  kind: 'command' | 'review'
  title: string
  detail: string
  sessionId?: string
  profile?: string
  taskId?: string
  domain?: string
  baseRef?: string
  choices?: string[]
  createdAt: number
}

function actorOf(ctx: { state?: { user?: { username?: string } } }): string {
  return ctx.state?.user?.username ?? 'anonymous'
}

router.get('/pending', async (ctx) => {
  const items: PendingItem[] = []

  // fleet 命令审批（agent 工具调用等）
  try {
    const sessions = buildFleetSnapshotFromTap()
    for (const session of sessions ?? []) {
      for (const approval of session.approvals ?? []) {
        items.push({
          id: `fleet:${session.id}:${approval.approval_id}`,
          kind: 'command',
          title: session.title || session.id,
          detail: approval.preview || approval.approval_id,
          sessionId: session.id,
          profile: session.profile,
          choices: approval.choices,
          createdAt: session.lastActiveAt || 0,
        })
      }
    }
  } catch { /* fleet 源不可用（未装配）不阻断其余聚合 */ }

  // 评审域未裁决卡
  try {
    for (const rec of listReviews()) {
      if (rec.verdict) continue
      items.push({
        id: `review:${rec.reviewId}`,
        kind: 'review',
        title: rec.taskId ? `评审 · ${rec.taskId}` : `评审 · ${rec.reviewId}`,
        detail: rec.domain === 'baseline' ? `基线对照 ${rec.baseRef ?? ''}` : '未提交变更',
        taskId: rec.taskId,
        domain: rec.domain,
        baseRef: rec.baseRef,
        createdAt: rec.createdAt,
      })
    }
  } catch { /* review 源不可用不阻断 */ }

  items.sort((a, b) => b.createdAt - a.createdAt)
  ctx.body = { ok: true, items, ts: Date.now() }
})

const FLEET_CHOICES = new Set(['once', 'session', 'always', 'deny'])

router.post('/:id/decide', async (ctx) => {
  const body = (ctx.request.body ?? {}) as { decision?: unknown; note?: unknown; title?: unknown }
  const decision = String(body.decision ?? '')
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : undefined
  const actor = actorOf(ctx as never)
  const id = String(ctx.params.id ?? '')

  if (id.startsWith('fleet:')) {
    const rest = id.slice('fleet:'.length)
    const sep = rest.indexOf(':')
    if (sep <= 0 || !FLEET_CHOICES.has(decision)) {
      ctx.status = 400
      ctx.body = { ok: false, detail: 'fleet 决策须为 once|session|always|deny，id 形如 fleet:<sessionId>:<approvalId>' }
      return
    }
    const sessionId = rest.slice(0, sep)
    const approvalId = rest.slice(sep + 1)
    const result = await respondFleetApproval(approvalId, decision)
    if (!result.resolved) {
      ctx.status = 409
      ctx.body = result
      return
    }
    const entry = appendApprovalLog({
      id, actor, targetKind: 'command', targetId: approvalId,
      targetTitle: `${sessionId} · ${approvalId}`, decision, note,
    })
    ctx.body = { ok: true, entry }
    return
  }

  if (id.startsWith('kanban:')) {
    // 看板审批：状态迁移由看板 API 完成，这里只落历史（客户端先 decide 再 patch）
    const targetId = id.slice('kanban:'.length)
    if (!targetId || (decision !== 'approve' && decision !== 'request_changes')) {
      ctx.status = 400
      ctx.body = { ok: false, detail: 'kanban 决策须为 approve|request_changes，id 形如 kanban:<taskId>' }
      return
    }
    const entry = appendApprovalLog({
      id, actor, targetKind: 'kanban', targetId,
      targetTitle: typeof body.title === 'string' ? body.title.slice(0, 200) : (note || targetId),
      decision, note,
    })
    ctx.body = { ok: true, entry }
    return
  }

  if (id.startsWith('review:')) {
    const reviewId = id.slice('review:'.length)
    if (!isReviewVerdict(decision) || decision === 'comment') {
      ctx.status = 400
      ctx.body = { ok: false, detail: 'review 决策须为 approve|request_changes' }
      return
    }
    const rec = loadReview(reviewId)
    if (!rec) {
      ctx.status = 404
      ctx.body = { ok: false, detail: '评审不存在或已归档' }
      return
    }
    if (rec.verdict) {
      ctx.status = 409
      ctx.body = { ok: false, detail: '该评审已裁决（一次定音）' }
      return
    }
    const verdict = decision as ReviewVerdict
    const updated = setVerdict(reviewId, verdict, note, actor)
    const entry = appendApprovalLog({
      id, actor, targetKind: 'review', targetId: reviewId,
      targetTitle: rec.taskId || reviewId, decision: verdict, note,
    })
    ctx.body = { ok: true, review: updated, entry }
    return
  }

  ctx.status = 400
  ctx.body = { ok: false, detail: 'id 前缀须为 fleet: 或 review:' }
})

router.get('/history', async (ctx) => {
  const limit = Number(ctx.query.limit ?? 50)
  ctx.body = { ok: true, entries: queryApprovalLog(Number.isFinite(limit) ? limit : 50) }
})

export const approvalsRoutes = router
