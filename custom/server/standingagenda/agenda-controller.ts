// overlay/standingagenda 域 REST（2026-11-14 Proactive AI 二轮 P3）。
// 端点（prefix /api/hermes/standing-agenda）：
//   GET  /                     列举（fail-soft：账本缺席＝空＋badLines 计数）
//   POST /                     立案（title/mandateGoal/evidence/resumeCondition 必填校验）
//   POST /:id/match            喂事件批 → 恢复建议（走治理链：govern 裁决＋落 interventions 台账）
//   PUT  /:id/status           状态流转（parked/resumed/done/dropped；resume 计数＋时刻）
//   GET  /:id                  单条
// 治理链（spec D5）：match 命中只产出「恢复建议」并过治理者四门裁决落 interventions 账——
// 不直接建看板卡、不直接唤醒 agent；真正恢复（PUT /:id/status→resumed）由人确认。
// 变更发 govbus autonomy 域事件（对齐 proactivity-controller 先例）。
import Router from '@koa/router'
import { appendGovEvent } from '../govbus/event-log'
import { created, fail as httpFail, ok } from '../lib/http'
import type { AutomationEvent } from '../automations/automation-rules'
import { DEFAULT_ATTENTION_PREFS, govern, type InterventionCandidate } from '../proactivity/intervention-governor'
import { appendIntervention, historyItems, readLedger, type InterventionRecord } from '../proactivity/intervention-ledger'
import { alignmentStatus, getAlignment } from '../proactivity/goal-alignment'

/** goal-alignment 新鲜度附注（stale/never-confirmed＝先重对齐；无关联目标＝无附注）。 */
function alignOf(goalId: string | undefined): string | undefined {
  if (!goalId) return undefined
  const entry = getAlignment(goalId)
  if (!entry) return undefined
  const s = alignmentStatus(entry)
  if (s.status === 'fresh') return undefined
  return `${s.status}：${s.reason}——先重对齐再恢复`
}
import {
  appendAgenda, getAgenda, newAgendaId, readAgendas, validateAgendaInput,
  type StandingAgendaRecord, type StandingAgendaStatus,
} from './agenda-store'
import { matchResumes } from './agenda-matcher'

export const standingAgendaRouter = new Router({ prefix: '/api/hermes/standing-agenda' })

function actorOf(ctx: { state: unknown }): string | undefined {
  const user = (ctx.state as { user?: { id?: number | string; username?: string } } | undefined)?.user
  if (!user) return undefined
  return user.username ?? (user.id !== undefined ? String(user.id) : undefined)
}

/** 读请求体（typecheck:harness 无 bodyparser 类型面——proactivity-controller 同款收窄）。 */
function bodyOf(ctx: { request: unknown }): Record<string, unknown> {
  return ((ctx.request as { body?: unknown }).body ?? {}) as Record<string, unknown>
}

const STATUS_FLOW: Record<StandingAgendaStatus, StandingAgendaStatus[]> = {
  parked: ['resumed', 'done', 'dropped'],
  resumed: ['parked', 'done', 'dropped'],
  done: [],
  dropped: [],
}

standingAgendaRouter.get('/', (ctx) => {
  const { records, badLines } = readAgendas()
  ok(ctx, { agendas: records, ...(badLines > 0 ? { badLines } : {}) })
})

standingAgendaRouter.get('/:id', (ctx) => {
  const record = getAgenda(ctx.params.id)
  if (!record) { httpFail(ctx, 404, 'standing agenda 不存在', { code: 'not_found' }); return }
  ok(ctx, { agenda: record })
})

standingAgendaRouter.post('/', (ctx) => {
  const body = bodyOf(ctx)
  const v = validateAgendaInput(body)
  if (!v.value) { httpFail(ctx, 400, '立案校验失败', { code: 'invalid_agenda', problems: v.problems }); return }
  const sessionId = typeof body.sessionId === 'string' && body.sessionId.trim() ? body.sessionId.trim() : undefined
  const goalId = typeof body.goalId === 'string' && body.goalId.trim() ? body.goalId.trim() : undefined
  const record: StandingAgendaRecord = {
    id: newAgendaId(),
    title: v.value.title,
    mandateGoal: v.value.mandateGoal,
    evidence: v.value.evidence,
    resumeCondition: v.value.resumeCondition,
    parkedAt: Date.now(),
    status: 'parked',
    resumeCount: 0,
    ...(sessionId ? { sessionId } : {}),
    ...(goalId ? { goalId } : {}),
    ...(typeof body.note === 'string' && body.note.trim() ? { note: body.note.trim().slice(0, 500) } : {}),
  }
  appendAgenda(record)
  appendGovEvent({ domain: 'autonomy', severity: 'info', type: 'standing_agenda.created', source: 'standingagenda', summary: `standing agenda 立案：${record.title}`, refs: { id: record.id }, payload: { by: actorOf(ctx) ?? 'unknown' } })
  created(ctx, { agenda: record })
})

