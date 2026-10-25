import type { Context } from 'koa'
// overlay[matrix-server-info]: homeserver 口径=server-info 单一事实源（原六处写死 localhost:8008）
import { getMatrixServerInfo } from '../../../custom/matrix/server-info'
import { checkPassword, recordPasswordFailure, recordPasswordSuccess, extractIp, getLockedIps, unlockIp, unlockAll } from '../services/auth/login-limiter'
import {
  createSuperAdmin,
  countActiveSuperAdmins,
  countUsers,
  createFromMatrix,
  createUser,
  deleteUser,
  findByMatrixUserId,
  findUserById,
  findUserByUsername,
  getUserAvatar,
  listUserProfiles,
  listUsers,
  replaceUserProfiles,
  setUserAvatar,
  syncMatrixMetadata,
  updateMatrixUserMetadata,
  updateUser,
  updateUsername,
  updateUserPassword,
  verifyPassword,
  type UserRole,
  type UserRecord,
  type UserStatus,
} from '../public/users'
import { getUserTheme, removeAllUserThemeAssets, toUserThemePayload } from '../services/theme/user-theme'
import { getUserJwtExpiresSeconds, issueAppJwt, issueUserJwt } from '../public/auth'
import { consumeAppAuthorizationCode, upsertAppConnection, type AppConnectionType } from '../services/app-relay/app-connections'
import { listProfileNamesFromDisk } from '../public/profile-config'
import { startOutboundRelayClient, stopOutboundRelayClient } from '../public/global-agent'
// HERMES_CUSTOM[MatrixAuth] BEGIN: Matrix 管理员服务集成
import {
  validateMatrixToken,
  getMatrixUserInfo,
  listMatrixUsers as listMatrixUsersFromServer,
  createMatrixUser as createMatrixUserOnServer,
  resetMatrixUserPassword as resetMatrixUserPasswordOnServer,
  setMatrixUserActive,
  deleteMatrixUser as deleteMatrixUserOnServer,
} from '../../../custom/matrix/admin-service'
// HERMES_CUSTOM[MatrixAuth] END
// HERMES_CUSTOM[SecSsrfGuard] BEGIN: SSRF 防护（登录速率限制函数已由 upstream auth.ts 顶部 import）
import { UnsafeUrlError, assertSafeOutboundUrl } from '../../../custom/security/url-guard'
// HERMES_CUSTOM[SecSsrfGuard] END
// HERMES_CUSTOM[MatrixSessionStore] BEGIN: R1 每日 Brief 投递身份——登录会话本机落盘
import { saveMatrixSession } from '../../../custom/matrix/session-store'
// HERMES_CUSTOM[MatrixSessionStore] END
import { getLanEndpointKind } from '../services/network/lan-discovery'
import { getPublicSystemInfo } from '../public/system-info'
import { config } from '../public/config'

/**
 * GET /api/auth/status
 * Check if username/password login is configured (public).
 */
export async function authStatus(ctx: Context) {
  ctx.body = {
    hasPasswordLogin: true,
    hasUsers: countUsers() > 0,
  }
}

/**
 * GET /api/auth/me
 * Return the authenticated account.
 */
export async function currentUser(ctx: Context) {
  const userId = ctx.state.user?.id
  const username = ctx.state.user?.username
  const role = ctx.state.user?.role

  const user = userId ? findUserById(userId) : null
  if (!user) {
    ctx.status = 404
    ctx.body = { error: 'User not found' }
    return
  }
  ctx.body = {
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      created_at: user.created_at,
      updated_at: user.updated_at,
      last_login_at: user.last_login_at,
      avatar: user.avatar || '',
      // HERMES_CUSTOM[SecNoDefaultCred]: 出厂默认口令已移除，不再存在"未改默认密码"
      // 状态；字段保留（API 契约），恒为 false。
      requiresCredentialChange: false,
      matrix_user_id: user.matrix_user_id,
      matrix_display_name: user.matrix_display_name,
      matrix_avatar_url: user.matrix_avatar_url,
      matrix_homeserver_url: user.matrix_homeserver_url,
      auth_source: user.auth_source,
    },
  }
}

const MAX_AVATAR_BYTES = 500 * 1024

function isValidAvatarPayload(value: unknown): { ok: true; json: string } | { ok: false; error: string } {
  if (!value || typeof value !== 'object') return { ok: false, error: 'Invalid avatar payload' }
  const obj = value as Record<string, unknown>
  const type = obj.type
  if (type !== 'image' && type !== 'default') return { ok: false, error: 'Avatar type must be "image" or "default"' }
  if (type === 'image') {
    if (typeof obj.dataUrl !== 'string' || !obj.dataUrl.startsWith('data:image/')) {
      return { ok: false, error: 'Image avatar must include a dataUrl' }
    }
    if (obj.dataUrl.length > MAX_AVATAR_BYTES) {
      return { ok: false, error: `Avatar image is too large (max ${MAX_AVATAR_BYTES} bytes)` }
    }
  }
  if (obj.seed != null && typeof obj.seed !== 'string') {
    return { ok: false, error: 'Avatar seed must be a string' }
  }
  return { ok: true, json: JSON.stringify(value) }
}

/**
 * GET /api/auth/avatar
 * Return the authenticated user's avatar JSON string.
 */
export async function getMyAvatar(ctx: Context) {
  const userId = ctx.state.user?.id
  if (userId == null) {
    ctx.status = 401
    ctx.body = { error: 'Unauthorized' }
    return
  }
  ctx.body = { avatar: getUserAvatar(userId) }
}

