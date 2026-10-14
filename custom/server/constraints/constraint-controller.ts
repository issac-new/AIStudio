// overlay[constraints] 约束卡 REST（/api/constraints/*，2026-10-14 阿里调研轮 D）。
//
// GET    /api/constraints            列表（全量，含停用——维护面要看全账）
// POST   /api/constraints            建卡（校验失败 400）
// PATCH  /api/constraints/:id        改卡（含启停）
// DELETE /api/constraints/:id        删卡
// POST   /api/constraints/preview    预演：给定 column/specialist/title/body → 命中卡+简报行
import Router from '@koa/router'
import {
  createConstraintCard, deleteConstraintCard, listConstraintCards, updateConstraintCard,
} from './constraint-store'
import { constraintBriefLine, selectConstraintsPreview } from './constraint-inject'
import type { ConstraintCard, DispatchTarget } from './constraint-types'

const router = new Router({ prefix: '/api/constraints' })

function cardSummary(c: ConstraintCard) {
  return {
    id: c.id,
    statement: c.statement,
    scope: c.scope,
    sourceAnchor: c.sourceAnchor,
    effectiveRun: c.effectiveRun,
    enabled: c.enabled,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }
}

router.get('/', async (ctx) => {
  ctx.body = { ok: true, cards: listConstraintCards().map(cardSummary) }
})

router.post('/', async (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  try {
    const card = createConstraintCard(body as never)
    ctx.status = 201
    ctx.body = { ok: true, card: cardSummary(card) }
  } catch (e) {
    ctx.status = 400
    ctx.body = { ok: false, problems: [String((e as Error).message || e)] }
  }
})

router.patch('/:id', async (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  try {
    const card = updateConstraintCard(ctx.params.id, body as never)
    ctx.body = { ok: true, card: cardSummary(card) }
  } catch (e) {
    const msg = String((e as Error).message || e)
    ctx.status = msg.includes('不存在') ? 404 : 400
    ctx.body = { ok: false, problems: [msg] }
  }
})

router.delete('/:id', async (ctx) => {
  try {
    deleteConstraintCard(ctx.params.id)
    ctx.body = { ok: true }
  } catch (e) {
    const msg = String((e as Error).message || e)
    ctx.status = msg.includes('不存在') ? 404 : 400
    ctx.body = { ok: false, problems: [msg] }
  }
})

router.post('/preview', async (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const target: DispatchTarget & { title?: string; body?: string } = {
    column: typeof body.column === 'string' && body.column.trim() ? body.column.trim() : undefined,
    specialist: typeof body.specialist === 'string' && body.specialist.trim() ? body.specialist.trim() : undefined,
    stepId: typeof body.stepId === 'string' && body.stepId.trim() ? body.stepId.trim() : undefined,
    title: typeof body.title === 'string' ? body.title : undefined,
    body: typeof body.body === 'string' ? body.body : undefined,
  }
  const cards = selectConstraintsPreview(listConstraintCards(), target)
  ctx.body = {
    ok: true,
    target,
    cards: cards.map(cardSummary),
    briefLine: constraintBriefLine(cards),
  }
})

export { router as constraintsRoutes }
