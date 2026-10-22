// custom/server/kanban/owner-routed-nudge.ts
// 催办目标跟随卡 owner 动态路由（run21+run22 两轮立案复现，2026-10-22 产品化①）。
//
// 两轮实锤：催办/提醒发往固定接收方（等待谓词参数定死的复测侧、或组织者），
// 而球实际在缺陷卡 owner 名下——run21「三连误催复测侧而修复者在 hu」、
// run22「G5 退回单只达组织者 fanfan，缺项 owner（qi/hu/xiao）未接活各空转
// 40-93 分钟」。根因共性：提醒路由与卡面归属脱钩。
//
// 本模块把「找对人」产品化为单一解析点：resolveNudgeTarget(cards, cardId)——
// 按卡 id 解析当前 assignee 为催办目标；assignee 空置时按板 team 回落；两落
// 皆空返回显式 unassigned（可见失败，绝不静默改投固定接收方——错侧催办比
// 不催更糟）。纯函数（决策可测）+ koa 端点（注入卡源读函数，IO 可换）。
import Router from '@koa/router'

export interface NudgeCardLike {
  id: string
  assignee?: string | null
  title?: string
  board?: string
  boardTeam?: string | null   // 板的 team agent（围栏归属），解析回落第二优先
}

export type NudgeTarget =
  | { found: false; reason: 'card-not-found' }
  | { found: true; route: 'assignee'; target: string; cardId: string; title?: string }
  | { found: true; route: 'board-team'; target: string; cardId: string; title?: string; note: 'assignee 空置——回落板 team（派单断环可见性：建卡未认领）' }
  | { found: true; route: 'unassigned'; target: ''; cardId: string; title?: string; note: 'assignee 与板 team 双空——显式无人态，勿改投固定接收方（run21/22 错侧催办实录）' }

/** 纯函数：催办路由决策（单一解析点，测试面）。 */
export function resolveNudgeTarget(cards: NudgeCardLike[], cardId: string): NudgeTarget {
  const card = cards.find(c => c.id === cardId)
  if (!card) return { found: false, reason: 'card-not-found' }
  const assignee = (card.assignee ?? '').trim()
  if (assignee) return { found: true, route: 'assignee', target: assignee, cardId, title: card.title }
  const team = (card.boardTeam ?? '').trim()
  if (team) return { found: true, route: 'board-team', target: team, cardId, title: card.title, note: 'assignee 空置——回落板 team（派单断环可见性：建卡未认领）' }
  return { found: true, route: 'unassigned', target: '', cardId, title: card.title, note: 'assignee 与板 team 双空——显式无人态，勿改投固定接收方（run21/22 错侧催办实录）' }
}

export const nudgeRouter = new Router({ prefix: '/api/kanban/nudge' })

/** 卡源注入（控制器装配点可换 DB 直读；缺省无源=503 显式不可用，不猜）。
 *  2026-10-22 P0 接线批：允许返回 Promise——装配点（bootstrap patch 676）经
 *  command-post 看板聚合异步取卡；同步注入方不受影响。 */
type NudgeCardProvider = () => NudgeCardLike[] | Promise<NudgeCardLike[] | null> | null
let cardProvider: NudgeCardProvider | null = null
export function setNudgeCardProvider(fn: NudgeCardProvider | null) {
  cardProvider = fn
}

nudgeRouter.post('/route', async ctx => {
  const cardId = String(((ctx.request.body ?? {}) as Record<string, unknown>).cardId ?? '').trim()
  if (!cardId) { ctx.status = 400; ctx.body = { ok: false, detail: 'cardId 必填' }; return }
  const cards = cardProvider ? await cardProvider() : null
  if (!cards) { ctx.status = 503; ctx.body = { ok: false, detail: '卡源未接线（setNudgeCardProvider）' }; return }
  const decision = resolveNudgeTarget(cards, cardId)
  if (!decision.found) { ctx.status = 404; ctx.body = { ok: false, detail: '卡不存在', cardId }; return }
  ctx.body = { ok: true, decision, ts: Date.now() }
})