/**
 * PUT /api/auth/avatar
 * Update the authenticated user's avatar. Body: { avatar: <json string> } OR
 * body directly contains the avatar object { type, dataUrl?, seed? }.
 */
export async function updateMyAvatar(ctx: Context) {
  const userId = ctx.state.user?.id
  if (!userId) {
    ctx.status = 401
    ctx.body = { error: 'Unauthorized' }
    return
  }
  const body = ctx.request.body as { avatar?: unknown } & Record<string, unknown>
  // Accept both { avatar: "<json string>" } and a direct avatar object
  const candidate = body && Object.prototype.hasOwnProperty.call(body, 'avatar') ? body.avatar : body
  if (typeof candidate === 'string') {
    if (candidate.length > MAX_AVATAR_BYTES * 2) {
      ctx.status = 400
      ctx.body = { error: 'Avatar string is too large' }
      return
    }
    try {
      const parsed = JSON.parse(candidate)
      const validation = isValidAvatarPayload(parsed)
      if (!validation.ok) {
        ctx.status = 400
        ctx.body = { error: validation.error }
        return
      }
      const ok = setUserAvatar(userId, candidate)
      if (!ok) {
        ctx.status = 500
        ctx.body = { error: 'Failed to save avatar' }
        return
      }
      ctx.body = { success: true, avatar: candidate }
      return
    } catch {
      ctx.status = 400
      ctx.body = { error: 'Avatar string is not valid JSON' }
      return
    }
  }
  const validation = isValidAvatarPayload(candidate)
  if (!validation.ok) {
    ctx.status = 400
    ctx.body = { error: validation.error }
    return
  }
  const ok = setUserAvatar(userId, validation.json)
  if (!ok) {
    ctx.status = 500
    ctx.body = { error: 'Failed to save avatar' }
    return
  }
  ctx.body = { success: true, avatar: validation.json }
}

async function authenticatePasswordUser(
  ctx: Context,
  username: string,
  password: string,
): Promise<{ ok: true; ip: string; user: UserRecord } | { ok: false }> {
  const ip = extractIp(ctx)
  const result = checkPassword(ip)
  if (!result.allowed) {
    ctx.status = result.status
    ctx.body = { error: 'Too many login attempts, please try again later' }
    return { ok: false }
  }

  const existingUserCount = countUsers()
  if (existingUserCount === 0) {
    // HERMES_CUSTOM[SecNoDefaultCred] BEGIN: 空库不再以 admin/123456 引导（安全轮 M8b）。
    // 显式开发门：HERMES_WEB_UI_DEV_BOOTSTRAP=1 时空库首登以提交的凭据建号。
    if (process.env.HERMES_WEB_UI_DEV_BOOTSTRAP === '1' && username && password) {
      const created = createSuperAdmin(username, password)
      if (created) return { ok: true, ip, user: created }
    }
    recordPasswordFailure(ip)
    ctx.status = 401
    ctx.body = {
      error: 'No user accounts exist. Sign in with Matrix, or create one with: hermes-web-ui reset-default-login',
      code: 'NO_USER_ACCOUNTS',
    }
    return { ok: false }
  }
  // HERMES_CUSTOM[SecNoDefaultCred] END
  const user = findUserByUsername(username)

  if (!user || user.status !== 'active' || !verifyPassword(password, user.password_hash)) {
    recordPasswordFailure(ip)
    ctx.status = 401
    ctx.body = { error: 'Invalid username or password' }
    return { ok: false }
  }

  return { ok: true, ip, user }
}

async function passwordLogin(
  ctx: Context,
  username: string,
  password: string,
): Promise<{ ok: true; token: string; user: UserRecord } | { ok: false }> {
  const authentication = await authenticatePasswordUser(ctx, username, password)
  if (!authentication.ok) return authentication
  try {
    const token = await issueUserJwt(authentication.user)
    recordPasswordSuccess(authentication.ip)
    return { ok: true, token, user: authentication.user }
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err?.message || 'Failed to issue login token' }
    return { ok: false }
  }
}

function accessibleProfileNames(user: UserRecord): string[] {
  if (user.role === 'super_admin') return listProfileNamesFromDisk()
  return listUserProfiles(user.id).map(profile => profile.profile_name)
}

/**
 * POST /api/auth/login
 * Authenticate with username/password (public).
 * Returns a user-scoped JWT on success.
 */
export async function login(ctx: Context) {
  const { username, password } = ctx.request.body as { username?: string; password?: string }
  if (!username || !password) {
    ctx.status = 400
    ctx.body = { error: 'Username and password are required' }
    return
  }

  const result = await passwordLogin(ctx, username, password)
  if (!result.ok) return
  ctx.body = {
    token: result.token,
    userId: result.user.id,
    profiles: accessibleProfileNames(result.user),
    theme: toUserThemePayload(getUserTheme(result.user.id)),
  }
}

function normalizeAppLoginField(value: unknown, maxLength: number): string {
  const normalized = String(value || '').trim()
  return normalized.length <= maxLength ? normalized : ''
}

function appConnectionType(ctx: Context): AppConnectionType {
  const requestAddresses = [ctx.ip, ctx.request.ip, ctx.req?.socket?.remoteAddress]
    .map(value => String(value || '').trim().replace(/^::ffff:/, ''))
    .filter(Boolean)
  const forwardedByLocalRelay = requestAddresses.some(value => (
    value === '::1' || value === 'localhost' || value.startsWith('127.')
  ))
  return forwardedByLocalRelay && ctx.get('x-hermes-app-connection').trim().toLowerCase() === 'cloud'
    ? 'cloud'
    : 'lan'
}

