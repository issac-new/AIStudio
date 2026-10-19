// overlay/custom/server/harness/workbench/controller.ts
// Harness² 改进实验台 REST（挂在既有 /api/harness 之下，路径 /api/harness/workbench/*）。
// 写面沿用治理面约定：有认证主体时须 super_admin；单用户无鉴权部署放行。
import Router from '@koa/router'
import { collectSurfaces } from './surface-registry'
import {
  ServiceError, addExperience, attachBaseline, composeProposal, createProbes, createProposal,
  decideProposal, importExperiences, listExperiences, listProposals, overview,
  promoteProposal, recordProbe, rollbackProposal, setExperienceStatus, submitProposal,
} from './service'
import type { ExperienceStatus, SurfaceKey } from './types'

const router = new Router()

type Ctx = {
  state?: unknown
  status?: number
  body?: unknown
  params: Record<string, string>
  query: Record<string, unknown>
  // Koa 的 Request 类型不含 body（由 bootstrap 的 body parser 挂载），此处放宽以复用。
  request: any
}

function writeDenied(ctx: Ctx): boolean {
  const user = (ctx.state as { user?: { role?: string } } | undefined)?.user
  if (user && user.role !== 'super_admin') {
    ctx.status = 403
    ctx.body = { ok: false, detail: '治理写面须 super_admin 权限' }
    return true
  }
  return false
}

function bodyOf(ctx: Ctx): Record<string, unknown> {
  const b = ctx.request.body
  return b && typeof b === 'object' ? (b as Record<string, unknown>) : {}
}

function actorOf(ctx: Ctx, body: Record<string, unknown>): string {
  const explicit = typeof body.actor === 'string' ? body.actor.trim() : ''
  if (explicit) return explicit
  const user = (ctx.state as { user?: Record<string, unknown> } | undefined)?.user
  const fromUser = user && (typeof user.username === 'string' ? user.username : typeof user.name === 'string' ? user.name : '')
  return fromUser || 'operator'
}

function fail(ctx: Ctx, e: unknown): void {
  if (e instanceof ServiceError) {
    ctx.status = e.status
    ctx.body = { ok: false, error: e.message, ...(e.detail != null ? { blockers: e.detail } : {}) }
    return
  }
  ctx.status = 500
  ctx.body = { ok: false, error: e instanceof Error ? e.message : String(e) }
}

router.get('/overview', async (ctx) => {
  try {
    ctx.body = { ok: true, ...overview() }
  } catch (e) {
    fail(ctx, e)
  }
})

router.get('/surfaces', async (ctx) => {
  ctx.body = { ok: true, surfaces: collectSurfaces() }
})

router.get('/proposals', async (ctx) => {
  try {
    ctx.body = { ok: true, proposals: listProposals() }
  } catch (e) {
    fail(ctx, e)
  }
})

router.post('/proposals', async (ctx) => {
  if (writeDenied(ctx)) return
  const b = bodyOf(ctx)
  try {
    const variants = Array.isArray(b.variants)
      ? b.variants.map((v) => {
        const row = v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
        return { label: typeof row.label === 'string' ? row.label : undefined, content: String(row.content ?? '') }
      })
      : []
    const proposal = await createProposal({
      title: String(b.title ?? ''),
      hypothesis: String(b.hypothesis ?? ''),
      surfaceKey: String(b.surfaceKey ?? '') as SurfaceKey,
      targetPath: typeof b.targetPath === 'string' ? b.targetPath : null,
      mode: b.mode === 'sequential' ? 'sequential' : 'parallel',
      domain: typeof b.domain === 'string' ? b.domain : undefined,
      budgetCapUsd: typeof b.budgetCapUsd === 'number' ? b.budgetCapUsd : Number(b.budgetCapUsd),
      evidenceRefs: Array.isArray(b.evidenceRefs) ? b.evidenceRefs.map(String) : [],
      experienceIds: Array.isArray(b.experienceIds) ? b.experienceIds.map(String) : [],
      variants,
      createdBy: actorOf(ctx, b),
    })
    ctx.body = { ok: true, proposal }
  } catch (e) {
    fail(ctx, e)
  }
})

router.post('/proposals/:id/baseline', async (ctx) => {
  if (writeDenied(ctx)) return
  const b = bodyOf(ctx)
  try {
    ctx.body = { ok: true, proposal: await attachBaseline(ctx.params.id, String(b.evalRunId ?? '')) }
  } catch (e) {
    fail(ctx, e)
  }
})

router.post('/proposals/:id/submit', async (ctx) => {
  if (writeDenied(ctx)) return
  try {
    ctx.body = { ok: true, proposal: await submitProposal(ctx.params.id) }
  } catch (e) {
    fail(ctx, e)
  }
})

router.post('/proposals/:id/decide', async (ctx) => {
  if (writeDenied(ctx)) return
  const b = bodyOf(ctx)
  const decision = b.decision === 'approve' || b.decision === 'reject' ? b.decision : null
  if (!decision) {
    ctx.status = 400
    ctx.body = { ok: false, error: 'decision 须为 approve|reject' }
    return
  }
  try {
    ctx.body = {
      ok: true,
      proposal: await decideProposal(ctx.params.id, decision, actorOf(ctx, b), String(b.note ?? '')),
    }
  } catch (e) {
    fail(ctx, e)
  }
})

