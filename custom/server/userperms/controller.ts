// custom/server/userperms/controller.ts
// 用户权限变更审计查询端点（N02）。
//
//   GET /api/userperms/audit?user=&action=&limit=&offset=
//     → { ok, entries, total, hasMore }
//     action ∈ role_change|profile_grant|profile_revoke（白名单外的值 400）；
//     limit clamp 1..500（缺省 50）、offset ≥0；结果新→旧。
//
// 权限：与 harness/execution-records 端点同档（登录即可，无 admin 门）——挂载走
// bootstrap routes.ts 全局 authMiddleware 链（patch 740，同 731/735 形态），本文件
// 不自建鉴权。响应形状走 lib/http ok/fail。
import Router from '@koa/router'
import type { Context } from 'koa'
import { fail, ok } from '../lib/http'
import { queryAudit, type UserPermsAuditAction } from './audit-store'

export const userPermsAuditRoutes = new Router({ prefix: '/api/userperms' })

const ACTIONS: readonly UserPermsAuditAction[] = ['role_change', 'profile_grant', 'profile_revoke']

/** 单值 query 取串（koa query 可能是数组——取首值不猜）。 */
function q(ctx: Context, key: string): string {
  const v = (ctx.query as Record<string, unknown>)[key]
  return typeof v === 'string' ? v.trim() : Array.isArray(v) && typeof v[0] === 'string' ? v[0].trim() : ''
}

function intQuery(ctx: Context, key: string): number | null {
  const raw = q(ctx, key)
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

/** GET /api/userperms/audit——审计流过滤查询。导出供测试直调。 */
export async function userPermsAuditQueryHandler(ctx: Context): Promise<void> {
  const user = q(ctx, 'user') || undefined
  const actionRaw = q(ctx, 'action')
  let action: UserPermsAuditAction | undefined
  if (actionRaw) {
    if (!ACTIONS.includes(actionRaw as UserPermsAuditAction)) {
      fail(ctx, 400, `Invalid action, expected one of: ${ACTIONS.join(', ')}`, { code: 'invalid_action' })
      return
    }
    action = actionRaw as UserPermsAuditAction
  }
  const limit = intQuery(ctx, 'limit') ?? undefined
  const offset = intQuery(ctx, 'offset') ?? undefined
  const result = queryAudit({ user, action, limit, offset })
  ok(ctx, { entries: result.entries, total: result.total, hasMore: result.hasMore })
}

userPermsAuditRoutes.get('/audit', userPermsAuditQueryHandler)
