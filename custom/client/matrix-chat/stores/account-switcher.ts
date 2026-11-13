// 账号切换编排（spec 2026-11-13 matrix-account-switch）。
// 一键切换 = 三步纯数据动作（无进程重启，D1）：token 换 JWT → 档位联动（仅档位账号）
// → 写活跃凭据后整页 reload（所有 store 从新凭据重建，D7）。
// 两类账号来源（统一列表，UI 层合并）：
//   profile 档位账号——GET /api/matrix/gateway-credentials?profile= 按名取档位三元组，
//     切换时联动 PUT /api/hermes/profiles/active（requireSuperAdmin；非超管 403 降级为
//     「身份已切、档位未切」提示，不阻断——档位账号多为团队成员身份，切过去再切回
//     靠 vault 手动账号，不构成死锁）；
//   manual 手动账号——vault 取留底凭据直切，不动档位。
// 顺序约束（D2）：先 matrix-login 后切档位——登录失败（401 失效/403 待激活/409 冲突）
// 时档位与本地凭据均未被触动；登录成功而档位切换失败的残余由重试幂等修复。
import { setApiKey } from '@/api/client'
import {
  getVaultAccount,
  matrixSdkLogin,
  removeVaultAccount,
  storeMatrixCredentials,
  type MatrixCredentials,
} from './matrix-credentials'

/** token 已失效（matrix-login 401）——调用方提示重登；manual 项已从 vault 清除。 */
export class StaleTokenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StaleTokenError'
  }
}

/** 账号待激活/待授权（matrix-login 403）——身份未建立，本地状态零改动。 */
export class PendingAccountError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PendingAccountError'
  }
}

/** 档位未配置 Matrix 凭据（gateway-credentials?profile= 404）。 */
export class ProfileNotConfiguredError extends Error {
  constructor(profile: string) {
    super(`档位 ${profile} 未配置 Matrix 凭据（.env 三件套不全）`)
    this.name = 'ProfileNotConfiguredError'
  }
}

/** matrix-login 响应里的 user 投影（仅取 vault 元数据所需字段）。 */
interface MatrixLoginUser {
  matrix_display_name?: string | null
  matrix_avatar_url?: string | null
}

interface MatrixLoginResponse {
  token: string
  user: MatrixLoginUser
}

/** 切换结果（reload 前的最终态，供 UI/测试断言；reload 动作由调用方或本模块收尾）。 */
export interface SwitchAccountResult {
  userId: string
  /** 档位联动结果：done=已切；skipped_forbidden=权限不足未切（非超管）；manual 路径恒 done */
  profileSwitch: 'done' | 'skipped_forbidden'
  profile?: string
}

/** POST /api/auth/matrix-login 的最小本地封装（不依赖 vendor patch 面导出，自包含便于测试）。 */
async function matrixLoginByToken(creds: MatrixCredentials): Promise<MatrixLoginResponse> {
  const { deploymentUrl } = await import('@/utils/deployment-url')
  const res = await fetch(deploymentUrl('/api/auth/matrix-login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      matrixAccessToken: creds.accessToken,
      matrixUserId: creds.userId,
      deviceId: creds.deviceId || '',
      homeserverUrl: creds.homeserverUrl,
    }),
  })
  if (res.status === 401) {
    throw new StaleTokenError('Matrix 凭据已失效，请重新登录该账号')
  }
  if (res.status === 403) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new PendingAccountError(data.error || '账号待激活或待授权，无法一键切换')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(data.error || `matrix-login 失败（${res.status}）`)
  }
  return await res.json() as MatrixLoginResponse
}

/**
 * GET /api/matrix/gateway-credentials?profile=<name>——按名取档位凭据（批二 D8 双形态）：
 * kind=token 直用；kind=password 先 matrixSdkLogin 密码换 token（客户端既有能力，
 * 与登录表单同函数，服务端不做密码代登——D9）。密码错误映射 StaleTokenError
 * （提示更新 .env 的 MATRIX_PASSWORD）；此处抛的 StaleTokenError 在
 * switchToProfileAccount 的 try 块之外，不会被外层再包一层档位文案。
 */
interface ProfileCredentialsResponse {
  configured?: boolean
  kind?: 'token' | 'password'
  homeserverUrl?: string
  userId?: string
  accessToken?: string
  password?: string
}

