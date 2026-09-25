/**
 * 任务证据台账 REST（/api/evidence/*）——routa §七#3 + antigravity A1 合并域（矩阵 §3.6 P0）。
 *
 * POST /api/evidence/:taskId                 追加一条证据（幂等 evidenceId）
 * GET  /api/evidence/:taskId[?kind=&limit=]  台账查询（新在前）
 * GET  /api/evidence/:taskId/verdict         最新验证裁决（routa verificationVerdict）
 *
 * 归属（已知边界，勿当无漏）：单租户信任模型——任意登录用户凭 taskId 可读写任意台账，
 * 写入只记 actor 痕（与 approval 域 callerOf 同源取 ctx.state.user）。多租户任务归属待
 * taskId→workspace 映射可得后接闸（见 evidence-store.ts 文件头注释）。
 *
 * 挂载：B 类 patch 411 在 bootstrap/routes.ts。
 */
import Router from '@koa/router'
import type { Context } from 'koa'
import {
  appendEvidence, isEvidenceKind, isVerificationVerdict, latestVerdict, listEvidence,
  type EvidenceRecord, type VerificationVerdict,
} from './evidence-store'
import { buildResultCard, changedFilesByTurn } from './result-card'

const router = new Router({ prefix: '/api/evidence' })

/** 写入者：上游 requireUserJwt 写入 ctx.state.user；未启用鉴权的部署为 undefined（留空不伪造）。 */
function actorOf(ctx: Context): string | undefined {
  const user = (ctx.state as { user?: { id?: number | string; username?: string } } | undefined)?.user
  if (!user) return undefined
  return user.username ?? (user.id !== undefined ? String(user.id) : undefined)
}

function parseRecord(taskId: string, body: Record<string, unknown>, actor?: string): EvidenceRecord | { error: string } {
  const { evidenceId, kind, ref } = body
  if (typeof evidenceId !== 'string' || !evidenceId || typeof ref !== 'string') {
    return { error: 'evidenceId 与 ref 必填' }
  }
  if (!isEvidenceKind(kind)) {
    return { error: 'kind 须为 artifact/delivery_snapshot/verification/lane_session/lane_handoff' }
  }
  // kind 与 verdict 强绑定：verification 必带三态裁决（缺裁决的残条会被渲染成字面量
  // "undefined" 并遮蔽真实裁决）；其余 kind 禁带 verdict。
  if (kind === 'verification' && !isVerificationVerdict(body.verdict)) {
    return { error: 'kind=verification 须带 verdict（pass/fail/conditional）' }
  }
  if (kind !== 'verification' && body.verdict !== undefined) {
    return { error: 'verdict 仅 kind=verification 可带' }
  }
  // at 一律服务端时间戳为准（可信面）；client 自报值仅有限数才留痕 claimedAt，非法值拒收
  // （NaN 会落盘成 null，静默毁时间轴）。
  if (body.at !== undefined && !(typeof body.at === 'number' && Number.isFinite(body.at))) {
    return { error: 'at 须为有限数值（时间以服务端为准，此处仅作 claimedAt 留痕）' }
  }
  const rec: EvidenceRecord = { evidenceId, taskId, kind, ref, at: Date.now() }
  if (actor) rec.actor = actor
  if (body.at !== undefined) rec.claimedAt = body.at as number
  if (typeof body.artifactType === 'string') rec.artifactType = body.artifactType
  if (typeof body.milestone === 'string') rec.milestone = body.milestone
  if (typeof body.note === 'string') rec.note = body.note
  if (body.revision && typeof body.revision === 'object') {
    const r = body.revision as { base?: unknown; head?: unknown }
    if (typeof r.base === 'string' && typeof r.head === 'string') rec.revision = { base: r.base, head: r.head }
  }
  if (kind === 'verification') {
    rec.verdict = body.verdict as VerificationVerdict  // 上面已过 isVerificationVerdict
    if (typeof body.basis === 'string') rec.basis = body.basis
  }
  return rec
}

router.post('/:taskId', async (ctx) => {
  const taskId = ctx.params.taskId
  const parsed = parseRecord(taskId, (ctx.request.body ?? {}) as Record<string, unknown>, actorOf(ctx))
  if ('error' in parsed) {
    ctx.status = 400
    ctx.body = { ok: false, detail: parsed.error }
    return
  }
  const result = appendEvidence(parsed)
  if (result.code) {
    // 写失败/台账身份不符：5xx 且只透传 code（S-D：不回 err 详情，syscall/errno 会泄漏服务器路径）。
    ctx.status = 500
    ctx.body = { ok: false, code: result.code }
    return
  }
  ctx.body = { ok: true, added: result.added, total: result.total, evicted: result.evicted }
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
