import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getApiKey, setApiKey, clearApiKey, getMatrixCredentials, clearMatrixCredentials, storeMatrixCredentials } from '@/api/client'
import { matrixSdkLogin, hermesMatrixLogin, loginWithPassword, fetchCurrentUser } from '@/api/studio/auth'
import type { CurrentUser } from '@/api/studio/auth'

export interface UnifiedUser {
  id: number
  username: string
  matrixUserId: string | null
  displayName: string
  avatarUrl: string | null
  role: 'super_admin' | 'admin'
  authSource: 'local' | 'matrix'
  homeserverUrl: string | null
  profiles: string[]
  defaultProfile: string | null
  status: string
  requiresCredentialChange: boolean
}

export const useAuthStore = defineStore('hermes-auth', () => {
  const user = ref<UnifiedUser | null>(null)
  const hermesToken = ref<string | null>(getApiKey())
  const matrixToken = ref<string | null>(getMatrixCredentials()?.accessToken || null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const isLoggedIn = computed(() => !!hermesToken.value && !!user.value)
  const isMatrixLoggedIn = computed(() => !!matrixToken.value)
  const isSuperAdmin = computed(() => user.value?.role === 'super_admin')

  async function matrixLogin(homeserverUrl: string, username: string, password: string) {
    isLoading.value = true
    error.value = null
    try {
      // 1. Login to Matrix homeserver
      const matrixCreds = await matrixSdkLogin(homeserverUrl, username, password)
      matrixToken.value = matrixCreds.accessToken

      // 2. Login to Hermes backend with Matrix credentials
      const hermesRes = await hermesMatrixLogin(
        matrixCreds.accessToken,
        matrixCreds.userId,
        matrixCreds.deviceId,
        matrixCreds.homeserverUrl
      )
      hermesToken.value = hermesRes.token
      setApiKey(hermesRes.token)

      // Persist Matrix credentials so Matrix Chat can access them
      storeMatrixCredentials(matrixCreds)

      // 3. Build unified user
      user.value = buildUnifiedUser(hermesRes.user)
    } catch (err: any) {
      error.value = err.message || 'Login failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // C2 自动登录：读本机 gateway 的 Matrix access_token 免密建立会话（matrix-login 本就收
  // access_token 而非密码）。无 gateway 凭据或失败返回 false，登录页回落手动登录。
  async function autoLoginFromGateway(): Promise<boolean> {
    error.value = null
    try {
      const res = await fetch('/api/matrix/gateway-credentials')
      if (!res.ok) return false
      const g = await res.json() as { configured?: boolean; homeserverUrl?: string; accessToken?: string; userId?: string }
      if (!g?.configured || !g.accessToken || !g.userId || !g.homeserverUrl) return false
      isLoading.value = true
      matrixToken.value = g.accessToken
      const hermesRes = await hermesMatrixLogin(g.accessToken, g.userId, '', g.homeserverUrl)
      hermesToken.value = hermesRes.token
      setApiKey(hermesRes.token)
      storeMatrixCredentials({ homeserverUrl: g.homeserverUrl, accessToken: g.accessToken, userId: g.userId, deviceId: '' })
      user.value = buildUnifiedUser(hermesRes.user)
      return true
    } catch {
      return false
    } finally {
      isLoading.value = false
    }
  }
  async function localLogin(username: string, password: string) {
    isLoading.value = true
    error.value = null
    try {
      // v0.6.35 起 loginWithPassword 返回 LoginResponse（含 userId/theme）
      const session = await loginWithPassword(username, password)
      hermesToken.value = session.token
      setApiKey(session.token)
      // 激活用户主题（上游 v0.6.35 新增 per-user theme）
      try {
        const { useTheme } = await import('@/composables/useTheme')
        useTheme().activateUserTheme(session.userId, session.theme)
      } catch { /* theme 不可用时静默 */ }

      const current = await fetchCurrentUser()
      user.value = buildUnifiedUser(current)
      matrixToken.value = null
    } catch (err: any) {
      error.value = err.message || 'Login failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function fetchUser() {
    if (!hermesToken.value) return
    try {
      const current = await fetchCurrentUser()
      user.value = buildUnifiedUser(current)
    } catch {
      user.value = null
    }
  }

  function logout() {
    user.value = null
    hermesToken.value = null
    matrixToken.value = null
    // 手动登出标记：LoginView 据此跳过 C2 自动登录，避免退出后立即被 gateway 账号拉回。
    try { sessionStorage.setItem('hermes_manual_logout', '1') } catch { /* SSR/隐私模式降级 */ }
    clearApiKey()
    clearMatrixCredentials()
  }

  function buildUnifiedUser(apiUser: CurrentUser): UnifiedUser {
    return {
      id: apiUser.id,
      username: apiUser.username,
      matrixUserId: apiUser.matrix_user_id || null,
      displayName: apiUser.matrix_display_name || apiUser.username,
      avatarUrl: apiUser.matrix_avatar_url || null,
      role: apiUser.role,
      authSource: apiUser.auth_source || 'local',
      homeserverUrl: apiUser.matrix_homeserver_url || null,
      profiles: [], // Fetched separately
      defaultProfile: null,
      status: apiUser.status,
      requiresCredentialChange: apiUser.requiresCredentialChange || false,
    }
  }

  return {
    user,
    hermesToken,
    matrixToken,
    isLoading,
    error,
    isLoggedIn,
    isMatrixLoggedIn,
    isSuperAdmin,
    matrixLogin,
    autoLoginFromGateway,
    localLogin,
    fetchUser,
    logout,
  }
})