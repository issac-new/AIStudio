// overlay/custom/client/ide/api/remote.ts
// G6 远程工作区诊断客户端（/api/ide/remote/*，server 见
// custom/server/controllers/ide/remote-workspace.ts + native-routes 原生中间件）。
import { request } from '@/api/client'

export interface RemoteProbe {
  ok: boolean
  ms: number
  code?: string
  detail?: string
  path?: string
}

export interface RemoteStatus {
  ok: boolean
  profile: string | null
  backend: 'local' | 'docker' | 'ssh' | 'singularity' | 'unknown' | string
  cwd: string | null
  docker: { image: boolean; container: boolean }
  ssh: { host: boolean; user: boolean; key: boolean; port: number | null }
  probe: RemoteProbe
}

export interface RemoteEntry {
  name: string
  path: string
  isDir: boolean
  size: number
}

export interface RemoteListResult {
  ok: boolean
  backend: string
  path: string
  entries: RemoteEntry[]
  truncated: boolean
  code?: string
  detail?: string
}

function qs(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const ideRemoteApi = {
  status(profile?: string): Promise<RemoteStatus> {
    return request<RemoteStatus>(`/api/ide/remote/status${qs({ profile })}`)
  },
  list(path?: string | null, profile?: string): Promise<RemoteListResult> {
    return request<RemoteListResult>(`/api/ide/remote/list${qs({ path: path ?? undefined, profile })}`)
  },
}
