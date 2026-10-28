// custom/client/shared/http.ts
// 统一鉴权 fetch（2026-10-28 对账轮 K18 收敛）。
// 背景：IDE 域 `authFetch` 此前只做「裸 fetch + Bearer」，不读 `getBaseUrl()`、不带
// `X-Hermes-Profile`，与上游 `request()` 语义分叉——配置了 `hermes_server_url`、
// 部署在子路径或 profile 作用域端点时会打到错误 origin / 落默认 profile。
// 现在：URL 走 baseUrl 拼接，token 与 profile 头取上游同一事实源（api/client 导出），
// 返回值仍是原生 Response（非 JSON 约定端点需要它，如 blob / 文本 / SSE 首帧）。
import { getActiveProfileName, getApiKey, getBaseUrl } from '@/api/client'

/** 与上游 request() 一致的 profile 头排除面：显式 profile 参数、profile 路由、主题 */
const PROFILE_HEADER_EXCLUDED = ['/api/hermes/profiles', '/api/theme']

export function shouldAttachProfileHeader(path: string): boolean {
  try {
    const url = new URL(path, 'http://hermes.local')
    if (url.searchParams.has('profile')) return false
    return !PROFILE_HEADER_EXCLUDED.some((prefix) => url.pathname.startsWith(prefix))
  } catch {
    return false
  }
}

/** 相对路径拼 baseUrl；绝对 URL 原样返回 */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const base = getBaseUrl()
  return base ? `${base.replace(/\/+$/, '')}${path}` : path
}

export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {})
  const token = getApiKey()
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData
  if (init.body && !isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const profile = getActiveProfileName()
  if (profile && !headers.has('X-Hermes-Profile') && shouldAttachProfileHeader(path)) {
    headers.set('X-Hermes-Profile', profile)
  }
  return fetch(apiUrl(path), { ...init, headers })
}
