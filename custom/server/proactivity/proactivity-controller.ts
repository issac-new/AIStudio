// overlay/proactivity 域 REST（阿里技术《Personal Agent 落地思考》吸收轮 2026-10-26）：
// GET /api/hermes/proactivity/model（两轴模型只读）、POST /assess（组合裁决）、
// GET|POST /alignment、PUT /alignment/:goalId/confirm、DELETE /alignment/:goalId（目标持续对齐台账）。
// 定位=判定面+台账（诚实边界：enforce-gate 执行面接线见 spec 挂账 H4，本域不假装能拦）。
// 变更发 govbus autonomy 域事件（对齐 autonomyladder 审计面先例）。
import Router from '@koa/router'

import { appendGovEvent } from '../govbus/event-log'
import {
  ACTION_TIERS,
  ACTION_TIER_TITLES,
  PROBLEM_DEFINER_LEVELS,
  PROBLEM_DEFINER_TITLES,
  assess,
  failureCostTier,
  upgradeAdvice,
  type ActionTier,
  type FailureCostFacts,
  type GoalContract,
  type ImpactScope,
  type ProblemDefinerLevel,
} from './proactivity-model'
import {
  DEFAULT_ALIGNMENT_POLICY,
  alignmentStatus,
  confirmAlignment,
  getAlignment,
  listAlignments,
  removeAlignment,
  upsertAlignment,
  validateGoalInput,
  type GoalAlignmentEntry,
} from './goal-alignment'

export const proactivityRouter = new Router({ prefix: '/api/hermes/proactivity' })

const IMPACT_SCOPES: readonly ImpactScope[] = ['self', 'team', 'external']

function actorOf(ctx: { state: unknown }): string | undefined {
  const user = (ctx.state as { user?: { id?: number | string; username?: string } } | undefined)?.user
  if (!user) return undefined
  return user.username ?? (user.id !== undefined ? String(user.id) : undefined)
}

/** 读请求体（typecheck:harness 无 bodyparser 类型面——review/secaudit 同款收窄）。 */
function bodyOf(ctx: { request: unknown }): Record<string, unknown> {
  return ((ctx.request as { body?: unknown }).body ?? {}) as Record<string, unknown>
}

proactivityRouter.get('/model', (ctx) => {
  ctx.body = {
    ok: true,
    axes: {
      problemDefiner: PROBLEM_DEFINER_LEVELS.map((level) => ({ level, ...PROBLEM_DEFINER_TITLES[level] })),
      actionTier: ACTION_TIERS.map((tier) => ({ tier, title: ACTION_TIER_TITLES[tier] })),
    },
    rules: [
      'L5 恒只告知：目标猜错则差距/问题/任务全链跟错（文章 §6.2）',
      'L4 无契约上限起草、有契约（目标明确+验收规则）放开——均逐子任务受失败代价约束（§4.1/§6.3）',
      '失败代价：low=可撤回∧仅本人∧可验证不降档；medium 上限可逆执行；high 上限起草（§5）',
      '目标漂移防线：L4 目标 stale/never-confirmed 一律压回起草，契约不豁免（§2.2③/§6.1）',
    ],
    alignmentPolicy: DEFAULT_ALIGNMENT_POLICY,
    executionFace: 'advisory-only（判定面；enforce-gate 接线挂账 H4）',
  }
})

