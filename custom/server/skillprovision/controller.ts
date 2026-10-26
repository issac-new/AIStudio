// overlay/skillprovision：REST 端点（挂在已由 606 号补丁挂载的 /api/skillgov router）。
//
// 不新增上游 patch、不触发 inject。读面 fail-soft；写面全部要求显式确认，且
// manifest 缺失时拒绝供给。
import { isAbsolute, join, resolve } from 'node:path'
import Router from '@koa/router'
import type { Context } from 'koa'
import { buildReport, defaultHostRoot } from './reconcile'
import { loadManifest, resolveManifestPath, writeManifest } from './manifest'
import { applyProvision, rollbackProvision } from './provision'
import { fleetDir, readFleetReport } from './fleet'
import { listProfiles } from './scan'
import { canUserAccessProfile, type ProfileAccessDeps, type ProfileAccessUser } from '../services/hermes/profile-access'

function bodyOf(ctx: unknown): Record<string, unknown> {
  const req = (ctx as { request?: { body?: unknown } })?.request
  return req?.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}
}

function absoluteQuery(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !isAbsolute(value)) throw new Error(`${field} 必须是绝对路径`)
  return value
}

function profilesOf(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) throw new Error('profiles 必须是字符串数组')
  return value as string[]
}

function callerOf(ctx: unknown): ProfileAccessUser | null {
  return ((ctx as { state?: { user?: ProfileAccessUser } })?.state?.user) ?? null
}

function hostProfiles(body: Record<string, unknown>): string[] {
  const hostRoot = absoluteQuery(body.hostRoot, 'hostRoot') ?? defaultHostRoot()
  // _shared 由 provision 明确排除，不属于技能写目标；其余默认全量目标都须过 ACL。
  return listProfiles(join(resolve(hostRoot), 'profiles')).filter(profile => profile !== '_shared')
}

function restrictedCaller(ctx: Context): ProfileAccessUser | null {
  const user = callerOf(ctx)
  return user && user.role !== 'super_admin' ? user : null
}

function denyPathOverrides(ctx: Context, body: Record<string, unknown>): boolean {
  if (!restrictedCaller(ctx)) return false
  const overridden = ['hostRoot', 'simRoot', 'manifestPath'].some(field => body[field] !== undefined)
  if (!overridden) return false
  ctx.status = 403
  ctx.body = { ok: false, problems: ['profile_path_override_forbidden：普通用户只能使用默认运行根与默认清单'] }
  return true
}

function authorizeTargets(
  ctx: Context,
  deps: ProfileAccessDeps | undefined,
  targets: string[],
): boolean {
  const user = callerOf(ctx)
  if (!user || user.role === 'super_admin') return true
  const denied = targets.some(profile => !canUserAccessProfile(user, profile, deps))
  if (!denied) return true
  ctx.status = 403
  ctx.body = { ok: false, problems: ['profile_forbidden：请求包含当前用户不可见或无法确定的 profile'] }
  return false
}

export function attachSkillProvisionRoutes(router: Router, deps?: ProfileAccessDeps): void {
  router.get('/provision/report', async (ctx) => {
    try {
      const report = buildReport({
        hostRoot: absoluteQuery(ctx.query.hostRoot, 'hostRoot'),
        simRoot: absoluteQuery(ctx.query.simRoot, 'simRoot'),
        manifestPath: absoluteQuery(ctx.query.manifestPath, 'manifestPath'),
      })
      ctx.body = { ok: true, report }
    } catch (e) {
      ctx.status = 400
      ctx.body = { ok: false, problems: [(e as Error).message] }
    }
  })

  router.get('/provision/fleet', async (ctx) => {
    try {
      const dir = absoluteQuery(ctx.query.fleetDir, 'fleetDir') ?? fleetDir()
      ctx.body = readFleetReport(dir)
    } catch (e) {
      ctx.status = 400
      ctx.body = { ok: false, problems: [(e as Error).message] }
    }
  })

  router.get('/provision/manifest', async (ctx) => {
    const path = absoluteQuery(ctx.query.manifestPath, 'manifestPath')
    try {
      const loaded = loadManifest(path)
      ctx.body = { ok: true, ...loaded }
    } catch (e) {
      ctx.status = 500
      ctx.body = { ok: false, problems: [(e as Error).message] }
    }
  })

  router.put('/provision/manifest', async (ctx) => {
    const body = bodyOf(ctx)
    if (restrictedCaller(ctx)) {
      ctx.status = 403
      ctx.body = { ok: false, problems: ['profile_manifest_forbidden：只有 super_admin 可以写入共享供给清单'] }
      return
    }
    const payload = body.manifest ?? body
    const path = absoluteQuery(body.manifestPath, 'manifestPath') ?? resolveManifestPath()
    try {
      const written = writeManifest(payload, path)
      ctx.body = { ok: true, ...written, effectiveReadPath: resolveManifestPath() }
    } catch (e) {
      ctx.status = 400
      ctx.body = { ok: false, problems: [(e as Error).message] }
    }
  })

  router.post('/provision/apply', async (ctx) => {
    const body = bodyOf(ctx)
    const dryRun = body.dryRun !== false
    if (!dryRun && body.confirm !== true) {
      ctx.status = 400
      ctx.body = { ok: false, problems: ['confirm_required：非干跑必须显式 confirm=true'] }
      return
    }
    if (denyPathOverrides(ctx, body)) return
    try {
      const profiles = profilesOf(body.profiles)
      if (!authorizeTargets(ctx, deps, profiles ?? hostProfiles(body))) return
      const result = applyProvision({
        hostRoot: absoluteQuery(body.hostRoot, 'hostRoot'),
        simRoot: absoluteQuery(body.simRoot, 'simRoot'),
        manifestPath: absoluteQuery(body.manifestPath, 'manifestPath'),
        profiles,
        dryRun,
        confirm: body.confirm === true,
      })
      if (!result.ok && result.reason === 'manifest_missing') {
        ctx.status = 409
        ctx.body = { ok: false, reason: result.reason, problems: ['清单不存在或解析失败，拒绝供给（示例清单不可执行）'] }
        return
      }
      ctx.body = result
    } catch (e) {
      ctx.status = 400
      ctx.body = { ok: false, problems: [(e as Error).message] }
    }
  })

  router.post('/provision/rollback', async (ctx) => {
    const body = bodyOf(ctx)
    const dryRun = body.dryRun !== false
    if (!dryRun && body.confirm !== true) {
      ctx.status = 400
      ctx.body = { ok: false, problems: ['confirm_required：非干跑必须显式 confirm=true'] }
      return
    }
    if (denyPathOverrides(ctx, body)) return
    try {
      const profiles = profilesOf(body.profiles)
      if (!authorizeTargets(ctx, deps, profiles ?? hostProfiles(body))) return
      const result = rollbackProvision({
        hostRoot: absoluteQuery(body.hostRoot, 'hostRoot'),
        simRoot: absoluteQuery(body.simRoot, 'simRoot'),
        manifestPath: absoluteQuery(body.manifestPath, 'manifestPath'),
        profiles,
        dryRun,
        confirm: body.confirm === true,
      })
      ctx.body = result
    } catch (e) {
      ctx.status = 400
      ctx.body = { ok: false, problems: [(e as Error).message] }
    }
  })
}
