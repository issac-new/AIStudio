// overlay/custom/client/skillgov/api.ts
// Skill 三段治理·扫描面客户端 API（/api/skillgov/scan*，服务端契约镜像）。
import { request } from '@/api/client'

export interface SkillFindingDto {
  rule: string
  severity: 'high' | 'medium' | 'low'
  file: string
  line?: number
  message: string
}

export interface SkillScanRowDto {
  name: string
  dir: string
  verdict: 'safe' | 'caution' | 'dangerous'
  findingsCount: number
  findings?: SkillFindingDto[]
}

export interface SkillScanSummaryDto {
  scannedAt: number
  scanned: number
  byVerdict: { safe: number; caution: number; dangerous: number }
  results: SkillScanRowDto[]
  hint?: string
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const body = await request<{ ok?: boolean; problems?: string[] } & T>(path, { credentials: 'same-origin', ...init })
  if ((body as { ok?: boolean }).ok === false && Array.isArray(body.problems)) {
    throw new Error(body.problems.join('；'))
  }
  return body as T
}

export const skillgovApi = {
  runScan: (roots?: string[]) =>
    req<SkillScanSummaryDto & { roots: string[] }>('/api/skillgov/scan', {
      method: 'POST',
      body: JSON.stringify(roots?.length ? { roots } : {}),
    }),
  latestScan: () => req<SkillScanSummaryDto>('/api/skillgov/scan/latest'),
}
