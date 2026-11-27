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
  /** 仅 L1：APQC PCF 对标映射（如 "4.0"） */
  pcfRef?: string
  owner?: string
  kpis?: BpaKpi[]
  inputs?: string[]
  outputs?: string[]
  drivers?: string[]
  supports?: string[]
  decomposition?: BpaDecomposition
  note?: string
  // —— 场景准入字段（2026-11-28 B3；与服务端 bpa-types.ts 镜像，全部可缺省）——
  /** 触发条件：什么情况下启动、由谁触发 */
  trigger?: string
  /** 数据来源与新鲜度要求 */
  dataSources?: string
  /** 数据合规结论：cleared=已核；pending=待核；none=声明不涉及敏感数据 */
  dataCompliance?: 'cleared' | 'pending' | 'none'
  /** 是否重大影响 */
  majorImpact?: boolean
  /** 复核人 */
  reviewer?: string
  updatedAt: number
}

// —— 场景准入（2026-11-28 B1/B2；与服务端 bpa-admission.ts 镜像）——
export type AdmissionRuleCode = 'OWNER_MISSING' | 'NO_BASELINE' | 'DATA_UNLAWFUL' | 'MAJOR_UNREVIEWED'
export type AdmissionRuleVerdict = 'hit' | 'clear' | 'undetermined'

export interface AdmissionRuleResult {
  rule: AdmissionRuleCode
  verdict: AdmissionRuleVerdict
  detail: string
}

export interface AdmissionAssessmentDto {
  nodeId: string
  nodeName: string
  level: number
  rules: AdmissionRuleResult[]
  derived: 'eligible' | 'blocked'
  pendingItems: string[]
}

export interface AdmissionRecordDto {
  recordId: string
  nodeId: string
  nodeName: string
  conclusion: 'pilot' | 'deferred'
  reason: string
  rulesSnapshot: AdmissionRuleResult[]
  pendingItems: string[]
  signedBy: string
  signedAt: number
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

// ---------- 端到端链路（三要素之末：流程间关系） ----------

export interface E2ePath {
  steps: string[]
  handoffs: Array<string | null>
}

export interface E2eReport {
  paths: E2ePath[]
  strandedL3: string[]
  unlinkedL3: string[]
  cycleL3: string[]
}

// ---------- PCF 对标 ----------

export interface PcfCategoryDto {
  code: string
  nameZh: string
  nameEn: string
  groupsZh: string[]
  section: BpaSection
}

export interface PcfGapReportDto {
  rows: Array<{
    code: string
    nameZh: string
    nameEn: string
    groupsZh: string[]
    section: BpaSection
    matched: Array<{ id: string; name: string; by: 'ref' | 'name' }>
    status: 'covered' | 'missing'
  }>
  summary: { total: number; covered: number; missing: number }
  unmappedMine: Array<{ id: string; name: string }>
}

// ---------- 体检留痕与评审周期 ----------

export interface BpaAuditEntry {
  at: number
  nodes: number
  l3Count: number
  high: number
  medium: number
  ownerCoverage: number
  kpiCoverage: number
  source: 'validate' | 'write'
}

export interface ReviewDue {
  daysSince: number | null
  daysUntilDue: number | null
  reviewCycleDays: number
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
  /** 场景准入读取面：逐节点四条规则三态 + 最新签署结论（2026-11-28） */
  admission: () =>
    req<{ ok: boolean; peopleAvailable: boolean; nodes: Array<AdmissionAssessmentDto & { latest: AdmissionRecordDto | null }>; checkedAt: number }>('/api/bpa/admission'),
  /** 场景准入签署：conclusion=pilot|deferred；署名由服务端取登录身份，请求体不传 signedBy */
  signAdmission: (nodeId: string, conclusion: 'pilot' | 'deferred', reason: string) =>
    req<{ ok: boolean; record: AdmissionRecordDto; assessment: AdmissionAssessmentDto }>(`/api/bpa/admission/${encodeURIComponent(nodeId)}/sign`, {
      method: 'POST',
      body: JSON.stringify({ conclusion, reason }),
    }),
  e2e: () => req<{ ok: boolean; e2e: E2eReport }>('/api/bpa/e2e'),
  pcf: () => req<{ ok: boolean; reference: PcfCategoryDto[]; gap: PcfGapReportDto }>('/api/bpa/pcf'),
  audit: () => req<{ ok: boolean; history: BpaAuditEntry[]; reviewDue: ReviewDue }>('/api/bpa/audit'),
  /** 导出报告：返回 markdown 文本（需带 Authorization 的 request 通道拿 blob 文本） */
  exportMd: () => req<string>('/api/bpa/export'),
  /** 在岗自然人候选（治理域既有读接口；准入复核人 datalist 用，读不到由调用方降级） */
  govPeople: () => request<{ ok: boolean; people: Array<{ id: string; name: string; active: boolean }> }>('/api/governance/people'),
}
