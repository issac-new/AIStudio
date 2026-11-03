// overlay/proactivity 域 REST（阿里技术《Personal Agent 落地思考》吸收轮 2026-10-26 + 挂账清偿批）：
// GET /api/hermes/proactivity/model（两轴模型只读+档位上限）、POST /assess（组合裁决）、
// GET|POST /alignment、PUT /alignment/:goalId/confirm、DELETE /alignment/:goalId（目标持续对齐台账）、
// GET/PUT/DELETE /policy(/:profile)（两轴执法策略——enforce-gate 第四级策略源，总闸
// HERMES_PROACTIVITY_ENFORCE=1 才生效）。变更发 govbus autonomy 域事件。
import Router from '@koa/router'

import { appendGovEvent } from '../govbus/event-log'
import { fail as httpFail, ok } from '../lib/http'
import {
  DEFAULT_ATTENTION_PREFS,
  calibrationOf,
  feedback as recordInterventionFeedback,
  listInterventions,
  prefsFile,
  readAttentionPrefs,
  scorecard as buildScorecardOf,
  syncInterventions,
  validateAttentionPrefs,
  writeAttentionPrefs,
} from './interventions-service'
import {
  ACTION_TIERS,
  ACTION_TIER_TITLES,
  PROBLEM_DEFINER_LEVELS,
  PROBLEM_DEFINER_TITLES,
  assess,
  failureCostTier,
  maxActionTierForLevel,
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
import {
  getPolicy,
  listPolicies,
  proactivityPolicyForProfile,
  removePolicy,
  upsertPolicy,
  validatePolicyInput,
  type ProactivityPolicyEntry,
} from './enforcement-policy'

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
    // 各横轴档位的纵轴上限（无契约/有契约）——呈现面直接渲染，不在客户端复算
    caps: PROBLEM_DEFINER_LEVELS.map((level) => ({
      level,
      noContract: maxActionTierForLevel(level),
      withContract: maxActionTierForLevel(level, { goalExplicit: true, acceptanceCriteria: true }),
    })),
    executionFace: 'enforce-gate 第四级策略源已接（HERMES_PROACTIVITY_ENFORCE=1 才执法，默认关）',
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

// ── 两轴执法策略（挂账清偿批 H4：enforce-gate 第四级策略源的配置面）────

function withResolved(entry: ProactivityPolicyEntry) {
  return { ...entry, resolved: proactivityPolicyForProfile(entry.profile) }
}

proactivityRouter.get('/policy', (ctx) => {
  ctx.body = { ok: true, entries: listPolicies().map(withResolved) }
})

proactivityRouter.put('/policy/:profile', (ctx) => {
  const body = bodyOf(ctx)
  const contract = body.contract as Record<string, unknown> | undefined
  const problems = validatePolicyInput({
    profile: ctx.params.profile,
    level: body.level,
    contract,
    goalId: body.goalId,
  })
  if (problems.length > 0) {
    ctx.status = 400
    ctx.body = { ok: false, problems }
    return
  }
  const c = contract as unknown as GoalContract
  const entry = upsertPolicy({
    profile: String(ctx.params.profile),
    level: body.level as ProblemDefinerLevel,
    ...(contract ? { contract: { goalExplicit: !!c.goalExplicit, acceptanceCriteria: !!c.acceptanceCriteria } } : {}),
    ...(typeof body.goalId === 'string' && body.goalId ? { goalId: body.goalId } : {}),
    ...(typeof body.note === 'string' ? { note: body.note } : {}),
    updatedBy: actorOf(ctx),
  })
  appendGovEvent({
    domain: 'autonomy',
    severity: 'info',
    type: 'proactivity.policy_upserted',
    source: 'proactivity/proactivity-controller',
    summary: `两轴策略配置：${entry.profile} → ${entry.level}${entry.contract ? '（有契约）' : ''}`,
    refs: { profile: entry.profile },
    payload: { level: entry.level, goalId: entry.goalId ?? null },
  })
  ctx.body = { ok: true, entry: withResolved(entry) }
})

proactivityRouter.delete('/policy/:profile', (ctx) => {
  const removed = removePolicy(ctx.params.profile)
  if (!removed) {
    ctx.status = 404
    ctx.body = { ok: false, detail: '无该 profile 的两轴策略' }
    return
  }
  appendGovEvent({
    domain: 'autonomy',
    severity: 'info',
    type: 'proactivity.policy_removed',
    source: 'proactivity/proactivity-controller',
    summary: `两轴策略移除：${ctx.params.profile}`,
    refs: { profile: ctx.params.profile },
  })
  ctx.body = { ok: true }
})

// ── 介入治理（2026-11-03 主动式 AI 综述吸收轮）────────────────────────
// 权限轴（上面两轴）决定「最多能做哪一步」；本组端点管注意力轴——何时以何形态递给人。
// 新端点一律走 lib/http 的 ok/fail（K19 只减不增）。

/** 写操作权限：与 workbench/harness 控制器同款收窄（有认证主体须超管）。 */
function denyWrite(ctx: { state: unknown; status: number; body: unknown }): boolean {
  const user = (ctx.state as { user?: { role?: string } } | undefined)?.user
  const multiUser = process.env.HERMES_MULTI_USER === '1'
  if (!user || !multiUser) return false
  if (user.role === 'super_admin' || user.role === 'admin') return false
  httpFail(ctx as never, 403, '需要管理员权限才能修改注意力偏好或提交介入反馈', { code: 'forbidden' })
  return true
}

proactivityRouter.get('/attention', (ctx) => {
  ok(ctx, { prefs: readAttentionPrefs(), defaults: DEFAULT_ATTENTION_PREFS, file: prefsFile() })
})

proactivityRouter.put('/attention', (ctx) => {
  if (denyWrite(ctx as never)) return
  const v = validateAttentionPrefs(bodyOf(ctx))
  if (!v.valid || !v.prefs) {
    httpFail(ctx, 400, '注意力偏好校验失败', { code: 'invalid_prefs', problems: v.problems })
    return
  }
  const saved = writeAttentionPrefs(v.prefs)
  appendGovEvent({
    domain: 'autonomy',
    severity: 'info',
    type: 'proactivity.attention_prefs_updated',
    source: 'proactivity/proactivity-controller',
    summary: `注意力偏好更新：日预算 ${saved.dailyBudget}／时预算 ${saved.hourlyBudget}／安静时段 ${saved.quietHours ? `${saved.quietHours.startHour}:00-${saved.quietHours.endHour}:00` : '关闭'}`,
    refs: { by: actorOf(ctx) ?? 'unknown' },
  })
  ok(ctx, { prefs: saved })
})

/** 从 delivery 建议同步干预：候选 → 治理裁决 → 落台账（幂等 6h）。 */
proactivityRouter.post('/interventions/sync', (ctx) => {
  if (denyWrite(ctx as never)) return
  const result = syncInterventions(Date.now(), actorOf(ctx))
  if (!result.available) {
    ok(ctx, { available: false, reason: result.reason ?? '数据源不可用', created: 0, skipped: 0, byDecision: {} })
    return
  }
  ok(ctx, { available: true, created: result.created, skipped: result.skipped, byDecision: result.byDecision, records: result.records })
})

proactivityRouter.get('/interventions', (ctx) => {
  const status = String(ctx.query.status ?? 'all')
  const limit = Math.max(1, Math.min(200, Number(ctx.query.limit ?? 30) || 30))
  ok(ctx, { interventions: listInterventions(status, limit) })
})

proactivityRouter.post('/interventions/:id/feedback', (ctx) => {
  if (denyWrite(ctx as never)) return
  const body = bodyOf(ctx)
  const r = recordInterventionFeedback({
    id: ctx.params.id,
    outcome: String(body.outcome ?? ''),
    ...(body.note ? { note: String(body.note) } : {}),
    ...(actorOf(ctx) ? { by: actorOf(ctx) as string } : {}),
  })
  if (!r.recorded) {
    httpFail(ctx, 400, '反馈校验失败', { code: 'invalid_feedback', problems: r.problems })
    return
  }
  appendGovEvent({
    domain: 'autonomy',
    severity: 'info',
    type: 'proactivity.intervention_feedback',
    source: 'proactivity/proactivity-controller',
    summary: `介入反馈：${ctx.params.id} → ${String(body.outcome ?? '')}`,
    refs: { intervention: ctx.params.id },
  })
  ok(ctx, { id: ctx.params.id, outcome: String(body.outcome ?? '') })
})

proactivityRouter.get('/scorecard', (ctx) => {
  const withEffect = Number(ctx.query.acceptedWithEffect ?? 0)
  ok(ctx, {
    scorecard: buildScorecardOf(Number.isFinite(withEffect) ? Math.max(0, Math.trunc(withEffect)) : 0),
    calibration: calibrationOf(),
  })
})
