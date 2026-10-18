// overlay/custom/client/ide/api/cua.ts
// Cua 会话闸门客户端（/api/ide/cua/*，server 见 custom/server/cua/policy +
// native-routes）。fail-closed 默认；PUT 成功回传服务端生效值（写失败时以 false 为准）。
import { request } from '@/api/client'

export interface CuaStatus {
  ok: boolean
  available: boolean
  seededAt: string | null
  note: string
}

export interface CuaSessionState {
  ok: boolean
  sessionId: string
  enabled: boolean
}

export const ideCuaApi = {
  status(): Promise<CuaStatus> {
    return request<CuaStatus>('/api/ide/cua/status')
  },
  session(sessionId: string): Promise<CuaSessionState> {
    return request<CuaSessionState>(`/api/ide/cua/session/${encodeURIComponent(sessionId)}`)
  },
  setSession(sessionId: string, enabled: boolean): Promise<CuaSessionState> {
    return request<CuaSessionState>(`/api/ide/cua/session/${encodeURIComponent(sessionId)}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    })
  },
}
