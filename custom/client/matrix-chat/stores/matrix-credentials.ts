// overlay 兼容层：Matrix 凭据 localStorage 语义（原 upstream api/client.ts 导出，
// 2026-09-28 并行 client.ts 重构移除 matrix 段——本模块按 patch 011 原键位复刻，
// 消费方 matrix-client.ts 改从本模块导入；client.ts 恢复导出后可切回）。
export interface MatrixCredentials {
  accessToken: string
  userId: string
  deviceId: string
  homeserverUrl: string
}

const MATRIX_KEYS = {
  accessToken: 'matrix_access_token',
  userId: 'matrix_user_id',
  deviceId: 'matrix_device_id',
  homeserverUrl: 'matrix_homeserver_url',
} as const

export function storeMatrixCredentials(creds: MatrixCredentials, meta?: MatrixVaultMeta): void {
  localStorage.setItem(MATRIX_KEYS.accessToken, creds.accessToken)
  localStorage.setItem(MATRIX_KEYS.userId, creds.userId)
  localStorage.setItem(MATRIX_KEYS.deviceId, creds.deviceId)
  localStorage.setItem(MATRIX_KEYS.homeserverUrl, creds.homeserverUrl)
  // 账号切换器（spec 2026-11-13）：每次写活跃凭据即自动入仓留底——手动登录、
  // 网关免密桥接、账号切换三条路径全覆盖（D3），无需调用方各自记得入仓。
  // meta 缺省 manual（既有调用方语义不变）；切换链带 source/profile/displayName。
  upsertAccountVault(creds, meta)
}

export function getMatrixCredentials(): MatrixCredentials | null {
  const accessToken = localStorage.getItem(MATRIX_KEYS.accessToken)
  const userId = localStorage.getItem(MATRIX_KEYS.userId)
  const deviceId = localStorage.getItem(MATRIX_KEYS.deviceId)
  const homeserverUrl = localStorage.getItem(MATRIX_KEYS.homeserverUrl)
  // 2026-10-31 日常工作台回归批②：deviceId 为协议可选字段，网关免密自动登录链
  // （patch 382 / bridgeCredentialsFromGateway）按设计写空串（matrix-client.ts 头注
  // 「空 deviceId 的 client 走 /sync 正常」，opts 侧已做 falsy 跳过）——校验器不得
  // 因空 deviceId 判无凭据，否则自动登录会话的房间画布恒「未认证」（走查实录）。
  if (!accessToken || !userId || !homeserverUrl) return null
  return { accessToken, userId, deviceId: deviceId ?? '', homeserverUrl }
}

export function clearMatrixCredentials(): void {
  localStorage.removeItem(MATRIX_KEYS.accessToken)
  localStorage.removeItem(MATRIX_KEYS.userId)
  localStorage.removeItem(MATRIX_KEYS.deviceId)
  localStorage.removeItem(MATRIX_KEYS.homeserverUrl)
}

export function hasMatrixCredentials(): boolean {
  return getMatrixCredentials() !== null
}

// ─── 多槽凭据仓（vault，spec 2026-11-13 matrix-account-switch）─────────────
// 活跃凭据仍是上方单槽四键（现有消费者零改动）；本仓是旁路留底，记录本机登录过的
// 每个账号，供账号切换器一键回切。登出只清活跃槽、不清仓（决策 D3）；token 失效项
// 由切换动作在 matrix-login 401 时删除（重登自动再入仓），不做 stale 标记态。

/** vault localStorage 键（值为 MatrixVaultEntry[] 的 JSON） */
const MATRIX_VAULT_KEY = 'matrix_account_vault'

export type MatrixAccountSource = 'manual' | 'profile'

