// overlay/custom/client/ide/utils/diagram-api.ts
// 图产物机械验收客户端 API（/api/hermes/diagram/*，服务端契约镜像，spec 项3）。
import { request } from '@/api/client'

export interface DiagramCheckFindingDto {
  file: string
  message: string
}

export interface DiagramCheckResultDto {
  ok: boolean
  files: Array<{ path: string; ok: boolean }>
  findings: DiagramCheckFindingDto[]
  runnerError?: string
  durationMs: number
}

export async function checkDiagram(path: string, offline = false): Promise<DiagramCheckResultDto> {
  return request<DiagramCheckResultDto>('/api/hermes/diagram/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, offline }),
    credentials: 'same-origin',
  })
}