/**
 * POST /api/auth/app-login
 * Exchange either a one-time App authorization code or active user credentials
 * for a device-bound App token.
 */
export async function appLogin(ctx: Context) {
  const body = ctx.request.body as Record<string, unknown> | undefined
  const authorizationCode = normalizeAppLoginField(
    body?.authorization_code ?? body?.authorizationCode,
    255,
  )
  const deviceCode = normalizeAppLoginField(body?.device_code ?? body?.deviceCode, 255)
  const deviceName = normalizeAppLoginField(body?.device_name ?? body?.deviceName, 80)
  const deviceBrand = normalizeAppLoginField(body?.device_brand ?? body?.deviceBrand, 80)
  const deviceModel = normalizeAppLoginField(body?.device_model ?? body?.deviceModel, 120)
  const username = normalizeAppLoginField(body?.username ?? body?.account, 80)
  const rawPassword = typeof body?.password === 'string' ? body.password : ''
  const password = rawPassword.length <= 256 ? rawPassword : ''
  const requestedCloudUserId = Number(body?.cloud_user_id ?? body?.cloudUserId)
  const passwordCredentialsProvided = Boolean(username && password)
  if (!deviceCode || !deviceName || (!authorizationCode && !passwordCredentialsProvided)) {
    ctx.status = 400
    ctx.body = {
      error: 'device_code and device_name are required together with authorization_code or username and password',
    }
    return
  }

  let user: UserRecord | null = null
  let authenticatedPasswordIp = ''
  if (authorizationCode) {
    try {
      const authorization = consumeAppAuthorizationCode(authorizationCode, deviceCode)
      user = findUserById(authorization.created_by_user_id)
    } catch (error: any) {
      if (error?.message === 'app_authorization_code_expired') {
        ctx.status = 410
        ctx.body = { error: 'App authorization code has expired' }
        return
      }
      if (error?.message === 'app_authorization_code_used') {
        ctx.status = 409
        ctx.body = { error: 'App authorization code has already been used' }
        return
      }
      ctx.status = 401
      ctx.body = { error: 'Invalid App authorization code' }
      return
    }
  } else {
    const authentication = await authenticatePasswordUser(ctx, username, password)
    if (!authentication.ok) return
    user = authentication.user
    authenticatedPasswordIp = authentication.ip
  }

  if (!user || user.status !== 'active') {
    ctx.status = 403
    ctx.body = { error: 'The authorizing user is disabled or does not exist' }
    return
  }
  const connectionType = appConnectionType(ctx)
  const cloudUserId = connectionType === 'cloud' && Number.isSafeInteger(requestedCloudUserId) && requestedCloudUserId > 0
    ? requestedCloudUserId
    : 0
  if (connectionType === 'cloud' && !cloudUserId) {
    ctx.status = 400
    ctx.body = { error: 'cloud_user_id is required for cloud App connections' }
    return
  }
  const token = await issueAppJwt(user, deviceCode, connectionType)
  if (authenticatedPasswordIp) recordPasswordSuccess(authenticatedPasswordIp)
  const now = Math.floor(Date.now() / 1000)
  const tokenExpiresAt = now + getUserJwtExpiresSeconds()
  const connection = upsertAppConnection({
    deviceCode,
    deviceName,
    deviceBrand,
    deviceModel,
    connectionType,
    userId: user.id,
    cloudUserId,
    token,
    tokenExpiresAt,
    now,
  })
  ctx.body = {
    token,
    userId: user.id,
    profiles: accessibleProfileNames(user),
    theme: toUserThemePayload(getUserTheme(user.id)),
    appConnection: {
      id: connection.id,
      device_code: connection.device_code,
      device_name: connection.device_name,
      device_brand: connection.device_brand,
      device_model: connection.device_model,
      connection_type: connection.connection_type,
      cloud_user_id: connection.cloud_user_id,
      token_expires_at: connection.token_expires_at,
    },
  }
}

function normalizeRelayUrl(input: string): string | null {
  try {
    const url = new URL(input)
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return null
    url.username = ''
    url.password = ''
    return url.toString()
  } catch {
    return null
  }
}

function requestBaseUrl(ctx: Context): string | undefined {
  const host = ctx.get('host').trim()
  if (!host) return undefined
  return `${ctx.protocol || 'http'}://${host}`
}

async function verifyRemoteRelayDeviceCode(deviceCode: string): Promise<boolean> {
  const url = `${config.remoteRelay.url.replace(/\/$/, '')}/global-agent/device/${encodeURIComponent(deviceCode)}`
  const response = await fetch(url, { method: 'GET' })
  return response.ok
}

async function localRelayMachineInfo(url: string) {
  const info = await getPublicSystemInfo()
  return {
    ...info,
    http_port: config.port,
    endpoint_kind: getLanEndpointKind(config.port),
    url,
    relay_url: config.remoteRelay.url,
  }
}

/**
 * POST /api/auth/mcu-login
 * Authenticate with the existing username/password login for an MCU/device.
 * When remote relay is requested or a legacy relay URL is provided, connect this Ekko Studio instance to it.
 * Body: { token, id, account, password, url? }.
 */
