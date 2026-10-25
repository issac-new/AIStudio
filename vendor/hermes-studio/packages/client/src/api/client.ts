import { deploymentBasePath } from '@/utils/deployment-url'
import router from '@/router'
import { invalidateAuth } from './auth-invalidation'

const DEFAULT_BASE_URL = ''
const ACTIVE_PROFILE_STORAGE_KEY = 'hermes_active_profile_name'

function isDesktopShell(): boolean {
  return typeof window !== 'undefined' &&
    (window as typeof window & { hermesDesktop?: { isDesktop?: boolean } }).hermesDesktop?.isDesktop === true
}

export async function ensureDesktopAuthReady(): Promise<void> {
  if (typeof window === 'undefined' || getApiKey()) return
  const bridge = (window as typeof window & {
    hermesDesktop?: { isDesktop?: boolean; ensureAuth?: () => Promise<boolean> }
  }).hermesDesktop
  if (bridge?.isDesktop === true && bridge.ensureAuth) {
    await bridge.ensureAuth().catch(() => false)
  }
}

export function getBaseUrl(): string {
  if (import.meta.env.VITE_HERMES_PREVIEW === '1') return DEFAULT_BASE_URL
  if (isDesktopShell()) return DEFAULT_BASE_URL
  const deploymentBase = deploymentBasePath()
  return localStorage.getItem('hermes_server_url') ||
    (deploymentBase ? `${window.location.origin}${deploymentBase}` : DEFAULT_BASE_URL)
}

export function getApiKey(): string {
  return localStorage.getItem('hermes_api_key') || ''
}

export function setServerUrl(url: string) {
  const previousBase = getBaseUrl()
  localStorage.setItem('hermes_server_url', url)
  if (getBaseUrl() !== previousBase) invalidateAuth()
}

export function setApiKey(key: string) {
  const changed = getApiKey() !== key
  localStorage.setItem('hermes_api_key', key)
  if (changed) invalidateAuth()
}

export function clearApiKey() {
  localStorage.removeItem('hermes_api_key')
  invalidateAuth()
}

function clearAuthSessionState() {
  clearApiKey()
  localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY)
}

export function hasApiKey(): boolean {
  return !!getApiKey()
}

export type StoredUserRole = 'super_admin' | 'admin'

export function getStoredUserRole(): StoredUserRole | null {
  const token = getApiKey()
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const data = JSON.parse(atob(padded)) as { role?: unknown }
    return data.role === 'super_admin' || data.role === 'admin' ? data.role : null
  } catch {
    return null
  }
}

export function isStoredSuperAdmin(): boolean {
  return getStoredUserRole() === 'super_admin'
}

export function getStoredUsername(): string | null {
  const token = getApiKey()
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const data = JSON.parse(atob(padded)) as { username?: unknown }
    return typeof data.username === 'string' && data.username.length > 0 ? data.username : null
  } catch {
    return null
  }
}

export function getStoredUserId(): number | null {
  const token = getApiKey()
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const data = JSON.parse(atob(padded)) as { sub?: unknown }
    const userId = Number(data.sub)
    return Number.isInteger(userId) && userId > 0 ? userId : null
  } catch {
    return null
  }
}

export function getActiveProfileName(): string | null {
  return localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY)
}

// The Models page keeps its filter in the URL; it never changes the active Profile.
export function getModelsPageProfile(): string | null {
  const route = router.currentRoute.value
  return route.name === 'hermes.models' && typeof route.query?.modelProfile === 'string'
    ? route.query.modelProfile.trim() || null
    : null
}

function modelSettingsRequestProfile(path: string): string | null {
  const pathname = path.split('?')[0]
  const isModelSettings = /^\/api\/hermes\/(?:config(?:\/|$)|auth\/|provider-models(?:\/|$)|model-alias$|model-visibility$|custom-model$)/.test(pathname)
    || /^\/api\/studio\/(?:stt|tts)\/(?:settings|local-model)(?:\/|$)/.test(pathname)
    || pathname === '/api/voice/providers/probe'
  return isModelSettings ? getModelsPageProfile() : null
}

function bodyHasProfileSelector(body: BodyInit | null | undefined): boolean {
  if (typeof body !== 'string') return false
  try {
    const parsed = JSON.parse(body) as { profile?: unknown }
    return typeof parsed?.profile === 'string' && parsed.profile.trim().length > 0
  } catch {
    return false
  }
}

function shouldAttachProfileHeader(path: string, options: RequestInit): boolean {
  try {
    const url = new URL(path, 'http://hermes.local')
    if (url.searchParams.has('profile')) return false
    if (url.pathname.startsWith('/api/hermes/profiles')) return false
    if (url.pathname.startsWith('/api/theme')) return false
    if (isProfileWideSessionCollection(url.pathname)) return false
  } catch {
    if (path.startsWith('/api/hermes/profiles')) return false
    if (path.startsWith('/api/theme')) return false
    if (isProfileWideSessionCollection(path.split('?')[0] || path)) return false
  }
  return !bodyHasProfileSelector(options.body)
}

function isProfileWideSessionCollection(pathname: string): boolean {
  return pathname === '/api/studio/sessions' ||
    pathname === '/api/studio/sessions/batch-delete' ||
    pathname === '/api/studio/sessions/hermes' ||
    pathname === '/api/studio/search/sessions' ||
    pathname === '/api/studio/sessions/search' ||
    pathname === '/api/studio/sessions/conversations'
}

export function emitAuthNotice(kind: 'expired' | 'forbidden') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('hermes-auth-notice', { detail: { kind } }))
}

