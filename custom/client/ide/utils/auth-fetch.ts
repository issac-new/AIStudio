// overlay/custom/client/ide/utils/auth-fetch.ts
// IDE 域 REST 调用的鉴权 fetch（2026-09-29 隔离走查实录缺陷根治：裸 fetch 不带
// Authorization → 生产后端一律 401；jsdom 测试 mock fetch 测不出）。
// 与上游 api/client.ts 的 request() 同源取 token（localStorage hermes_api_key），
// 但保留原生 fetch 形态（headers 合并、同参数透传），供非 JSON 约定端点复用。
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('hermes_api_key') || ''
  const headers = new Headers(init.headers ?? {})
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  return fetch(path, { ...init, headers })
}