export async function microcontrollerLogin(ctx: Context) {
  const {
    token: relayToken,
    url,
    id,
    account,
    password,
    relayMode,
    remote,
    device_code: deviceCode,
  } = ctx.request.body as {
    token?: string
    url?: string
    id?: string
    account?: string
    password?: string
    relayMode?: string
    remote?: boolean
    device_code?: string
  }

  if (!relayToken || !id || !account || !password) {
    ctx.status = 400
    ctx.body = { error: 'token, id, account and password are required' }
    return
  }

  const wantsRemoteRelay = relayMode === 'remote' || remote === true
  const remoteRelayUrl = wantsRemoteRelay ? config.remoteRelay.url : ''
  const relayUrl = typeof url === 'string' && url.trim()
    ? normalizeRelayUrl(url)
    : remoteRelayUrl || null
  if (url && !relayUrl) {
    ctx.status = 400
    ctx.body = { error: 'url must be a valid http, https, ws, or wss URL' }
    return
  }

  const normalizedDeviceCode = typeof deviceCode === 'string' ? deviceCode.trim() : ''
  if (wantsRemoteRelay && !normalizedDeviceCode) {
    ctx.status = 400
    ctx.body = { error: '缺少设备码' }
    return
  }

  const result = await passwordLogin(ctx, account, password)
  if (!result.ok) return

  if (wantsRemoteRelay) {
    try {
      if (!await verifyRemoteRelayDeviceCode(normalizedDeviceCode)) {
        ctx.status = 403
        ctx.body = { error: '非官方设备码' }
        return
      }
    } catch (err: any) {
      ctx.status = 502
      ctx.body = { error: err?.message || '远程设备码校验失败' }
      return
    }
  }

  const connectionId = id.trim()
  const forwardedRemoteMcuLogin = wantsRemoteRelay && ctx.get('x-hermes-relay-forwarded') === 'mcu-socket.io'
  if (!forwardedRemoteMcuLogin) {
    stopOutboundRelayClient(connectionId)
  }
  if (relayUrl && !forwardedRemoteMcuLogin) {
    const relayStartUrl = wantsRemoteRelay && relayUrl === remoteRelayUrl
      ? config.remoteRelay.url
      : relayUrl
    const localBaseUrl = requestBaseUrl(ctx)
    const machineInfo = localBaseUrl ? await localRelayMachineInfo(localBaseUrl) : undefined
    const client = startOutboundRelayClient({
      connectionId,
      relayUrl: relayStartUrl,
      relayToken,
      userToken: result.token,
      instanceId: connectionId,
      ...(normalizedDeviceCode ? { deviceCode: normalizedDeviceCode } : {}),
      ...(localBaseUrl ? { localBaseUrl } : {}),
      ...(machineInfo ? { machineInfo } : {}),
      relayProtocol: wantsRemoteRelay ? 'mcu-socket.io' : 'socket.io',
    })
    if (!client) {
      ctx.status = 400
      ctx.body = { error: 'Failed to start relay client' }
      return
    }
  }

  ctx.body = {
    token: result.token,
    profiles: accessibleProfileNames(result.user),
    relay: {
      connected: Boolean(relayUrl),
      id: connectionId,
      ...(wantsRemoteRelay && relayUrl === remoteRelayUrl ? { remote: true } : {}),
      ...(relayUrl ? { url: relayUrl } : {}),
    },
  }
}

/**
 * POST /api/auth/setup
 * Set up username/password (protected).
 */
export async function setupPassword(ctx: Context) {
  ctx.status = 400
  ctx.body = { error: 'Password login is managed by user accounts' }
}

/**
 * POST /api/auth/change-password
 * Change password (protected).
 */
export async function changePassword(ctx: Context) {
  const { currentPassword, newPassword } = ctx.request.body as { currentPassword?: string; newPassword?: string }
  if (!currentPassword || !newPassword) {
    ctx.status = 400
    ctx.body = { error: 'Current password and new password are required' }
    return
  }
  if (newPassword.length < 6) {
    ctx.status = 400
    ctx.body = { error: 'New password must be at least 6 characters' }
    return
  }

  const userId = ctx.state.user?.id
  const user = userId ? findUserById(userId) : null
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    ctx.status = 400
    ctx.body = { error: 'Current password is incorrect' }
    return
  }

  updateUserPassword(user.id, newPassword)
  ctx.body = { success: true }
}

/**
 * POST /api/auth/change-username
 * Change username (protected).
 */
export async function changeUsername(ctx: Context) {
  const { currentPassword, newUsername } = ctx.request.body as { currentPassword?: string; newUsername?: string }
  if (!currentPassword || !newUsername) {
    ctx.status = 400
    ctx.body = { error: 'Current password and new username are required' }
    return
  }
  if (newUsername.length < 2) {
    ctx.status = 400
    ctx.body = { error: 'Username must be at least 2 characters' }
    return
  }

  const userId = ctx.state.user?.id
  const user = userId ? findUserById(userId) : null
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    ctx.status = 400
    ctx.body = { error: 'Current password is incorrect' }
    return
  }

  const existing = findUserByUsername(newUsername)
  if (existing && existing.id !== user.id) {
    ctx.status = 409
    ctx.body = { error: 'Username already exists' }
    return
  }

  updateUsername(user.id, newUsername)
  ctx.body = { success: true }
}

/**
 * DELETE /api/auth/password
 * Remove username/password login (protected).
 */
export async function removePassword(ctx: Context) {
  ctx.status = 400
  ctx.body = { error: 'Password login cannot be removed for user accounts' }
}

