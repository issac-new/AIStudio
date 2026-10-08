// overlay/custom/server/autonomyladder/autonomy-ladder-controller.ts
// 自治阶梯 REST（六文调研轮 H2）：GET/PUT/DELETE /api/hermes/autonomy-ladder。
// 配置变更发 govbus autonomy 域事件（审计面）；执行面拦截是 H3 单独轮，此处只有配置。
import Router from '@koa/router'
import { getLadder, listLadder, removeLadder, upsertLadder, validateLadderInput, type AutonomyLadderEntry } from './autonomy-ladder'
import { appendGovEvent } from '../govbus/event-log'

export const autonomyLadderRoutes = new Router({ prefix: '/api/hermes/autonomy-ladder' })

autonomyLadderRoutes.get('/', (ctx) => {
  ctx.body = { ok: true, entries: listLadder() }
})

autonomyLadderRoutes.get('/:target', (ctx) => {
  const entry = getLadder(ctx.params.target)
  if (!entry) {
    ctx.status = 404
    ctx.body = { ok: false, detail: '无该 target 的自治阶梯配置' }
    return
  }
  ctx.body = { ok: true, entry }
})

function actorOf(ctx: { state: unknown }): string | undefined {
  const user = (ctx.state as { user?: { id?: number | string; username?: string } } | undefined)?.user
  if (!user) return undefined
  return user.username ?? (user.id !== undefined ? String(user.id) : undefined)
}

autonomyLadderRoutes.put('/:target', (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const input = {
    target: ctx.params.target,
    level: body.level,
    approvalPoints: body.approvalPoints,
    maxRiskTier: body.maxRiskTier,
    note: typeof body.note === 'string' ? body.note : undefined,
  }
  const problems = validateLadderInput(input)
  if (problems.length > 0) {
    ctx.status = 400
    ctx.body = { ok: false, problems }
    return
  }
  // validateLadderInput 已过 → 收窄到域类型（校验与类型双闸）
  const entry = upsertLadder({
    target: input.target,
    level: input.level as AutonomyLadderEntry['level'],
    approvalPoints: Array.isArray(input.approvalPoints) ? input.approvalPoints as string[] : [],
    maxRiskTier: input.maxRiskTier as AutonomyLadderEntry['maxRiskTier'],
    note: input.note,
    updatedBy: actorOf(ctx),
  })
  appendGovEvent({
    domain: 'autonomy',
    severity: input.level === 'auto' ? 'warn' : 'info',
    type: `autonomy.ladder_${input.level}`,
    source: 'autonomyladder/autonomy-ladder-controller',
    summary: `自治阶梯配置：${entry.target} → ${input.level}${input.level === 'auto' ? '（端到端档，须确认边界已就绪——执行面 H3 未接，当前仅配置呈现）' : ''}`,
    refs: { target: entry.target },
    payload: { level: input.level, approvalPoints: entry.approvalPoints.length, maxRiskTier: entry.maxRiskTier },
  })
  ctx.body = { ok: true, entry }
})

autonomyLadderRoutes.delete('/:target', (ctx) => {
  const removed = removeLadder(ctx.params.target)
  if (!removed) {
    ctx.status = 404
    ctx.body = { ok: false, detail: '无该 target 的自治阶梯配置' }
    return
  }
  appendGovEvent({
    domain: 'autonomy', severity: 'info', type: 'autonomy.ladder_removed',
    source: 'autonomyladder/autonomy-ladder-controller',
    summary: `自治阶梯配置移除：${ctx.params.target}`,
    refs: { target: ctx.params.target },
  })
  ctx.body = { ok: true }
})
