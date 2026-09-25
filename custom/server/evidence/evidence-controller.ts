/**
 * 任务证据台账 REST（/api/evidence/*）——routa §七#3 + antigravity A1 合并域（矩阵 §3.6 P0）。
 *
 * POST /api/evidence/:taskId                 追加一条证据（幂等 evidenceId）
 * GET  /api/evidence/:taskId[?kind=&limit=]  台账查询（新在前）
 * GET  /api/evidence/:taskId/verdict         最新验证裁决（routa verificationVerdict）
 *
 * 挂载：B 类 patch 411 在 bootstrap/routes.ts。
 */
import Router from '@koa/router'
import {
  appendEvidence, isEvidenceKind, isVerificationVerdict, latestVerdict, listEvidence,
  type EvidenceRecord,
} from './evidence-store'
import { buildResultCard, changedFilesByTurn } from './result-card'

const router = new Router({ prefix: '/api/evidence' })

function parseRecord(taskId: string, body: Record<string, unknown>): EvidenceRecord | { error: string } {
  const { evidenceId, kind, ref } = body
  if (typeof evidenceId !== 'string' || !evidenceId || typeof ref !== 'string') {
    return { error: 'evidenceId 与 ref 必填' }
  }
  if (!isEvidenceKind(kind)) {
    return { error: 'kind 须为 artifact/delivery_snapshot/verification/lane_session/lane_handoff' }
  }
  const rec: EvidenceRecord = {
    evidenceId, taskId, kind, ref,
    at: typeof body.at === 'number' ? body.at : Date.now(),
  }
  if (typeof body.artifactType === 'string') rec.artifactType = body.artifactType
  if (typeof body.milestone === 'string') rec.milestone = body.milestone
  if (typeof body.note === 'string') rec.note = body.note
  if (body.revision && typeof body.revision === 'object') {
    const r = body.revision as { base?: unknown; head?: unknown }
    if (typeof r.base === 'string' && typeof r.head === 'string') rec.revision = { base: r.base, head: r.head }
  }
  if (body.verdict !== undefined) {
    if (!isVerificationVerdict(body.verdict)) return { error: 'verdict 须为 pass/fail/conditional' }
    rec.verdict = body.verdict
    if (typeof body.basis === 'string') rec.basis = body.basis
  }
  return rec
}

router.post('/:taskId', async (ctx) => {
  const taskId = ctx.params.taskId
  const parsed = parseRecord(taskId, (ctx.request.body ?? {}) as Record<string, unknown>)
  if ('error' in parsed) {
    ctx.status = 400
    ctx.body = { ok: false, detail: parsed.error }
    return
  }
  const result = appendEvidence(parsed)
  ctx.body = { ok: true, ...result }
})

router.get('/:taskId/card', async (ctx) => {
  // 任务结果卡（deepseek-harness 交付卡：时长+验证 bullet+文件清单+交付冻结）。
  ctx.body = { ok: true, card: buildResultCard(ctx.params.taskId) }
})

router.get('/:taskId/changed-files', async (ctx) => {
  // per-turn changed-files（dsh §十 P0-4）：artifactType='changed-files' 卡按里程碑（轮）分组。
  ctx.body = { ok: true, turns: changedFilesByTurn(ctx.params.taskId) }
})

router.get('/:taskId/verdict', async (ctx) => {
  ctx.body = { ok: true, verdict: latestVerdict(ctx.params.taskId) }
})

router.get('/:taskId', async (ctx) => {
  const kind = ctx.query.kind
  const limit = Number(ctx.query.limit ?? 50)
  if (kind !== undefined && !isEvidenceKind(kind)) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'kind 须为五 kind 之一' }
    return
  }
  ctx.body = {
    ok: true,
    records: listEvidence(ctx.params.taskId, kind as never, Number.isFinite(limit) ? limit : 50),
  }
})

export const evidenceRoutes = router