function normalizeRole(value: unknown): UserRole | null {
  return value === 'super_admin' || value === 'admin' ? value : null
}

function normalizeStatus(value: unknown): UserStatus | null {
  return value === 'active' || value === 'disabled' ? value : null
}

function normalizeProfiles(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))]
}

function validateProfiles(profiles: string[]): string | null {
  const available = new Set(listProfileNamesFromDisk())
  const missing = profiles.find(profile => !available.has(profile))
  return missing || null
}

// Helper: get admin token from config or current user
function getMatrixAdminToken(ctx: Context): string | null {
  // For now, use the current user's Matrix accessToken if they are admin
  // In production, this should come from server config
  // TODO: Read from Hermes config system
  return null
}

/**
 * POST /api/auth/matrix-login
 * Authenticate with Matrix accessToken, find/create Hermes user, return JWT.
 */
export async function matrixLogin(ctx: Context) {
  const { matrixAccessToken, matrixUserId, deviceId, homeserverUrl } = ctx.request.body as {
    matrixAccessToken?: string
    matrixUserId?: string
    deviceId?: string
    homeserverUrl?: string
  }

  if (!matrixAccessToken || !matrixUserId || !homeserverUrl) {
    ctx.status = 400
    ctx.body = { error: 'Matrix accessToken, userId, and homeserverUrl are required' }
    return
  }

  // HERMES_CUSTOM[SecSsrfGuard] BEGIN: 登录速率限制 + SSRF 预校验
  // matrix-login 是公开路由（authPublicRoutes），复用 passwordLogin 同款 IP 速率限制，
  // 阻止暴力枚举 Matrix token；并在出站前预校验 homeserverUrl，拒绝指向
  // 私有/回环/链路本地地址（防 SSRF 探测内网与云元数据、防 token 外泄到攻击者服务器）。
  const ssrfIp = extractIp(ctx)
  const ssrfLimit = checkPassword(ssrfIp)
  if (!ssrfLimit.allowed) {
    ctx.status = ssrfLimit.status
    ctx.body = { error: 'Too many login attempts, please try again later' }
    return
  }
  let safeOrigin: string
  try {
    // Matrix token 经 Bearer 发往 homeserver；允许 http + 私有 IP（内网/自建 homeserver 场景）。
    safeOrigin = await assertSafeOutboundUrl(homeserverUrl, { allowHttp: true, allowPrivateIp: true })
  } catch (err) {
    recordPasswordFailure(ssrfIp)
    ctx.status = 400
    ctx.body = { error: err instanceof UnsafeUrlError ? err.message : 'Invalid homeserver URL' }
    return
  }
  // HERMES_CUSTOM[SecSsrfGuard] END

  // 1. Validate the Matrix token
  const validation = await validateMatrixToken(matrixAccessToken, safeOrigin)
  if (!validation || validation.userId !== matrixUserId) {
    recordPasswordFailure(ssrfIp)
    ctx.status = 401
    ctx.body = { error: 'Invalid Matrix access token' }
    return
  }

  // 2. Get user info from Matrix (including admin status)
  // Use the user's own token to check their profile; admin status requires admin token
  const matrixInfo = await getMatrixUserInfo(matrixUserId, matrixAccessToken, safeOrigin)

  // 3. Find or create Hermes user
  let user = findByMatrixUserId(matrixUserId)
  const now = Date.now()

  if (!user) {
    const localpart = matrixUserId.replace(/^@/, '').split(':')[0]
    // HERMES_CUSTOM[MuxScopedGrant]: 自动建号不再授予 super_admin（多用户收敛为 admin）
    const role = 'admin'
    user = createFromMatrix({
      matrixUserId,
      username: localpart,
      displayName: matrixInfo?.displayName || localpart,
      avatarUrl: matrixInfo?.avatarUrl || '',
      homeserverUrl: safeOrigin,
      role,
    })
    if (user) {
      // HERMES_CUSTOM[MuxScopedGrant]: 授权收敛——只授本账号同名 profile（找不到则
      // default）。多路复用多用户下每个 matrix 账号只见自己的档案，不再全量授权。
      const allProfiles = listProfileNamesFromDisk()
      const own = allProfiles.includes(localpart) ? localpart : 'default'
      replaceUserProfiles(user.id, [own], own)
      user = findByMatrixUserId(matrixUserId)
    }
  } else {
    // Update cached metadata
    syncMatrixMetadata(user.id, {
      displayName: matrixInfo?.displayName || undefined,
      avatarUrl: matrixInfo?.avatarUrl || undefined,
      lastLoginAt: now,
    })
    // HERMES_CUSTOM[MuxScopedGrant]: 已存在用户不覆写既有授权——运维授予的多
    // profile 不被下次登录静默裁到 own；仅当授权为空时补 own（最小授权收敛）。
    const localpart = matrixUserId.replace(/^@/, '').split(':')[0]
    const allProfiles = listProfileNamesFromDisk()
    const own = allProfiles.includes(localpart) ? localpart : 'default'
    if (listUserProfiles(user.id).length === 0) {
      replaceUserProfiles(user.id, [own], own)
    }
    user = findByMatrixUserId(matrixUserId)
  }

  if (!user) {
    ctx.status = 500
    ctx.body = { error: 'Failed to create or update user record' }
    return
  }

  // HERMES_CUSTOM[MatrixSessionStore] BEGIN: 会话本机落盘（fire-and-forget）
  // token 已校验、用户已绑定——把本次登录会话写入 ~/.hermes-web-ui/matrix-session.json，
  // 作为 R1 每日 Brief 的 Matrix 投递身份（brief-matrix-delivery 消费）。
  // 失败仅 warn 不阻断登录；不落盘只影响 Brief 投递，不影响本请求。
  try {
    saveMatrixSession({ homeserverUrl: safeOrigin, userId: matrixUserId, accessToken: matrixAccessToken, deviceId })
  } catch (err: any) {
    console.warn('[matrix] persist matrix session failed:', err?.message || err)
  }
  // HERMES_CUSTOM[MatrixSessionStore] END

  // 4. Issue Hermes JWT
  try {
    const token = await issueUserJwt(user)
    recordPasswordSuccess(ssrfIp)
    ctx.body = { token, user: {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      matrix_user_id: user.matrix_user_id,
      matrix_display_name: user.matrix_display_name,
      matrix_avatar_url: user.matrix_avatar_url,
      matrix_homeserver_url: user.matrix_homeserver_url,
      auth_source: user.auth_source,
      created_at: user.created_at,
      updated_at: user.updated_at,
      last_login_at: user.last_login_at,
    }}
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err?.message || 'Failed to issue login token' }
  }
}