router.post('/proposals/:id/probes', async (ctx) => {
  if (writeDenied(ctx)) return
  const b = bodyOf(ctx)
  try {
    ctx.body = {
      ok: true,
      proposal: await createProbes(ctx.params.id, {
        variantIds: Array.isArray(b.variantIds) ? b.variantIds.map(String) : undefined,
        estimatedCostPerProbeUsd: typeof b.estimatedCostPerProbeUsd === 'number' ? b.estimatedCostPerProbeUsd : undefined,
      }),
    }
  } catch (e) {
    fail(ctx, e)
  }
})

router.post('/proposals/:id/probes/:probeId/record', async (ctx) => {
  if (writeDenied(ctx)) return
  const b = bodyOf(ctx)
  try {
    ctx.body = {
      ok: true,
      proposal: await recordProbe(ctx.params.id, ctx.params.probeId, {
        evalRunId: String(b.evalRunId ?? ''),
        regressionRunId: typeof b.regressionRunId === 'string' ? b.regressionRunId : null,
        note: typeof b.note === 'string' ? b.note : undefined,
        actor: actorOf(ctx, b),
      }),
    }
  } catch (e) {
    fail(ctx, e)
  }
})

router.post('/proposals/:id/compose', async (ctx) => {
  if (writeDenied(ctx)) return
  const b = bodyOf(ctx)
  try {
    ctx.body = {
      ok: true,
      proposal: await composeProposal(ctx.params.id, {
        variantId: typeof b.variantId === 'string' ? b.variantId : undefined,
        mergedContent: typeof b.mergedContent === 'string' ? b.mergedContent : undefined,
        rationale: String(b.rationale ?? ''),
        actor: actorOf(ctx, b),
      }),
    }
  } catch (e) {
    fail(ctx, e)
  }
})

router.post('/proposals/:id/promote', async (ctx) => {
  if (writeDenied(ctx)) return
  const b = bodyOf(ctx)
  try {
    const reflectionRaw = b.reflection && typeof b.reflection === 'object' ? b.reflection as Record<string, unknown> : null
    const confidence: 'low' | 'medium' | 'high' =
      reflectionRaw?.confidence === 'high' || reflectionRaw?.confidence === 'low' ? reflectionRaw.confidence : 'medium'
    const reflection = reflectionRaw
      ? {
        cue: typeof reflectionRaw.cue === 'string' ? reflectionRaw.cue : undefined,
        lesson: typeof reflectionRaw.lesson === 'string' ? reflectionRaw.lesson : undefined,
        evidence: typeof reflectionRaw.evidence === 'string' ? reflectionRaw.evidence : undefined,
        confidence,
      }
      : undefined
    const result = await promoteProposal(ctx.params.id, { actor: actorOf(ctx, b), apply: b.apply === true, reflection })
    ctx.body = { ok: true, ...result }
  } catch (e) {
    fail(ctx, e)
  }
})

router.post('/proposals/:id/rollback', async (ctx) => {
  if (writeDenied(ctx)) return
  const b = bodyOf(ctx)
  try {
    ctx.body = {
      ok: true,
      proposal: await rollbackProposal(ctx.params.id, { actor: actorOf(ctx, b), reason: String(b.reason ?? '') }),
    }
  } catch (e) {
    fail(ctx, e)
  }
})

router.get('/experiences', async (ctx) => {
  ctx.body = { ok: true, experiences: listExperiences() }
})

router.post('/experiences', async (ctx) => {
  if (writeDenied(ctx)) return
  const b = bodyOf(ctx)
  try {
    ctx.body = {
      ok: true,
      experience: await addExperience({
        surfaceKey: typeof b.surfaceKey === 'string' ? (b.surfaceKey as SurfaceKey) : null,
        domain: typeof b.domain === 'string' ? b.domain : null,
        statement: String(b.statement ?? ''),
        cue: typeof b.cue === 'string' ? b.cue : undefined,
        lesson: typeof b.lesson === 'string' ? b.lesson : undefined,
        evidenceText: typeof b.evidenceText === 'string' ? b.evidenceText : undefined,
        evidenceRefs: Array.isArray(b.evidenceRefs) ? b.evidenceRefs.map(String) : [],
        confidence: b.confidence === 'high' || b.confidence === 'low' ? b.confidence : 'medium',
        actor: actorOf(ctx, b),
      }),
    }
  } catch (e) {
    fail(ctx, e)
  }
})

router.post('/experiences/import', async (ctx) => {
  if (writeDenied(ctx)) return
  try {
    ctx.body = { ok: true, ...(await importExperiences()) }
  } catch (e) {
    fail(ctx, e)
  }
})

router.post('/experiences/:id/status', async (ctx) => {
  if (writeDenied(ctx)) return
  const b = bodyOf(ctx)
  const status = String(b.status ?? '') as ExperienceStatus
  try {
    ctx.body = { ok: true, experience: await setExperienceStatus(ctx.params.id, status) }
  } catch (e) {
    fail(ctx, e)
  }
})

export const workbenchRoutes = router
