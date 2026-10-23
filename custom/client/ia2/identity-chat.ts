// overlay/custom/client/ia2/identity-chat.ts
// 统一身份聊天客户端 API（2026-10-23 五轮）：与网关 peer dm 协议代理面
// （/api/ia2/identities + /api/ia2/identity-chat/*，server controllers/ia2/
// identity-chat.ts）对话。纯函数+fetch，无 store 依赖，供画布与测试共用。

export interface IdentityInfo {
  kind: 'gateway'
  id: string
  label: string
  online: boolean
}

export interface IdentityMessage {
  role: string
  content: string
  at: number | null
}

async function req(path: string, init?: RequestInit): Promise<unknown> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('hermes_api_key') || '' : ''
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!res.ok) {
    const message = (body as { error?: string })?.error ?? (text.slice(0, 200) || `HTTP ${res.status}`)
    throw new Error(String(message))
  }
  return body
}

export async function fetchIdentities(): Promise<IdentityInfo[]> {
  const data = (await req('/api/ia2/identities')) as { identities?: IdentityInfo[] }
  return data?.identities ?? []
}

export interface ChatTurnResult {
  ok: boolean
  sessionId: string
  queued: boolean
  reply: string
  note?: string
}

export async function sendToIdentity(profile: string, message: string, sid?: string): Promise<ChatTurnResult> {
  return (await req(`/api/ia2/identity-chat/${encodeURIComponent(profile)}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message, ...(sid ? { sid } : {}) }),
  })) as ChatTurnResult
}

export async function fetchIdentityMessages(profile: string, sid?: string): Promise<{ sessionId: string; messages: IdentityMessage[] }> {
  const q = sid ? `?sid=${encodeURIComponent(sid)}` : ''
  return (await req(`/api/ia2/identity-chat/${encodeURIComponent(profile)}/messages${q}`)) as {
    sessionId: string
    messages: IdentityMessage[]
  }
}