/**
 * GET /api/auth/matrix-users
 * List Matrix users merged with Hermes metadata.
 */
export async function listMatrixUsers(ctx: Context) {
  const adminToken = getMatrixAdminToken(ctx)
  const homeserverUrl = getMatrixServerInfo().homeserverUrl // overlay[matrix-server-info]: 原 TODO 写死，改单一事实源

  if (!adminToken) {
    // Fallback: return only Hermes users with matrix_user_id
    const hermesUsers = listUsers().filter(u => u.matrix_user_id)
    ctx.body = {
      users: hermesUsers.map(u => ({
        matrix_user_id: u.matrix_user_id,
        display_name: u.matrix_display_name,
        avatar_url: u.matrix_avatar_url,
        role: u.role,
        status: u.status,
        profiles: u.profiles,
        last_login_at: u.last_login_at,
        is_admin: false,
        source: 'hermes',
      })),
      total: hermesUsers.length,
    }
    return
  }

  const matrixResult = await listMatrixUsersFromServer(adminToken, homeserverUrl)
  if (!matrixResult) {
    ctx.status = 503
    ctx.body = { error: 'Failed to fetch users from Matrix homeserver' }
    return
  }

  // Merge with Hermes metadata
  const mergedUsers = matrixResult.users.map((matrixUser: { name: string; displayname: string | null; avatar_url: string | null; is_admin: boolean; deactivated: boolean }) => {
    const hermesUser = findByMatrixUserId(matrixUser.name)
    return {
      matrix_user_id: matrixUser.name,
      display_name: matrixUser.displayname || matrixUser.name.replace(/^@/, '').split(':')[0],
      avatar_url: matrixUser.avatar_url,
      role: hermesUser?.role || (matrixUser.is_admin ? 'super_admin' : 'admin'),
      status: hermesUser?.status || (matrixUser.deactivated ? 'disabled' : 'active'),
      profiles: hermesUser ? listUserProfiles(hermesUser.id).map(p => p.profile_name) : [],
      last_login_at: hermesUser?.last_login_at || null,
      is_admin: matrixUser.is_admin,
      source: 'matrix',
    }
  })

  ctx.body = { users: mergedUsers, total: matrixResult.total }
}

/**
 * POST /api/auth/matrix-users
 * Create a Matrix user and Hermes metadata.
 */
export async function createMatrixUser(ctx: Context) {
  const body = ctx.request.body as {
    userId?: string
    password?: string
    displayName?: string
    role?: unknown
    profiles?: unknown
  }
  const userId = String(body.userId || '').trim()
  const password = String(body.password || '')
  const role = normalizeRole(body.role || 'admin')
  const profiles = normalizeProfiles(body.profiles)

  if (!userId || !password || password.length < 6 || !role) {
    ctx.status = 400
    ctx.body = { error: 'Invalid userId, password (min 6 chars), or role' }
    return
  }

  const adminToken = getMatrixAdminToken(ctx)
  const homeserverUrl = getMatrixServerInfo().homeserverUrl // overlay[matrix-server-info]: 原 TODO 写死，改单一事实源

  if (!adminToken) {
    ctx.status = 503
    ctx.body = { error: 'Matrix admin API not configured' }
    return
  }

  const created = await createMatrixUserOnServer(userId, password, adminToken, homeserverUrl)
  if (!created) {
    ctx.status = 500
    ctx.body = { error: 'Failed to create Matrix user' }
    return
  }

  // Create Hermes record
  const localpart = userId.replace(/^@/, '').split(':')[0]
  const hermesUser = createFromMatrix({
    matrixUserId: userId,
    username: localpart,
    displayName: body.displayName || localpart,
    avatarUrl: '',
    homeserverUrl,
    role,
  })

  if (profiles.length > 0 && hermesUser) {
    replaceUserProfiles(hermesUser.id, profiles, profiles[0])
  }

  ctx.status = 201
  ctx.body = { user: hermesUser }
}

/**
 * PUT /api/auth/matrix-users/:id
 * Update Matrix user (Hermes metadata + Matrix profile).
 */
