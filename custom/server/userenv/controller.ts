/**
 * profile 环境变量 REST（/api/userenv/*）——N01（specs/2026-11-04-agentteams-ledger-items.md）。
 *
 *   GET /api/userenv/profiles/:name/env → 脱敏条目清单（敏感值 ***len=N***；
 *       profile 目录不存在 404；.env 未建=空表+missing，不 404——读模型 fail-soft）
 *   PUT /api/userenv/profiles/:name/env  body { entries: [{key,value}], confirmSensitive? }
 *       → 整表原子替换＋备份＋审计；敏感值变更未确认 409 { problems:[键名] }
 *
 * 权限：上游 requireUserJwt 写入 ctx.state.user；GET/PUT 均按 :name 做 profile 授权，
 * super_admin 可跨 profile。授权先于目录存在性探测、环境读写与审计。
 * 响应附 restartHint=true（有实际写入时）：需重启该 profile 网关才生效，
 * 默认不自动重启（spec D1）；幂等跳写时 restartHint=false。
 * 挂载：patch 743 置于上游认证后；patch 753 接启动覆盖检查与统一请求政策。
 */
import Router from '@koa/router'
import type { Context } from 'koa'
import { bodyOf, fail, ok } from '../lib/http'
import { requireProfileParameterAccess } from '../platform/authz/middleware'
import {
  EnvValidationError,
  SensitiveUnconfirmedError,
  isValidProfileName,
  profileExists,
  readProfileEnv,
  writeProfileEnv,
} from './env-store'

const router = new Router({ prefix: '/api/userenv' })

/** 操作者：上游 requireUserJwt 写入 ctx.state.user（与 approval 域 callerOf 同源） */
function actorOf(ctx: Context): string {
  const user = (ctx.state as { user?: { username?: string } } | undefined)?.user
  return user?.username ?? 'anonymous'
}

router.get('/profiles/:name/env', requireProfileParameterAccess('name'), async (ctx) => {
  const name = String(ctx.params.name ?? '')
  if (!isValidProfileName(name)) {
    fail(ctx, 400, '非法 profile 名（路径逃逸拒绝）', { code: 'invalid_profile_name' })
    return
  }
  if (!profileExists(name)) {
    fail(ctx, 404, `profile 不存在：${name}`, { code: 'profile_not_found' })
    return
  }
  const view = readProfileEnv(name)
  ok(ctx, { profile: name, entries: view.entries, missing: view.missing })
})

router.put('/profiles/:name/env', requireProfileParameterAccess('name'), async (ctx) => {
  const name = String(ctx.params.name ?? '')
  if (!isValidProfileName(name)) {
    fail(ctx, 400, '非法 profile 名（路径逃逸拒绝）', { code: 'invalid_profile_name' })
    return
  }
  if (!profileExists(name)) {
    fail(ctx, 404, `profile 不存在：${name}`, { code: 'profile_not_found' })
    return
  }
  const body = bodyOf<{ entries?: unknown; confirmSensitive?: unknown }>(ctx)
  if (!Array.isArray(body.entries)) {
    fail(ctx, 422, 'entries 须为 [{key,value}] 数组', { code: 'invalid_entries' })
    return
  }
  const entries: Array<{ key: string; value: string }> = []
  const problems: string[] = []
  body.entries.forEach((item, i) => {
    const e = item as { key?: unknown; value?: unknown }
    if (typeof e?.key !== 'string' || typeof e?.value !== 'string') {
      problems.push(`第 ${i + 1} 项须为 {key: string, value: string}`)
      return
    }
    entries.push({ key: e.key, value: e.value })
  })
  if (problems.length > 0) {
    fail(ctx, 422, 'entries 结构非法', { code: 'invalid_entries', problems })
    return
  }
  try {
    const result = writeProfileEnv(name, entries, {
      actor: actorOf(ctx),
      confirmSensitive: body.confirmSensitive === true,
    })
    ok(ctx, {
      profile: name,
      written: result.written,
      changedKeys: result.changedKeys,
      ...(result.backup ? { backup: result.backup } : {}),
      restartHint: result.written,
      entries: result.entries,
    })
  } catch (e) {
    if (e instanceof SensitiveUnconfirmedError) {
      fail(ctx, 409, '敏感键值变更须勾选「我确认修改敏感值」后重试', {
        code: 'sensitive_unconfirmed',
        problems: e.problems,
      })
      return
    }
    if (e instanceof EnvValidationError) {
      fail(ctx, 422, '环境变量条目校验失败', { code: 'invalid_entries', problems: e.problems })
      return
    }
    throw e
  }
})

export const userenvRoutes = router
