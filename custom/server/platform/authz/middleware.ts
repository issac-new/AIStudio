import type { Context, Next } from 'koa'
import type { PlatformPrincipal } from '../../../platform/contracts/identity'
import { fail } from '../../lib/http'
import { canAccessProfile } from './policy'

/** 从路由路径参数提取 profile；未授权时不得进入任何资源探测或写处理器。 */
export function requireProfileParameterAccess(parameter: string) {
  return async (ctx: Context, next: Next): Promise<void> => {
    const user = ctx.state.user as PlatformPrincipal | undefined
    if (!user) {
      fail(ctx, 401, '需要登录后访问')
      return
    }
    const profile = ctx.params?.[parameter]
    // N28-3（run28 收尾批）：JWT claims 无 profiles 字段时按用户名回填——「用户默认可访问
    // 与自己同名的 profile」。run28 实录：studio 签发的 JWT 只含 role/matrix_user_id，
    // canAccessProfile 仅 super_admin 直通，普通用户访问自己的 profile env 恒 403
    // （G4 能力探测 userenv 组两红→当轮拦截死锁的根因）。
    if (user && !Array.isArray(user.profiles) && user.username) {
      user.profiles = [user.username]
    }
    // N29-17（run29 G4 实证补全）：toAuthenticatedUser 构造的 JWT principal 不携带
    // status 字段，canAccessProfile 的 status==='active' 条件恒假——N28-3 只回填
    // profiles 治错了字段，403 依旧。到达授权层的 principal 必然在役（上游认证
    // 中间件已拒绝禁用/不存在用户），缺场=在役；??= 保留显式携带值。
    if (user && user.status === undefined) {
      user.status = 'active'
    }
    if (typeof profile !== 'string' || !profile || !canAccessProfile(user, profile)) {
      fail(ctx, 403, '无权访问该 profile')
      return
    }
    await next()
  }
}
