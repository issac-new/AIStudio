import { createHash } from 'node:crypto'
import {
  evaluateIdentityBinding,
  normalizeIssuerOrigin,
} from '../../../platform/contracts/identity'

export type MatrixAccountStatus = 'active' | 'disabled'
export type MatrixAccountRole = 'admin' | 'super_admin'

export interface MatrixAccount {
  id: number
  username: string
  role: MatrixAccountRole
  status: MatrixAccountStatus
  matrix_user_id: string | null
  matrix_homeserver_url: string | null
  matrix_display_name?: string | null
  matrix_avatar_url?: string | null
  auth_source?: 'local' | 'matrix'
  created_at?: number
  updated_at?: number
  last_login_at?: number | null
}

export interface MatrixPresentation {
  matrixAccessToken: string
  matrixUserId: string
  homeserverUrl: string
  deviceId?: string
  matrixInfo?: {
    displayName?: string
    avatarUrl?: string
  } | null
}

export interface MatrixIdentityDeps {
  findByMatrixUserId(matrixUserId: string): MatrixAccount | null
  createFromMatrix(data: {
    matrixUserId: string
    username: string
    displayName: string
    avatarUrl: string
    homeserverUrl: string
    role: MatrixAccountRole
    status?: MatrixAccountStatus
  }): MatrixAccount | null
  listUserProfiles(userId: number): unknown[]
  syncMatrixMetadata(userId: number, data: {
    displayName?: string
    avatarUrl?: string
    lastLoginAt?: number
  }): unknown
  saveMatrixSession(session: {
    homeserverUrl: string
    userId: string
    accessToken: string
    deviceId?: string
  }): void
  issueUserJwt(user: MatrixAccount): Promise<string>
}

export type MatrixProvisioningResult =
  | { kind: 'active'; status: 'active'; token: string; user: MatrixAccount }
  | {
      kind: 'pending'
      status: MatrixAccountStatus
      code: 'ACCOUNT_PENDING_ACTIVATION' | 'PROFILE_GRANT_REQUIRED'
      user: MatrixAccount
    }
  | { kind: 'conflict'; code: string; user: MatrixAccount }

function uniqueUsername(localpart: string, issuerOrigin: string, matrixUserId: string): string {
  const safeLocalpart = localpart.replace(/[^A-Za-z0-9._=-]/g, '_').slice(0, 48) || 'matrix'
  const digest = createHash('sha256').update(`${issuerOrigin}\n${matrixUserId}`).digest('hex').slice(0, 12)
  return `${safeLocalpart}-${digest}`
}

/**
 * 供应已通过 Matrix token 校验的身份。SSRF 校验由控制器在调用前完成；
 * 本函数只接受其规范化 origin，不在授权前写 session、profile 或成功登录时间。
 */
export async function provisionMatrixIdentity(
  presentation: MatrixPresentation,
  deps: MatrixIdentityDeps,
): Promise<MatrixProvisioningResult> {
  const safeOrigin = normalizeIssuerOrigin(presentation.homeserverUrl)
  const { matrixUserId } = presentation
  const localpart = matrixUserId.replace(/^@/, '').split(':')[0]
  let user = deps.findByMatrixUserId(matrixUserId)

  if (!user) {
    user = deps.createFromMatrix({
      matrixUserId,
      username: uniqueUsername(localpart, safeOrigin, matrixUserId),
      displayName: presentation.matrixInfo?.displayName || localpart,
      avatarUrl: presentation.matrixInfo?.avatarUrl || '',
      homeserverUrl: safeOrigin,
      role: 'admin',
      status: 'disabled',
    })
  }
  if (!user) throw new Error('Failed to provision Matrix identity')

  let binding: ReturnType<typeof evaluateIdentityBinding>
  try {
    binding = evaluateIdentityBinding(
      { issuerOrigin: user.matrix_homeserver_url, subject: user.matrix_user_id || matrixUserId },
      { issuerOrigin: safeOrigin, subject: matrixUserId },
    )
  } catch {
    return { kind: 'conflict', code: 'MATRIX_IDENTITY_CONFLICT', user }
  }
  if (!binding.allowed) {
    const code = 'code' in binding ? binding.code : 'MATRIX_IDENTITY_CONFLICT'
    return { kind: 'conflict', code, user }
  }

  if (user.status !== 'active') {
    return { kind: 'pending', status: user.status, code: 'ACCOUNT_PENDING_ACTIVATION', user }
  }
  if (user.role !== 'super_admin' && deps.listUserProfiles(user.id).length === 0) {
    return { kind: 'pending', status: user.status, code: 'PROFILE_GRANT_REQUIRED', user }
  }

  deps.syncMatrixMetadata(user.id, {
    displayName: presentation.matrixInfo?.displayName || undefined,
    avatarUrl: presentation.matrixInfo?.avatarUrl || undefined,
    lastLoginAt: Date.now(),
  })
  user = deps.findByMatrixUserId(matrixUserId) || user
  try {
    deps.saveMatrixSession({
      homeserverUrl: safeOrigin,
      userId: matrixUserId,
      accessToken: presentation.matrixAccessToken,
      deviceId: presentation.deviceId,
    })
  } catch (error: any) {
    console.warn('[matrix] persist matrix session failed:', error?.message || error)
  }
  const token = await deps.issueUserJwt(user)
  return { kind: 'active', status: 'active', token, user }
}
