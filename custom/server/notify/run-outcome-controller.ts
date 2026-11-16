/**
 * Run 收口三态 REST（Always-on Agents 吸收 P1，2026-11-16）。
 *
 * POST /api/hermes/run-outcome          记录一条收口（outbox|silence|deferred + 闭集 reasonCode）
 * GET  /api/hermes/run-outcome          查询（outcome/reasonCode/runKind/runId/sinceMs/limit）
 * GET  /api/hermes/run-outcome/stats    统计（byOutcome/byReason/byRunKind/silenceShare）
 *
 * 挂载：B 类补丁 784 在 bootstrap/routes.ts（与 outbox 同批）。
 * 响应形状统一走 lib/http（K19：新代码不手写响应体/失败字面量）。
 */
import Router from '@koa/router'
import { bodyOf, fail, ok } from '../lib/http'
import {
  isRunOutcomeAudience, isRunOutcomeKind, isRunOutcomeReason, isRunOutcomeResult,
  readRunOutcomes, recordRunOutcome, runOutcomeStats,
} from './run-outcome'

const router = new Router({ prefix: '/api/hermes/run-outcome' })

router.post('/', async (ctx) => {
  const body = bodyOf(ctx)
  const { runId, runKind, audience, outcome, reasonCode, refs, sessionId } = body
  if (typeof runId !== 'string' || !runId
      || !isRunOutcomeKind(runKind) || !isRunOutcomeAudience(audience)
      || !isRunOutcomeResult(outcome) || !isRunOutcomeReason(reasonCode)
      || (refs !== undefined && !Array.isArray(refs))) {
    fail(ctx, 400, 'runId/runKind/audience/outcome/reasonCode 必填且词表内；refs 可选数组')
    return
  }
  const result = recordRunOutcome({
    runId, runKind, audience, outcome, reasonCode,
    refs: Array.isArray(refs) ? refs.map(String) : [],
    ...(typeof sessionId === 'string' && sessionId ? { sessionId } : {}),
  })
  if (!result.recorded) {
    fail(ctx, 400, result.problems.join('；') || '收口记录失败', { problems: result.problems })
    return
  }
  ok(ctx, result as unknown as Record<string, unknown>)
})

router.get('/', async (ctx) => {
  const { outcome, reasonCode, runKind, runId } = ctx.query
  if (outcome !== undefined && !isRunOutcomeResult(outcome)) {
    fail(ctx, 400, 'outcome 须为 outbox|silence|deferred')
    return
  }
  if (reasonCode !== undefined && !isRunOutcomeReason(reasonCode)) {
    fail(ctx, 400, 'reasonCode 须为闭集之一')
    return
  }
  if (runKind !== undefined && !isRunOutcomeKind(runKind)) {
    fail(ctx, 400, 'runKind 须为词表内')
    return
  }
  const sinceMs = ctx.query.sinceMs === undefined ? undefined : Number(ctx.query.sinceMs)
  if (sinceMs !== undefined && !Number.isFinite(sinceMs)) {
    fail(ctx, 400, 'sinceMs 须为数字')
    return
  }
  const limit = ctx.query.limit === undefined ? undefined : Number(ctx.query.limit)
  const result = readRunOutcomes({
    ...(outcome ? { outcome: outcome as never } : {}),
    ...(reasonCode ? { reasonCode: reasonCode as never } : {}),
    ...(runKind ? { runKind: runKind as never } : {}),
    ...(typeof runId === 'string' && runId ? { runId } : {}),
    ...(sinceMs !== undefined ? { sinceMs } : {}),
    ...(limit !== undefined && Number.isFinite(limit) ? { limit } : {}),
  })
  ok(ctx, result as unknown as Record<string, unknown>)
})

router.get('/stats', async (ctx) => {
  const sinceMs = ctx.query.sinceMs === undefined ? undefined : Number(ctx.query.sinceMs)
  if (sinceMs !== undefined && !Number.isFinite(sinceMs)) {
    fail(ctx, 400, 'sinceMs 须为数字')
    return
  }
  ok(ctx, runOutcomeStats(sinceMs) as unknown as Record<string, unknown>)
})

export const runOutcomeRouter = router