export async function updateMatrixUser(ctx: Context) {
  const matrixUserId = decodeURIComponent(ctx.params.id)
  const body = ctx.request.body as {
    displayName?: string
    role?: unknown
    status?: unknown
    profiles?: unknown
  }

  const role = body.role == null ? undefined : normalizeRole(body.role)
  const status = body.status == null ? undefined : normalizeStatus(body.status)
  const profiles = body.profiles == null ? undefined : normalizeProfiles(body.profiles)

  const hermesUser = findByMatrixUserId(matrixUserId)
  if (!hermesUser) {
    ctx.status = 404
    ctx.body = { error: 'User not found' }
    return
  }

  // Update Hermes metadata
  if (role !== undefined || status !== undefined) {
    updateMatrixUserMetadata(matrixUserId, { role: role || undefined, status: status || undefined })
  }

  if (profiles !== undefined) {
    replaceUserProfiles(hermesUser.id, profiles, profiles[0] || null)
  }

  // Update Matrix display name if provided
  if (body.displayName) {
    const adminToken = getMatrixAdminToken(ctx)
    const homeserverUrl = hermesUser.matrix_homeserver_url || getMatrixServerInfo().homeserverUrl
    if (adminToken) {
      await fetch(`${homeserverUrl}/_matrix/client/v3/profile/${encodeURIComponent(matrixUserId)}/displayname`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ displayname: body.displayName }),
      })
    }
  }

  ctx.body = { user: findByMatrixUserId(matrixUserId) }
}

/**
 * DELETE /api/auth/matrix-users/:id
 * Delete a Matrix user and Hermes record.
 */
export async function deleteMatrixUser(ctx: Context) {
  const matrixUserId = decodeURIComponent(ctx.params.id)
  const hermesUser = findByMatrixUserId(matrixUserId)

  if (!hermesUser) {
    ctx.status = 404
    ctx.body = { error: 'User not found' }
    return
  }

  if (ctx.state.user?.id === hermesUser.id) {
    ctx.status = 400
    ctx.body = { error: 'You cannot delete your own account' }
    return
  }

  if (hermesUser.role === 'super_admin' && hermesUser.status === 'active' && countActiveSuperAdmins(hermesUser.id) === 0) {
    ctx.status = 400
    ctx.body = { error: 'At least one active super administrator is required' }
    return
  }

  const adminToken = getMatrixAdminToken(ctx)
  const homeserverUrl = hermesUser.matrix_homeserver_url || getMatrixServerInfo().homeserverUrl

  if (adminToken) {
    await deleteMatrixUserOnServer(matrixUserId, adminToken, homeserverUrl)
  }

  deleteUser(hermesUser.id)
  ctx.body = { success: true }
}

/**
 * POST /api/auth/matrix-users/:id/deactivate
 * Activate or deactivate a Matrix user.
 */
export async function deactivateMatrixUser(ctx: Context) {
  const matrixUserId = decodeURIComponent(ctx.params.id)
  const { active } = ctx.request.body as { active?: boolean }

  if (active === undefined) {
    ctx.status = 400
    ctx.body = { error: 'active field is required' }
    return
  }

  const hermesUser = findByMatrixUserId(matrixUserId)
  if (!hermesUser) {
    ctx.status = 404
    ctx.body = { error: 'User not found' }
    return
  }

  if (ctx.state.user?.id === hermesUser.id && !active) {
    ctx.status = 400
    ctx.body = { error: 'You cannot disable your own account' }
    return
  }

  const adminToken = getMatrixAdminToken(ctx)
  const homeserverUrl = hermesUser.matrix_homeserver_url || getMatrixServerInfo().homeserverUrl

  if (adminToken) {
    await setMatrixUserActive(matrixUserId, active, adminToken, homeserverUrl)
  }

  updateMatrixUserMetadata(matrixUserId, { status: active ? 'active' : 'disabled' })
  ctx.body = { success: true }
}

/**
 * POST /api/auth/matrix-users/:id/reset-password
 * Reset a Matrix user's password.
 */
export async function resetMatrixUserPassword(ctx: Context) {
  const matrixUserId = decodeURIComponent(ctx.params.id)
  const { password } = ctx.request.body as { password?: string }

  if (!password || password.length < 6) {
    ctx.status = 400
    ctx.body = { error: 'Password must be at least 6 characters' }
    return
  }

  const hermesUser = findByMatrixUserId(matrixUserId)
  if (!hermesUser) {
    ctx.status = 404
    ctx.body = { error: 'User not found' }
    return
  }

  const adminToken = getMatrixAdminToken(ctx)
  const homeserverUrl = hermesUser.matrix_homeserver_url || getMatrixServerInfo().homeserverUrl

  if (!adminToken) {
    ctx.status = 503
    ctx.body = { error: 'Matrix admin API not configured' }
    return
  }

  const ok = await resetMatrixUserPasswordOnServer(matrixUserId, password, adminToken, homeserverUrl)
  if (!ok) {
    ctx.status = 500
    ctx.body = { error: 'Failed to reset password' }
    return
  }

  ctx.body = { success: true }
}

/**
 * GET /api/auth/users
 * Super admin user management list.
 */
export async function listManagedUsers(ctx: Context) {
  ctx.body = {
    users: listUsers(),
    profiles: listProfileNamesFromDisk(),
  }
}

/**
 * POST /api/auth/users
 * Create a user account. Super admin only.
 */
