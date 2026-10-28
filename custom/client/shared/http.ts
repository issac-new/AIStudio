// custom/client/shared/http.ts
// 统一鉴权 fetch（2026-10-28 对账轮 K18 收敛）。
// 背景：IDE 域 `authFetch` 此前只做「裸 fetch + Bearer」，不读 `getBaseUrl()`、不带
// `X-Hermes-Profile`，与上游 `request()` 语义分叉——配置了 `hermes_server_url`、
// 部署在子路径或 profile 作用域端点时会打到错误 origin / 落默认 profile。
// 现在：URL 走 baseUrl 拼接，token 与 profile 头取上游同一事实源（api/client 导出），
// 返回值仍是原生 Response（非 JSON 约定端点需要它，如 blob / 文本 / SSE 首帧）。
// 直接读与上游 api/client 相同的 localStorage 键（getBaseUrl/getApiKey/getActiveProfileName
// 的实现就是这三个键）。不静态 import api/client：该模块在建时拉 router 上下文，
// 会让只 mock fetch 的单元测试在收集阶段就失败（2026-10-28 主干回归实证）。
const SERVER_URL_KEY = 'hermes_server_url'
const API_KEY_KEY = 'hermes_api_key'
const ACTIVE_PROFILE_KEY = 'hermes_active_profile_name'

const ls = (key: string): string => {
  try { return localStorage.getItem(key) || '' } catch { return '' }
}

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
  const base = ls(SERVER_URL_KEY).trim()
  return base ? `${base.replace(/\/+$/, '')}${path}` : path
}

export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {})
  const token = ls(API_KEY_KEY)
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData
  if (init.body && !isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const profile = ls(ACTIVE_PROFILE_KEY).trim()
  if (profile && !headers.has('X-Hermes-Profile') && shouldAttachProfileHeader(path)) {
    headers.set('X-Hermes-Profile', profile)
  }
  return fetch(apiUrl(path), { ...init, headers })
}
