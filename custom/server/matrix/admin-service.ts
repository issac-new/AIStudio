import { assertSafeOutboundUrl, UnsafeUrlError } from '../security/url-guard'

export interface MatrixUserInfo {
  userId: string
  displayName: string
  avatarUrl: string
  isAdmin: boolean
  deactivated: boolean
}

export interface MatrixUserListItem {
  name: string
  displayname: string | null
  avatar_url: string | null
  is_admin: boolean
  deactivated: boolean
}

export interface MatrixUserListResult {
  users: MatrixUserListItem[]
  total: number
}

/**
 * 校验 homeserverUrl 安全性并返回规范化 origin（scheme://host[:port]）。
 * Matrix 登录要求 https，防止 token 明文外泄；本机内网部署可显式传 allowHttp。
 *
 * 所有出站请求必须用本函数返回的 origin 拼接路径，避免原始字符串与
 * DNS 解析结果不一致（缓解 SSRF + DNS rebinding）。
 *
 * @throws UnsafeUrlError 当 URL 不安全（私有/回环/链路本地地址、非法协议等）
 */
export async function safeMatrixOrigin(homeserverUrl: string, allowHttp = false): Promise<string> {
  return assertSafeOutboundUrl(homeserverUrl, { allowHttp })
}

export async function validateMatrixToken(
  accessToken: string,
  homeserverUrl: string
): Promise<{ userId: string; deviceId: string } | null> {
  try {
    const origin = await safeMatrixOrigin(homeserverUrl)
    const res = await fetch(`${origin}/_matrix/client/v3/account/whoami`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const data = await res.json() as { user_id: string; device_id?: string }
    return { userId: data.user_id, deviceId: data.device_id || '' }
  } catch (err) {
    // SSRF 校验失败向上抛出，让调用方区分「URL 不安全」与「token 无效」
    if (err instanceof UnsafeUrlError) throw err
    return null
  }
}

export async function getMatrixUserInfo(
  userId: string,
  adminToken: string,
  homeserverUrl: string
): Promise<MatrixUserInfo | null> {
  try {
    const origin = await safeMatrixOrigin(homeserverUrl)
    // Synapse-specific admin endpoint
    const res = await fetch(`${origin}/_synapse/admin/v1/users/${encodeURIComponent(userId)}/admin`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const isAdmin = res.ok ? (await res.json() as { admin: boolean }).admin : false

    // Get profile info (public endpoint, but use admin token if available)
    const profileRes = await fetch(`${origin}/_matrix/client/v3/profile/${encodeURIComponent(userId)}/displayname`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const displayName = profileRes.ok ? (await profileRes.json() as { displayname: string }).displayname : ''

    const avatarRes = await fetch(`${origin}/_matrix/client/v3/profile/${encodeURIComponent(userId)}/avatar_url`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const avatarUrl = avatarRes.ok ? (await avatarRes.json() as { avatar_url: string }).avatar_url : ''

    return { userId, displayName, avatarUrl, isAdmin, deactivated: false }
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw err
    return null
  }
}

export async function listMatrixUsers(
  adminToken: string,
  homeserverUrl: string,
  from: number = 0,
  limit: number = 100
): Promise<MatrixUserListResult | null> {
  try {
    const origin = await safeMatrixOrigin(homeserverUrl)
    const res = await fetch(`${origin}/_synapse/admin/v2/users?from=${from}&limit=${limit}&guests=false`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    if (!res.ok) return null
    const data = await res.json() as { users: MatrixUserListItem[]; total: number }
    return { users: data.users || [], total: data.total || 0 }
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw err
    return null
  }
}

export async function createMatrixUser(
  userId: string,
  password: string,
  adminToken: string,
  homeserverUrl: string
): Promise<boolean> {
  try {
    const origin = await safeMatrixOrigin(homeserverUrl)
    const res = await fetch(`${origin}/_synapse/admin/v1/register`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: userId.replace(/^@/, '').split(':')[0],
        password,
        admin: false,
        user_type: null,
      }),
    })
    return res.ok
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw err
    return false
  }
}

export async function resetMatrixUserPassword(
  userId: string,
  password: string,
  adminToken: string,
  homeserverUrl: string
): Promise<boolean> {
  try {
    const origin = await safeMatrixOrigin(homeserverUrl)
    const res = await fetch(`${origin}/_synapse/admin/v1/reset_password/${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ new_password: password, logout_devices: true }),
    })
    return res.ok
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw err
    return false
  }
}

export async function setMatrixUserActive(
  userId: string,
  active: boolean,
  adminToken: string,
  homeserverUrl: string
): Promise<boolean> {
  try {
    const origin = await safeMatrixOrigin(homeserverUrl)
    const endpoint = active
      ? `/_synapse/admin/v1/activate/${encodeURIComponent(userId)}`
      : `/_synapse/admin/v1/deactivate/${encodeURIComponent(userId)}`
    const res = await fetch(`${origin}${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    return res.ok
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw err
    return false
  }
}

export async function deleteMatrixUser(
  userId: string,
  adminToken: string,
  homeserverUrl: string
): Promise<boolean> {
  try {
    const origin = await safeMatrixOrigin(homeserverUrl)
    const res = await fetch(`${origin}/_synapse/admin/v1/deactivate/${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ erase: true }),
    })
    return res.ok
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw err
    return false
  }
}