/**
 * Authoritative auth-state recovery: clear the stored token, notify listeners
 * (AuthEventListener shows a toast), and redirect to login. Shared by the REST
 * 401 handler below and by callers that cannot read HTTP status directly
 * (e.g. the kanban WebSocket, whose `onclose` only surfaces code 1006).
 */
export function triggerAuthRecheck() {
  clearAuthSessionState()
  emitAuthNotice('expired')
  if (router.currentRoute.value.name !== 'login') {
    router.replace({ name: 'login' })
  }
}

/**
 * Lightweight REST probe used to authoritatively decide whether a persistent
 * WebSocket failure is an auth problem. Returns `false` only when REST returns
 * a confirmed 401 (auth expired — in which case request() has already cleared
 * the token and redirected to login). Returns `true` when the token is valid
 * (REST 200) OR when the probe itself failed inconclusively (network error,
 * 5xx) — callers should keep retrying the WebSocket in that case rather than
 * force a logout they cannot justify.
 *
 * Use this when a caller observes repeated failures but cannot read HTTP
 * status directly (e.g. the kanban WebSocket, whose `onclose` only surfaces
 * close code 1006).
 */
export async function probeAuthViaRest(): Promise<boolean> {
  try {
    // getCapabilities is a cheap, always-available local BFF endpoint.
    await request('/api/hermes/kanban/capabilities')
    return true
  } catch (err) {
    // Only a 401 counts as an auth verdict. The request() handler throws
    // 'Unauthorized' for 401 (and has already cleared the token + redirected
    // to login). Network errors, 5xx, etc. mean the probe itself failed and
    // say nothing about auth — treat as "inconclusive, not an auth failure"
    // so callers keep retrying the WebSocket instead of forcing logout.
    const msg = err instanceof Error ? err.message : String(err)
    return msg !== 'Unauthorized'
  }
}

function messageFromErrorValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  if (typeof value !== 'object') return String(value)

  const record = value as Record<string, unknown>
  for (const key of ['message', 'error', 'detail', 'description']) {
    const message = messageFromErrorValue(record[key])
    if (message) return message
  }

  if (Array.isArray(value)) {
    return value.map(messageFromErrorValue).filter(Boolean).join('\n')
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function responseErrorMessage(text: string, statusText: string): string {
  const trimmed = text.trim()
  if (!trimmed) return statusText
  try {
    const parsed = JSON.parse(trimmed)
    return messageFromErrorValue(parsed) || trimmed
  } catch {
    return trimmed
  }
}

function responseErrorCode(text: string): string | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  try {
    const parsed = JSON.parse(trimmed) as { code?: unknown }
    return typeof parsed?.code === 'string' && parsed.code ? parsed.code : undefined
  } catch {
    return undefined
  }
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const selectedProfile = modelSettingsRequestProfile(path)
  await ensureDesktopAuthReady()
  const base = getBaseUrl()
  const url = `${base}${path}`
  const isFormDataBody = typeof FormData !== 'undefined' && options.body instanceof FormData
  const headers: Record<string, string> = {
    ...(isFormDataBody ? {} : { 'Content-Type': 'application/json' }),
    ...options.headers as Record<string, string>,
  }

  const apiKey = getApiKey()
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  // Inject active profile header for request-scoped endpoints. Explicit profile
  // selectors in the URL/body and profile-name routes are validated directly.
  const profileName = selectedProfile || getActiveProfileName()
  if (profileName && !new Headers(options.headers).has('X-Hermes-Profile') && shouldAttachProfileHeader(path, options)) {
    headers['X-Hermes-Profile'] = profileName
  }

  const res = await fetch(url, { ...options, headers })

  // Global 401 handler — only redirect to login for local BFF endpoints
  // Proxied gateway requests should not trigger logout
  const isLocalBff = !path.startsWith('/api/hermes/v1/') &&
    !path.startsWith('/v1/')

  if (res.status === 401 && isLocalBff) {
    triggerAuthRecheck()
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if (res.status === 403 && isLocalBff) {
      if (text.includes('User is disabled or does not exist')) {
        triggerAuthRecheck()
      } else {
        emitAuthNotice('forbidden')
      }
    }
    throw Object.assign(
      new Error(`API Error ${res.status}: ${responseErrorMessage(text, res.statusText)}`),
      { status: res.status, code: responseErrorCode(text) },
    )
  }

  return res.json()
}

export function getBaseUrlValue(): string {
  return getBaseUrl()
}

export function isMatrixBypassMode(): boolean {
  return false
}

// ─── Matrix credential helpers ────────────────────────────────

const MATRIX_KEYS = {
  accessToken: 'matrix_access_token',
  userId: 'matrix_user_id',
  deviceId: 'matrix_device_id',
  homeserverUrl: 'matrix_homeserver_url',
} as const

export interface MatrixCredentials {
  accessToken: string
  userId: string
  deviceId: string
  homeserverUrl: string
}

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
  if (!accessToken || !userId || !homeserverUrl) return null
  return { accessToken, userId, deviceId: deviceId || '', homeserverUrl }
}

export function clearMatrixCredentials(): void {
  localStorage.removeItem(MATRIX_KEYS.accessToken)
  localStorage.removeItem(MATRIX_KEYS.userId)
  localStorage.removeItem(MATRIX_KEYS.deviceId)
  localStorage.removeItem(MATRIX_KEYS.homeserverUrl)
}

export function hasMatrixCredentials(): boolean {
  return !!getMatrixCredentials()
}
