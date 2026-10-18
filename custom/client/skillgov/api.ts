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

// ── 技能供给对账/供给（/api/skillgov/provision/*） ──────────────────────

export interface ProvisionProfileRowDto {
  profile: string
  matchedRole: string | null
  catalogDeclared: string[]
  expected: string[]
  hostActual: string[]
  hostLinked: number
  hostDisabled: string[]
  disabledExpected: string[]
  sourceMissing: string[]
  missingInHost: string[]
  extraInHost: string[]
  simActual: string[]
  simLinked: number
  simComparable: boolean
  missingInSim: string[]
  catalogGapsInHost: string[]
}

export interface ProvisionReportDto {
  ok: true
  generatedAt: number
  hostRoot: string
  simRoot: string
  sim: { available: boolean; note?: string; profiles: number }
  manifest: { path: string; source: 'file' | 'builtin'; exists: boolean; roles: number; errors: string[] }
  catalog: { available: boolean; path: string; note?: string; rows: number }
  globalSkills: { hostAvailable: boolean; hostCount: number; simAvailable: boolean; simCount: number }
  profiles: ProvisionProfileRowDto[]
  simOnlyProfiles: string[]
  summary: {
    profiles: number
    hostMissing: number
    simMissing: number
    sourceMissing: number
    disabledExpected: number
    catalogRows: number
    catalogGaps: number
  }
}

export interface ProvisionActionDto { skill: string; reason?: string; source?: string }
export interface ProvisionProfileResultDto {
  profile: string
  planned: ProvisionActionDto[]
  copied: ProvisionActionDto[]
  skipped: ProvisionActionDto[]
  failed: ProvisionActionDto[]
}
export interface ProvisionApplyResultDto {
  ok: boolean
  dryRun: boolean
  reason?: string
  profiles: ProvisionProfileResultDto[]
  summary: { profiles: number; planned: number; copied: number; skipped: number; failed: number }
}
export interface ProvisionRollbackProfileDto {
  profile: string
  planned: string[]
  removed: string[]
  skipped: ProvisionActionDto[]
  failed: ProvisionActionDto[]
}
export interface ProvisionRollbackResultDto {
  ok: boolean
  dryRun: boolean
  reason?: string
  profiles: ProvisionRollbackProfileDto[]
  summary: { profiles: number; planned: number; removed: number; skipped: number; failed: number }
}
export interface ProvisionManifestDto {
  ok: true
  path: string
  exists: boolean
  source: 'file' | 'builtin'
  manifest: { version: 1; roles: Array<{ match: string; skills: string[]; note?: string }> }
  errors: string[]
}

export interface ProvisionApplyOptions {
  dryRun: boolean
  confirm?: boolean
  profiles?: string[]
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
  provisionReport: () => req<{ ok: true; report: ProvisionReportDto }>('/api/skillgov/provision/report'),
  getProvisionManifest: () => req<ProvisionManifestDto>('/api/skillgov/provision/manifest'),
  putProvisionManifest: (manifest: ProvisionManifestDto['manifest']) =>
    req<{ ok: true; path: string; backup?: string }>('/api/skillgov/provision/manifest', {
      method: 'PUT',
      body: JSON.stringify({ manifest }),
    }),
  applyProvision: (options: ProvisionApplyOptions) =>
    req<ProvisionApplyResultDto>('/api/skillgov/provision/apply', {
      method: 'POST',
      body: JSON.stringify(options),
    }),
  rollbackProvision: (options: ProvisionApplyOptions) =>
    req<ProvisionRollbackResultDto>('/api/skillgov/provision/rollback', {
      method: 'POST',
      body: JSON.stringify(options),
    }),
}