proactivityRouter.post('/assess', (ctx) => {
  const body = bodyOf(ctx)
  const problems: string[] = []

  if (typeof body.level !== 'string' || !(PROBLEM_DEFINER_LEVELS as readonly string[]).includes(body.level)) {
    problems.push(`level 须为 ${PROBLEM_DEFINER_LEVELS.join('/')}`)
  }
  if (typeof body.action !== 'string' || !(ACTION_TIERS as readonly string[]).includes(body.action)) {
    problems.push(`action 须为 ${ACTION_TIERS.join('/')}`)
  }

  let contract: GoalContract | undefined
  if (body.contract !== undefined) {
    const raw = body.contract as Record<string, unknown>
    if (typeof raw.goalExplicit !== 'boolean' || typeof raw.acceptanceCriteria !== 'boolean') {
      problems.push('contract 须含布尔 goalExplicit 与 acceptanceCriteria')
    } else {
      contract = { goalExplicit: raw.goalExplicit, acceptanceCriteria: raw.acceptanceCriteria }
    }
  }

  let failureCost: FailureCostFacts | undefined
  if (body.failureCost !== undefined) {
    const raw = body.failureCost as Record<string, unknown>
    if (typeof raw.reversible !== 'boolean') problems.push('failureCost.reversible 须为布尔')
    if (typeof raw.verifiable !== 'boolean') problems.push('failureCost.verifiable 须为布尔')
    if (typeof raw.impactScope !== 'string' || !(IMPACT_SCOPES as readonly string[]).includes(raw.impactScope)) {
      problems.push(`failureCost.impactScope 须为 ${IMPACT_SCOPES.join('/')}`)
    }
    if (problems.length === 0) {
      failureCost = {
        reversible: raw.reversible as boolean,
        verifiable: raw.verifiable as boolean,
        impactScope: raw.impactScope as ImpactScope,
      }
    }
  }

  if (problems.length > 0) {
    ctx.status = 400
    ctx.body = { ok: false, problems }
    return
  }

  const level = body.level as ProblemDefinerLevel
  const action = body.action as ActionTier

  // goalId 给了就顺带读对齐状态（台账缺该目标=不约束，如实回 null——fail-soft 不猜数）
  let goalStatus: ReturnType<typeof alignmentStatus> | null = null
  if (typeof body.goalId === 'string' && body.goalId) {
    const entry = getAlignment(body.goalId)
    goalStatus = entry ? alignmentStatus(entry) : null
  }

  const assessment = assess({
    level,
    action,
    contract,
    failureCost,
    goalStatus: goalStatus?.status,
  })

  ctx.body = {
    ok: true,
    assessment,
    upgrade: upgradeAdvice(level, contract),
    failureCostTier: failureCost ? failureCostTier(failureCost) : null,
    goalStatus,
  }
})

function withStatus(entry: GoalAlignmentEntry) {
  return { ...entry, status: alignmentStatus(entry) }
}

proactivityRouter.get('/alignment', (ctx) => {
  ctx.body = { ok: true, entries: listAlignments().map(withStatus) }
})

proactivityRouter.post('/alignment', (ctx) => {
  const body = bodyOf(ctx)
  const problems = validateGoalInput({ goalId: body.goalId, goalSummary: body.goalSummary })
  if (problems.length > 0) {
    ctx.status = 400
    ctx.body = { ok: false, problems }
    return
  }
  const entry = upsertAlignment({
    goalId: String(body.goalId),
    goalSummary: String(body.goalSummary),
  })
  appendGovEvent({
    domain: 'autonomy',
    severity: 'info',
    type: 'proactivity.goal_upserted',
    source: 'proactivity/proactivity-controller',
    summary: `长期目标登记：${entry.goalId}（${entry.goalSummary.slice(0, 60)}）`,
    refs: { goalId: entry.goalId },
  })
  ctx.body = { ok: true, entry: withStatus(entry) }
})

proactivityRouter.put('/alignment/:goalId/confirm', (ctx) => {
  const body = bodyOf(ctx)
  const entry = confirmAlignment(ctx.params.goalId, {
    by: actorOf(ctx),
    note: typeof body.note === 'string' ? body.note : undefined,
  })
  if (!entry) {
    ctx.status = 404
    ctx.body = { ok: false, detail: '无该 goalId 的目标对齐记录' }
    return
  }
  appendGovEvent({
    domain: 'autonomy',
    severity: 'info',
    type: 'proactivity.goal_confirmed',
    source: 'proactivity/proactivity-controller',
    summary: `目标重新确认：${entry.goalId}（第 ${entry.confirmations.length} 次）`,
    refs: { goalId: entry.goalId },
  })
  ctx.body = { ok: true, entry: withStatus(entry) }
})

proactivityRouter.delete('/alignment/:goalId', (ctx) => {
  const removed = removeAlignment(ctx.params.goalId)
  if (!removed) {
    ctx.status = 404
    ctx.body = { ok: false, detail: '无该 goalId 的目标对齐记录' }
    return
  }
  appendGovEvent({
    domain: 'autonomy',
    severity: 'info',
    type: 'proactivity.goal_removed',
    source: 'proactivity/proactivity-controller',
    summary: `长期目标移除：${ctx.params.goalId}`,
    refs: { goalId: ctx.params.goalId },
  })
  ctx.body = { ok: true }
})
