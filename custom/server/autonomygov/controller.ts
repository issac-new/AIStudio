// overlay/custom/server/autonomygov/controller.ts
// 自治刻度与责任边界 REST（A 组 + 薄项）。挂载 /api/autonomygov（补丁 751）。
//
// 响应形状一律走 lib/http 的 ok/fail/bodyOf（K19 单一写法；新模块不得裸写 ctx.body）。
// 判定全在 rules.ts / dualsign.ts 纯函数；跨域读数（户口缺口、决策阶段比例）走既有域
// 只读出口，不在此重算。执行面拦截在 qgate 门，本层不阻断审批。
import Router from '@koa/router'
import type { Context } from 'koa'
import { appendGovEvent } from '../govbus/event-log'
import { bodyOf, fail, ok } from '../lib/http'
import { listRosterGaps } from '../agentidentity/agent-identity'
import { listDecisions } from '../decisiongraph/semantica-client'
import { stageRatios } from '../decisiongraph/stage-ratios'
import { assess, ratioReport, tierFromAl, validateEntryInput } from './rules'
import { dualSignSatisfied, highRiskOptions } from './dualsign'
import {
  getScale, listDualSignGaps, listScale, recordDualSignGap, removeScale, upsertScale,
} from './store'
import type { AutonomyLevel, AutonomyScaleEntry, Dod } from './types'

export const autonomyGovRoutes = new Router({ prefix: '/api/autonomygov' })

function actorOf(ctx: Context): string | undefined {
  const user = (ctx.state as { user?: { id?: number | string; username?: string } } | undefined)?.user
  if (!user) return undefined
  return user.username ?? (user.id !== undefined ? String(user.id) : undefined)
}

/** 列表 + 判定（页签主数据源）。 */
autonomyGovRoutes.get('/scale', (ctx) => {
  ok(ctx, { entries: listScale().map((e) => ({ ...e, assessment: assess(e) })) })
})

autonomyGovRoutes.get('/scale/:target', (ctx) => {
  const entry = getScale(ctx.params.target)
  if (!entry) {
    fail(ctx, 404, '无该 target 的自治配置', { code: 'not-found' })
    return
  }
  ok(ctx, { entry, assessment: assess(entry) })
})

autonomyGovRoutes.put('/scale/:target', (ctx) => {
  const body = bodyOf(ctx)
  const input = {
    target: ctx.params.target,
    al: body.al,
    dod: body.dod,
    auditSampling: body.auditSampling,
    humanScan: body.humanScan,
    note: body.note,
  }
  const problems = validateEntryInput(input)
  if (problems.length > 0) {
    fail(ctx, 400, '自治配置校验未通过', { code: 'invalid-input', problems })
    return
  }

  const candidate: AutonomyScaleEntry = {
    target: ctx.params.target,
    al: input.al as AutonomyLevel,
    dod: input.dod as Dod,
    auditSampling: (input.auditSampling as number | undefined) ?? 0,
    humanScan: (input.humanScan as boolean | undefined) ?? false,
    reviewedAt: Date.now(),
  }
  const verdict = assess(candidate)
  // blocked 不落盘：缺 60 分线或 AL5 条件不成立时不允许存进台账，
  // 否则台账会积压一批「看起来已配置、实际不成立」的条目。
  if (verdict.verdict === 'blocked') {
    fail(ctx, 409, '自治配置不成立', {
      code: 'blocked',
      problems: verdict.findings.filter((f) => f.verdict === 'blocked').map((f) => f.detail),
      extra: { assessment: verdict },
    })
    return
  }

  const entry = upsertScale({
    target: ctx.params.target,
    al: candidate.al,
    dod: candidate.dod,
    auditSampling: candidate.auditSampling,
    humanScan: candidate.humanScan,
    ...(typeof input.note === 'string' ? { note: input.note } : {}),
    updatedBy: actorOf(ctx),
  })
  appendGovEvent({
    domain: 'autonomy',
    severity: entry.al >= 4 ? 'warn' : 'info',
    type: `autonomy.scale_al${entry.al}`,
    source: 'autonomygov/controller',
    summary: `自治刻度：${entry.target} → AL${entry.al}（${tierFromAl(entry.al)} 圈，抽样 ${entry.auditSampling}）`,
    refs: { target: entry.target },
    payload: { al: entry.al, auditSampling: entry.auditSampling, humanScan: entry.humanScan },
  })
  ok(ctx, { entry, assessment: assess(entry) })
})

autonomyGovRoutes.delete('/scale/:target', (ctx) => {
  if (!removeScale(ctx.params.target)) {
    fail(ctx, 404, '无该 target 的自治配置', { code: 'not-found' })
    return
  }
  appendGovEvent({
    domain: 'autonomy',
    severity: 'info',
    type: 'autonomy.scale_removed',
    source: 'autonomygov/controller',
    summary: `自治刻度配置移除：${ctx.params.target}`,
    refs: { target: ctx.params.target },
  })
  ok(ctx)
})

/** 三圈配比 + 退化自检。 */
autonomyGovRoutes.get('/distribution', (ctx) => {
  ok(ctx, { report: ratioReport(listScale()) })
})

/** 缺口总览：AL 违规 + 假 AI 化 + 双签缺口。 */
autonomyGovRoutes.get('/gaps', (ctx) => {
  const assessments = listScale().map(assess)
  ok(ctx, {
    violations: assessments.filter((a) => a.verdict === 'blocked'),
    warnings: assessments.filter((a) => a.verdict === 'warn'),
    fakeAi: assessments.filter((a) => a.fakeAi),
    dualSign: { classes: highRiskOptions(), recentGaps: listDualSignGaps(50) },
  })
})

/** 双签判定（调用方在提交高风险变更前自查）。 */
autonomyGovRoutes.post('/dual-sign/check', (ctx) => {
  const body = bodyOf(ctx)
  const result = dualSignSatisfied({ klass: body.klass, signatures: body.signatures })
  // 不满足时落缺口记录——这是「不阻断但可见」的落点
  if (!result.satisfied) {
    recordDualSignGap({
      at: Date.now(),
      changeId: typeof body.changeId === 'string' ? body.changeId : '(未命名变更)',
      klass: String(body.klass ?? ''),
      signers: Array.isArray(body.signatures)
        ? (body.signatures as { by?: unknown }[]).map((s) => String(s?.by ?? '')).filter(Boolean)
        : [],
      reason: result.reason,
      source: 'autonomygov/dual-sign-check',
    })
  }
  ok(ctx, { result })
})

/** Agent 户口缺项（读 agentidentity 台账，不在此重算）。 */
autonomyGovRoutes.get('/roster-gaps', (ctx) => {
  ok(ctx, { ...listRosterGaps() })
})

/** 决策权审计两比例（读决策图谱，纯函数在 decisiongraph/stage-ratios）。 */
autonomyGovRoutes.get('/decision-stage-ratios', async (ctx) => {
  const raw = ctx.query.limit
  const limit = Math.max(1, Math.min(Number(raw) || 200, 500))
  const listed = await listDecisions(limit)
  const ratios = stageRatios(listed?.decisions ?? [])
  ok(ctx, {
    ratios,
    total: listed?.total ?? 0,
    // 图谱不可用时如实标注，不返回零值冒充「无决策」
    kgAvailable: Array.isArray(listed?.decisions),
  })
})
