import type { Context, Next } from 'koa'
import type { PlatformPrincipal } from '../../../platform/contracts/identity'
import { fail } from '../../lib/http'

export {
  evaluateIdentityBinding,
  normalizeIssuerOrigin,
} from '../../../platform/contracts/identity'

export function canAccessProfile(user: PlatformPrincipal | undefined, profile: string): boolean {
  if (!user) return false
  if (user.role === 'super_admin') return true
  return user.status === 'active' && Array.isArray(user.profiles) && user.profiles.includes(profile)
}

export const requirePlatformSuperAdmin = async (ctx: Context, next: Next): Promise<void> => {
  const user = ctx.state.user as PlatformPrincipal | undefined
  if (!user) {
    fail(ctx, 401, '需要登录后访问')
    return
  }
  if (user.role !== 'super_admin') {
    fail(ctx, 403, '需要平台超级管理员权限')
    return
  }
  await next()
}
