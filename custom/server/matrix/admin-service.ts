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

export async function validateMatrixToken(
  accessToken: string,
  homeserverUrl: string
): Promise<{ userId: string; deviceId: string } | null> {
  try {
    const res = await fetch(`${homeserverUrl}/_matrix/client/v3/account/whoami`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const data = await res.json() as { user_id: string; device_id?: string }
    return { userId: data.user_id, deviceId: data.device_id || '' }
  } catch {
    return null
  }
}

export async function getMatrixUserInfo(
  userId: string,
  adminToken: string,
  homeserverUrl: string
): Promise<MatrixUserInfo | null> {
  try {
    // Synapse-specific admin endpoint
    const res = await fetch(`${homeserverUrl}/_synapse/admin/v1/users/${encodeURIComponent(userId)}/admin`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const isAdmin = res.ok ? (await res.json() as { admin: boolean }).admin : false

    // Get profile info (public endpoint, but use admin token if available)
    const profileRes = await fetch(`${homeserverUrl}/_matrix/client/v3/profile/${encodeURIComponent(userId)}/displayname`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const displayName = profileRes.ok ? (await profileRes.json() as { displayname: string }).displayname : ''

    const avatarRes = await fetch(`${homeserverUrl}/_matrix/client/v3/profile/${encodeURIComponent(userId)}/avatar_url`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const avatarUrl = avatarRes.ok ? (await avatarRes.json() as { avatar_url: string }).avatar_url : ''

    return { userId, displayName, avatarUrl, isAdmin, deactivated: false }
  } catch {
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
    const res = await fetch(`${homeserverUrl}/_synapse/admin/v2/users?from=${from}&limit=${limit}&guests=false`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    if (!res.ok) return null
    const data = await res.json() as { users: MatrixUserListItem[]; total: number }
    return { users: data.users || [], total: data.total || 0 }
  } catch {
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
    const res = await fetch(`${homeserverUrl}/_synapse/admin/v1/register`, {
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
  } catch {
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
    const res = await fetch(`${homeserverUrl}/_synapse/admin/v1/reset_password/${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ new_password: password, logout_devices: true }),
    })
    return res.ok
  } catch {
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
    const endpoint = active
      ? `/_synapse/admin/v1/activate/${encodeURIComponent(userId)}`
      : `/_synapse/admin/v1/deactivate/${encodeURIComponent(userId)}`
    const res = await fetch(`${homeserverUrl}${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    return res.ok
  } catch {
    return false
  }
}

export async function deleteMatrixUser(
  userId: string,
  adminToken: string,
  homeserverUrl: string
): Promise<boolean> {
  try {
    const res = await fetch(`${homeserverUrl}/_synapse/admin/v1/deactivate/${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ erase: true }),
    })
    return res.ok
  } catch {
    return false
  }
}
