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

export function storeMatrixCredentials(creds: MatrixCredentials): void {
  localStorage.setItem(MATRIX_KEYS.accessToken, creds.accessToken)
  localStorage.setItem(MATRIX_KEYS.userId, creds.userId)
  localStorage.setItem(MATRIX_KEYS.deviceId, creds.deviceId)
  localStorage.setItem(MATRIX_KEYS.homeserverUrl, creds.homeserverUrl)
}

export function getMatrixCredentials(): MatrixCredentials | null {
  const accessToken = localStorage.getItem(MATRIX_KEYS.accessToken)
  const userId = localStorage.getItem(MATRIX_KEYS.userId)
  const deviceId = localStorage.getItem(MATRIX_KEYS.deviceId)
  const homeserverUrl = localStorage.getItem(MATRIX_KEYS.homeserverUrl)
  if (!accessToken || !userId || !deviceId || !homeserverUrl) return null
  return { accessToken, userId, deviceId, homeserverUrl }
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