export async function createManagedUser(ctx: Context) {
  const body = ctx.request.body as {
    username?: string
    password?: string
    role?: unknown
    status?: unknown
    profiles?: unknown
    defaultProfile?: string | null
  }
  const username = String(body.username || '').trim()
  const password = String(body.password || '')
  const role = normalizeRole(body.role || 'admin')
  const status = normalizeStatus(body.status || 'active')
  const profiles = normalizeProfiles(body.profiles)

  if (username.length < 2) {
    ctx.status = 400
    ctx.body = { error: 'Username must be at least 2 characters' }
    return
  }
  if (password.length < 6) {
    ctx.status = 400
    ctx.body = { error: 'Password must be at least 6 characters' }
    return
  }
  if (!role || !status) {
    ctx.status = 400
    ctx.body = { error: 'Invalid role or status' }
    return
  }
  if (findUserByUsername(username)) {
    ctx.status = 409
    ctx.body = { error: 'Username already exists' }
    return
  }

  const missingProfile = validateProfiles(profiles)
  if (missingProfile) {
    ctx.status = 400
    ctx.body = { error: `Profile "${missingProfile}" does not exist` }
    return
  }

  const user = createUser({
    username,
    password,
    role,
    status,
    profiles: role === 'super_admin' ? [] : profiles,
    defaultProfile: body.defaultProfile,
  })
  ctx.status = 201
  ctx.body = { user, users: listUsers() }
}

/**
 * PUT /api/auth/users/:id
 * Update user account metadata, password, and profile bindings.
 */
export async function updateManagedUser(ctx: Context) {
  const id = Number(ctx.params.id)
  const user = Number.isInteger(id) ? findUserById(id) : null
  if (!user) {
    ctx.status = 404
    ctx.body = { error: 'User not found' }
    return
  }

  const body = ctx.request.body as {
    username?: string
    password?: string
    role?: unknown
    status?: unknown
    profiles?: unknown
    defaultProfile?: string | null
  }
  const username = body.username == null ? undefined : String(body.username).trim()
  const password = body.password == null ? undefined : String(body.password)
  const role = body.role == null ? undefined : normalizeRole(body.role)
  const status = body.status == null ? undefined : normalizeStatus(body.status)
  const profiles = body.profiles == null ? undefined : normalizeProfiles(body.profiles)

  if (username !== undefined && username.length < 2) {
    ctx.status = 400
    ctx.body = { error: 'Username must be at least 2 characters' }
    return
  }
  if (password !== undefined && password.length > 0 && password.length < 6) {
    ctx.status = 400
    ctx.body = { error: 'Password must be at least 6 characters' }
    return
  }
  if (body.role != null && !role || body.status != null && !status) {
    ctx.status = 400
    ctx.body = { error: 'Invalid role or status' }
    return
  }
  if (username && username !== user.username) {
    const existing = findUserByUsername(username)
    if (existing && existing.id !== user.id) {
      ctx.status = 409
      ctx.body = { error: 'Username already exists' }
      return
    }
  }

  const nextRole = role || user.role
  const nextStatus = status || user.status
  const currentUserId = ctx.state.user?.id
  if (user.id === currentUserId && nextStatus !== 'active') {
    ctx.status = 400
    ctx.body = { error: 'You cannot disable your own account' }
    return
  }
  if (user.role === 'super_admin' && user.status === 'active' && (nextRole !== 'super_admin' || nextStatus !== 'active') && countActiveSuperAdmins(user.id) === 0) {
    ctx.status = 400
    ctx.body = { error: 'At least one active super administrator is required' }
    return
  }

  if (profiles) {
    const missingProfile = validateProfiles(profiles)
    if (missingProfile) {
      ctx.status = 400
      ctx.body = { error: `Profile "${missingProfile}" does not exist` }
      return
    }
  }

  updateUser({
    userId: user.id,
    username,
    password: password || undefined,
    role: role || undefined,
    status: status || undefined,
    profiles: nextRole === 'super_admin' ? [] : profiles,
    defaultProfile: body.defaultProfile,
  })
  ctx.body = { user: findUserById(user.id), users: listUsers() }
}

/**
 * DELETE /api/auth/users/:id
 * Delete a user account. Super admin only.
 */
export async function deleteManagedUser(ctx: Context) {
  const id = Number(ctx.params.id)
  const user = Number.isInteger(id) ? findUserById(id) : null
  if (!user) {
    ctx.status = 404
    ctx.body = { error: 'User not found' }
    return
  }

  if (ctx.state.user?.id === user.id) {
    ctx.status = 400
    ctx.body = { error: 'You cannot delete your own account' }
    return
  }
  if (user.role === 'super_admin' && user.status === 'active' && countActiveSuperAdmins(user.id) === 0) {
    ctx.status = 400
    ctx.body = { error: 'At least one active super administrator is required' }
    return
  }

  await removeAllUserThemeAssets(user.id)
  deleteUser(user.id)
  ctx.body = { success: true, users: listUsers() }
}

/**
 * GET /api/auth/locked-ips
 * List all currently locked IPs (protected).
 */
export async function listLockedIps(ctx: Context) {
  const locks = getLockedIps()
  ctx.body = { locks }
}

/**
 * DELETE /api/auth/locked-ips?ip=xxx
 * Unlock a specific IP. No ip param = unlock all.
 */
export async function unlockIpHandler(ctx: Context) {
  const ip = ctx.query.ip as string
  if (ip) {
    const found = unlockIp(ip)
    if (!found) {
      ctx.status = 404
      ctx.body = { error: 'IP not locked' }
      return
    }
    ctx.body = { success: true }
    return
  }
  // No IP specified — unlock all
  const count = unlockAll()
  ctx.body = { success: true, count }
}
