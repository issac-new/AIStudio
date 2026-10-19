// overlay/custom/client/ide/api/devtools.ts
// 编程工具启动 + zcode CLI 会话（2026-10-19 用户需求批）：消费
// GET /api/ide/devtools、POST /api/ide/devtools/launch、GET /api/ide/zcode-cli/sessions。
import { authFetch } from '../utils/auth-fetch'

export interface DevToolInfo {
  key: string
  labelZh: string
  labelEn: string
  available: boolean
}

export interface CliSession {
  id: string
  title: string
  directory: string
  timeUpdated: number
  timeCreated: number
}

export async function fetchDevtools(): Promise<DevToolInfo[]> {
  const res = await authFetch('/api/ide/devtools')
  if (!res.ok) throw new Error(`devtools → ${res.status}`)
  const body = await res.json() as { tools?: DevToolInfo[] }
  return body.tools ?? []
}

export async function launchDevtool(tool: string, cwd?: string): Promise<void> {
  const res = await authFetch('/api/ide/devtools/launch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, ...(cwd ? { cwd } : {}) }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error || `启动失败（${res.status}）`)
  }
}

export async function fetchCliSessions(limit = 20): Promise<{ sessions: CliSession[]; note?: string }> {
  const res = await authFetch(`/api/ide/zcode-cli/sessions?limit=${limit}`)
  if (!res.ok) throw new Error(`zcode-cli/sessions → ${res.status}`)
  return res.json() as Promise<{ sessions: CliSession[]; note?: string }>
}
