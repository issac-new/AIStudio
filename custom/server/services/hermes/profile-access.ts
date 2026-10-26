// 统一调用方 profile 判据：upstream requireUserJwt 写入的 user.profiles 与
// userCanAccessProfile 都读取 user_profiles；生产路由可注入后者，测试注入同形回调。
// 无 ctx.state.user 表示未启用鉴权的本地部署，保留既有全量语义。

export interface ProfileAccessUser {
  id: number | string
  username?: string
  role?: string
  profiles?: string[]
}

export interface ProfileAccessDeps {
  canAccessProfile: (user: ProfileAccessUser, profile: string) => boolean
}

/** 未启用鉴权与 super_admin 全通；已认证普通用户缺授权面时 fail closed。 */
export function canUserAccessProfile(
  user: ProfileAccessUser | null | undefined,
  profile: string,
  deps?: ProfileAccessDeps,
): boolean {
  if (!user) return true
  if (user.role === 'super_admin') return true
  const name = profile.trim() || 'default'
  if (deps?.canAccessProfile) return deps.canAccessProfile(user, name)
  if (Array.isArray(user.profiles)) return user.profiles.includes(name)
  return false
}
