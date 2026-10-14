// overlay/custom/client/bpa/api.ts
// 流程架构工作台客户端 API（/api/bpa/*，服务端契约镜像 bpa-controller.ts）。
import { request } from '@/api/client'

export type BpaSection = 'OPERATING' | 'ENABLING' | 'SUPPORTING' | 'MANAGING'
export type BpaLevel = 1 | 2 | 3 | 4 | 5 | 6
export type BpaFramework = 'OES+PCF6' | 'POS+PCF5' | 'MOS+PCF5' | 'OMS+PCF5'
export type BpaDecomposition = 'lifecycle' | 'pdca' | 'functional' | 'scenario'
export type BpaRuleCode =
  | 'MISSING_OWNER' | 'MISSING_KPI' | 'ORPHAN_L3' | 'DEPTH_EXCEEDED'
  | 'LEVEL_SKIP' | 'BAD_ID' | 'SECTION_INVALID' | 'DANGLING_REF'

export interface BpaKpi { name: string; target: string; unit?: string }

export interface BpaNode {
  id: string
  name: string
  level: BpaLevel
  parentId: string | null
  section?: BpaSection
  owner?: string
  kpis?: BpaKpi[]
  inputs?: string[]
  outputs?: string[]
  drivers?: string[]
  supports?: string[]
  decomposition?: BpaDecomposition
  note?: string
  updatedAt: number
}

export interface BpaConfig {
  framework: BpaFramework
  mapSections: BpaSection[]
  maxDepth: number
  forbidSkippingLevel: boolean
  requireEndToEnd: boolean
  requireL3Owner: boolean
  requireL3Kpi: boolean
  reviewCycleDays: number
}

export interface BpaViolation {
  rule: BpaRuleCode
  severity: 'high' | 'medium'
  nodeId: string
  nodeName: string
  detail: string
}

export interface BpaValidationReport {
  checkedAt: number
  nodes: number
  l3Count: number
  violations: BpaViolation[]
  bySeverity: { high: number; medium: number }
  ownerCoverage: number
  kpiCoverage: number
}

export interface BpaArchitectureDto {
  ok: boolean
  config: BpaConfig
  nodes: BpaNode[]
  updatedAt: number
  report: BpaValidationReport
  store: string
}

export interface PemmAssessment {
  id: string
  scoredAt: number
  scores: Record<string, number>
  note?: string
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const body = await request<{ ok?: boolean; problems?: string[] } & T>(path, { credentials: 'same-origin', ...init })
  if ((body as { ok?: boolean }).ok === false && Array.isArray(body.problems)) {
    throw new Error(body.problems.join('；'))
  }
  return body as T
}

export const bpaApi = {
  architecture: () => req<BpaArchitectureDto>('/api/bpa/architecture'),
  upsertNode: (node: BpaNode) =>
    req<BpaArchitectureDto & { removed?: string[] }>('/api/bpa/node', {
      method: 'PUT',
      body: JSON.stringify({ node }),
    }),
  deleteNode: (id: string) =>
    req<BpaArchitectureDto & { removed: string[] }>(`/api/bpa/node/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  saveConfig: (config: Partial<BpaConfig>) =>
    req<BpaArchitectureDto>('/api/bpa/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  validate: () => req<{ ok: boolean; report: BpaValidationReport }>('/api/bpa/validate', { method: 'POST', body: '{}' }),
  seed: () => req<BpaArchitectureDto & { seeded: number }>('/api/bpa/seed', {
    method: 'POST',
    body: JSON.stringify({ confirm: true }),
  }),
  maturityHistory: () => req<{ ok: boolean; history: PemmAssessment[] }>('/api/bpa/maturity'),
  submitMaturity: (scores: Record<string, number>, note?: string) =>
    req<{ ok: boolean; entry: PemmAssessment; overall: number | null; history: PemmAssessment[] }>('/api/bpa/maturity', {
      method: 'POST',
      body: JSON.stringify({ scores, note }),
    }),
}
