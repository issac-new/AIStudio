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
 * 默认允许 http + 私有 IP（内网/自建 homeserver 场景）。
 *
 * 所有出站请求必须用本函数返回的 origin 拼接路径，避免原始字符串与
 * DNS 解析结果不一致（缓解 SSRF + DNS rebinding）。
 *
 * @throws UnsafeUrlError 当 URL 不安全（非法协议、userinfo 等）
 */
export async function safeMatrixOrigin(homeserverUrl: string, allowHttp = true): Promise<string> {
  return assertSafeOutboundUrl(homeserverUrl, { allowHttp, allowPrivateIp: true })
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
  homeserverUrl: string,
  displayName?: string
): Promise<boolean> {
  try {
    const origin = await safeMatrixOrigin(homeserverUrl)
    // PUT v2/users = admin-token 建号/改号正道（create-or-update，新建 201/更新 200，幂等）。
    // 勿回退 v1/register：那是共享密钥端点（需 GET nonce + HMAC mac），仅带 Bearer 必 400
    // ——2026-10-06 前实为此形态：账号从未真建、调用方又忽略返回值=假成功
    // （govprobe/r31probe 双复现：roster 已提交而 synapse 无此号）。
    const res = await fetch(`${origin}/_synapse/admin/v2/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        password,
        admin: false,
        deactivated: false,
        ...(displayName ? { displayname: displayName } : {}),
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

/**
 * 账号状态探测（v2 users GET）：'missing'（404）|'active'|'deactivated'。
 * 403 等鉴权失败必须炸出来（带 HTTP 状态）——调用方拿它区分「无此号」与
 * 「权限不足」，前者跳过、后者不得静默（offboard 空数组静默成功实锤的根治面）。
 */
export async function getMatrixUserState(
  userId: string,
  adminToken: string,
  homeserverUrl: string
): Promise<'active' | 'deactivated' | 'missing'> {
  const origin = await safeMatrixOrigin(homeserverUrl)
  const res = await fetch(`${origin}/_synapse/admin/v2/users/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  if (res.status === 404) return 'missing'
  if (!res.ok) {
    throw new Error(`用户状态探测失败（HTTP ${res.status}）：${userId}——检查 adminToken 是否为服务端管理员`)
  }
  const body = await res.json().catch(() => ({} as { deactivated?: boolean }))
  return body?.deactivated ? 'deactivated' : 'active'
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