/**
 * 事件批匹配：恢复建议（走治理链）。
 * 请求体 {events: AutomationEvent[]}；响应 {proposals, governed: 落账的干预记录摘要}。
 */
standingAgendaRouter.post('/:id/match', (ctx) => {
  const record = getAgenda(ctx.params.id)
  if (!record) { httpFail(ctx, 404, 'standing agenda 不存在', { code: 'not_found' }); return }
  const body = bodyOf(ctx)
  const events = Array.isArray(body.events) ? body.events as AutomationEvent[] : []
  if (events.length === 0) { httpFail(ctx, 400, 'events 须为非空数组（file/kanban/git/webhook 事件批）', { code: 'invalid_events' }); return }
  if (events.length > 200) { httpFail(ctx, 400, 'events 单批 ≤200 条', { code: 'invalid_events' }); return }
  const now = Date.now()
  // goal-alignment 新鲜度附注（stale/never-confirmed＝「先重对齐再恢复」——plan repair 最小实现）
  const proposals = matchResumes([record], events, {
    now,
    alignmentNote: (r) => alignOf(r.goalId),
  })
  if (proposals.length === 0) { ok(ctx, { matched: false, proposals: [] }); return }
  const p = proposals[0]!
  // 治理链：候选 → govern 四门裁决 → 落 interventions 台账（与人面建议同账同治理）
  const candidate: InterventionCandidate = {
    id: `sa-${record.id}-${now.toString(36)}`,
    surface: 'nudge',
    severity: 'attention',
    audience: 'human',
    urgency: 'normal',
    topicKey: `standing-agenda:${record.id}`,
    expectedBenefit: 0.6,
    attentionCost: 0.2,
    confidence: p.alignmentNote ? 0.5 : 0.75, // 目标失焦时降置信（治理者第一门先澄清）
  }
  const verdict = govern({ nowMs: now, prefs: DEFAULT_ATTENTION_PREFS, candidate, history: historyItems(readLedger()) })
  const rec: InterventionRecord = {
    id: candidate.id,
    surface: candidate.surface,
    severity: candidate.severity,
    audience: candidate.audience,
    urgency: 'normal',
    topicKey: candidate.topicKey!,
    summary: `恢复建议：${record.title}（触发 ${p.matchedEventSummary}）`.slice(0, 200),
    benefit: candidate.expectedBenefit!,
    cost: candidate.attentionCost!,
    decision: verdict.decision,
    reasonCode: verdict.reasonCode,
    reasons: verdict.reasons,
    score: verdict.score,
    ...(verdict.nextWindowAtMs != null ? { nextWindowAtMs: verdict.nextWindowAtMs } : {}),
    decidedAtMs: now,
    source: `standing-agenda:${actorOf(ctx) ?? 'match'}`,
    evidenceChain: {
      source: 'standing-agenda-match',
      refs: [p.matchedEventSummary, ...record.evidence.slice(0, 3)],
      inference: `恢复条件命中（${record.resumeCondition.type}）：${record.mandateGoal.slice(0, 80)}`,
      uncertainty: p.alignmentNote ? 'high' : 'medium',
    },
  }
  appendIntervention(rec)
  appendGovEvent({ domain: 'autonomy', severity: 'info', type: 'standing_agenda.resume_proposed', source: 'standingagenda', summary: `standing agenda 恢复建议（${verdict.decision}）：${record.title}`, refs: { id: record.id }, payload: { decision: verdict.decision, by: actorOf(ctx) ?? 'unknown' } })
  created(ctx, { matched: true, proposal: p, governed: { decision: verdict.decision, reasonCode: verdict.reasonCode, interventionId: rec.id } })
})

/** 状态流转（人确认面）：parked↔resumed→done/dropped；非法流转 400。 */
standingAgendaRouter.put('/:id/status', (ctx) => {
  const record = getAgenda(ctx.params.id)
  if (!record) { httpFail(ctx, 404, 'standing agenda 不存在', { code: 'not_found' }); return }
  const body = bodyOf(ctx)
  const next = body.status as StandingAgendaStatus
  if (!['parked', 'resumed', 'done', 'dropped'].includes(String(next))) {
    httpFail(ctx, 400, 'status 须为 parked/resumed/done/dropped', { code: 'invalid_status' }); return
  }
  if (!STATUS_FLOW[record.status].includes(next)) {
    httpFail(ctx, 400, `非法流转：${record.status} → ${next}（允许：${STATUS_FLOW[record.status].join('/') || '终态'}）`, { code: 'invalid_transition' }); return
  }
  const now = Date.now()
  const updated: StandingAgendaRecord = {
    ...record,
    status: next,
    ...(next === 'resumed' ? { resumeCount: record.resumeCount + 1, lastResumeAt: now } : {}),
  }
  appendAgenda(updated)
  appendGovEvent({ domain: 'autonomy', severity: 'info', type: `standing_agenda.${next}`, source: 'standingagenda', summary: `standing agenda ${next}：${updated.title}`, refs: { id: updated.id }, payload: { by: actorOf(ctx) ?? 'unknown' } })
  ok(ctx, { agenda: updated })
})