async function fetchProfileCredentials(profile: string): Promise<MatrixCredentials> {
  const { deploymentUrl } = await import('@/utils/deployment-url')
  const res = await fetch(deploymentUrl(`/api/matrix/gateway-credentials?profile=${encodeURIComponent(profile)}`))
  if (res.status === 404) throw new ProfileNotConfiguredError(profile)
  if (res.status === 400) throw new ProfileNotConfiguredError(profile)
  if (!res.ok) throw new Error(`读取档位凭据失败（${res.status}）`)
  const g = await res.json() as ProfileCredentialsResponse
  if (!g?.configured || !g.userId || !g.homeserverUrl) {
    throw new ProfileNotConfiguredError(profile)
  }
  if (g.kind === 'password') {
    if (!g.password) throw new ProfileNotConfiguredError(profile)
    // m.id.user 收 localpart（synapse 兼容全 mxid，取 localpart 与 mx-lib 约定一致）
    const localpart = g.userId.replace(/^@/, '').split(':')[0]
    try {
      return await matrixSdkLogin(g.homeserverUrl, localpart, g.password)
    } catch {
      throw new StaleTokenError(`档位 ${profile} 的 Matrix 密码已失效，请更新该档位 .env 的 MATRIX_PASSWORD`)
    }
  }
  if (!g.accessToken) throw new ProfileNotConfiguredError(profile)
  // deviceId 空串与网关免密链同口径（matrix-client opts 侧 falsy 跳过）
  return { homeserverUrl: g.homeserverUrl, accessToken: g.accessToken, userId: g.userId, deviceId: '' }
}

/** PUT /api/hermes/profiles/active（档位联动）。返回是否成功；403 权限不足走降级语义。 */
async function switchActiveProfile(profile: string): Promise<boolean> {
  const { deploymentUrl } = await import('@/utils/deployment-url')
  const res = await fetch(deploymentUrl('/api/hermes/profiles/active'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    // api_key 随请求中间件注入（requireSuperAdmin 校验当前登录身份）
    body: JSON.stringify({ name: profile }),
  })
  return res.ok
}

/** 切换收尾：写活跃凭据（自动入仓）+ JWT + 清手动登出标记。 */
function commitSwitch(
  creds: MatrixCredentials,
  jwt: string,
  meta: { displayName?: string; avatarUrl?: string; source: 'manual' | 'profile'; profile?: string },
): void {
  setApiKey(jwt)
  // displayName 沿用 vault 既有留底（matrix-login 响应可能为 null，不覆盖已有值）
  storeMatrixCredentials(creds, meta)
  try { sessionStorage.removeItem('hermes_manual_logout') } catch { /* 隐私模式降级 */ }
}

/** 手动 reload（独立函数便于测试注入/跳过）。 */
export function reloadPage(): void {
  window.location.reload()
}

/**
 * 一键切换到 multiplex 档位账号（联动切档位）。
 * 编排：取档位三元组 → matrix-login 换 JWT（失败不动档位不动本地凭据，D2）→
 * 档位联动（403 降级提示不阻断）→ 写活跃凭据入仓 → reload。
 */
export async function switchToProfileAccount(profile: string): Promise<SwitchAccountResult> {
  const creds = await fetchProfileCredentials(profile)
  let login: MatrixLoginResponse
  try {
    login = await matrixLoginByToken(creds)
  } catch (err) {
    // 档位 token 失效无法由前端修复（.env 侧配置），不入 vault 不删仓——直接上抛
    if (err instanceof StaleTokenError) {
      throw new StaleTokenError(`档位 ${profile} 的 Matrix 凭据已失效，请更新该档位 .env 的 MATRIX_ACCESS_TOKEN`)
    }
    throw err
  }

  const profileOk = await switchActiveProfile(profile)

  commitSwitch(creds, login.token, {
    displayName: login.user.matrix_display_name || undefined,
    avatarUrl: login.user.matrix_avatar_url || undefined,
    source: 'profile',
    profile,
  })

  const result: SwitchAccountResult = profileOk
    ? { userId: creds.userId, profileSwitch: 'done', profile }
    : { userId: creds.userId, profileSwitch: 'skipped_forbidden', profile }
  reloadPage()
  return result
}

/**
 * 一键切换到手动登录过的账号（vault 留底，不动档位）。
 * token 失效（401）：删 vault 项后上抛 StaleTokenError——重登会自动再入仓（D3）。
 */
export async function switchToManualAccount(userId: string): Promise<SwitchAccountResult> {
  const entry = getVaultAccount(userId)
  if (!entry) throw new Error('该账号不在本机凭据仓中（可能已被清理），请用密码重新登录')

  const creds: MatrixCredentials = {
    accessToken: entry.accessToken,
    userId: entry.userId,
    deviceId: entry.deviceId,
    homeserverUrl: entry.homeserverUrl,
  }
  let login: MatrixLoginResponse
  try {
    login = await matrixLoginByToken(creds)
  } catch (err) {
    if (err instanceof StaleTokenError) {
      removeVaultAccount(userId)
    }
    throw err
  }

  commitSwitch(creds, login.token, {
    // manual 项保留原留底元数据；matrix-login 响应带回新值时刷新
    displayName: login.user.matrix_display_name || entry.displayName,
    avatarUrl: login.user.matrix_avatar_url || entry.avatarUrl,
    source: 'manual',
  })

  const result: SwitchAccountResult = { userId, profileSwitch: 'done' }
  reloadPage()
  return result
}