/** vault 条目：凭据四件套 + 展示元数据 + 来源（manual=手动登录 / profile=档位切换） */
export interface MatrixVaultEntry {
  accessToken: string
  userId: string
  deviceId: string
  homeserverUrl: string
  displayName?: string
  avatarUrl?: string
  source: MatrixAccountSource
  /** source=profile 时的档位名（UI 徽标与档位联动依据） */
  profile?: string
  savedAt: number
}

/** 切换/登录路径入仓时携带的元数据（displayName 从 matrix-login 响应的 user 取） */
export interface MatrixVaultMeta {
  displayName?: string
  avatarUrl?: string
  source?: MatrixAccountSource
  profile?: string
}

function parseVault(raw: string | null): MatrixVaultEntry[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((e): e is MatrixVaultEntry =>
      !!e && typeof e === 'object'
      && typeof (e as MatrixVaultEntry).accessToken === 'string' && (e as MatrixVaultEntry).accessToken !== ''
      && typeof (e as MatrixVaultEntry).userId === 'string' && (e as MatrixVaultEntry).userId !== ''
      && typeof (e as MatrixVaultEntry).homeserverUrl === 'string' && (e as MatrixVaultEntry).homeserverUrl !== '')
  } catch {
    return []
  }
}

/** 列出仓内全部账号（按 savedAt 降序——最近使用排前）。畸形 JSON/条目静默剔除。 */
export function listVaultAccounts(): MatrixVaultEntry[] {
  return parseVault(localStorage.getItem(MATRIX_VAULT_KEY))
    .sort((a, b) => b.savedAt - a.savedAt)
}

/** 取指定账号（按 matrix userId 唯一键） */
export function getVaultAccount(userId: string): MatrixVaultEntry | null {
  return parseVault(localStorage.getItem(MATRIX_VAULT_KEY)).find(e => e.userId === userId) ?? null
}

/** upsert 一条账号记录（同 userId 覆盖并刷新 savedAt；deviceId 缺省空串与桥接链同口径）。 */
export function upsertAccountVault(creds: MatrixCredentials, meta: MatrixVaultMeta = {}): MatrixVaultEntry {
  const entry: MatrixVaultEntry = {
    accessToken: creds.accessToken,
    userId: creds.userId,
    deviceId: creds.deviceId ?? '',
    homeserverUrl: creds.homeserverUrl,
    ...(meta.displayName ? { displayName: meta.displayName } : {}),
    ...(meta.avatarUrl ? { avatarUrl: meta.avatarUrl } : {}),
    source: meta.source ?? 'manual',
    ...(meta.profile ? { profile: meta.profile } : {}),
    savedAt: Date.now(),
  }
  const rest = parseVault(localStorage.getItem(MATRIX_VAULT_KEY)).filter(e => e.userId !== creds.userId)
  localStorage.setItem(MATRIX_VAULT_KEY, JSON.stringify([...rest, entry]))
  return entry
}

/** 删除一条账号记录（切换 401 时 token 失效清理；不存在的 userId 静默无操作）。 */
export function removeVaultAccount(userId: string): void {
  const rest = parseVault(localStorage.getItem(MATRIX_VAULT_KEY)).filter(e => e.userId !== userId)
  localStorage.setItem(MATRIX_VAULT_KEY, JSON.stringify(rest))
}

export interface MatrixLoginResult {
  accessToken: string
  userId: string
  deviceId: string
  homeserverUrl: string
}

/** Matrix SDK 密码登录（patch 009 原语义复刻——client.ts 并行重构移除后的兼容面）。 */
export async function matrixSdkLogin(homeserverUrl: string, username: string, password: string): Promise<MatrixLoginResult> {
  const { createClient } = await import('matrix-js-sdk')
  const baseUrl = homeserverUrl.replace(/\/+$/, '')
  const client = createClient({ baseUrl })
  const loginRes = await client.loginWithPassword(username, password)
  return {
    accessToken: loginRes.access_token,
    userId: loginRes.user_id,
    deviceId: loginRes.device_id || '',
    homeserverUrl: baseUrl,
  }
}
