// overlay/custom/client/ia2/api/sec-audit.ts
// 安全审计流水线数据面（⑥治理·安全审计页签）：/api/governance/secaudit/* 类型镜像 + fetch 封装。
// 服务端单一事实源：custom/server/secaudit/*。
import { authFetch } from '../../ide/utils/auth-fetch'

export type SurfaceClass =
  | 'auth_access' | 'tool_exec' | 'skills' | 'mcp' | 'supply_chain' | 'secrets'
  | 'browser_net' | 'data_lifecycle' | 'prompt_injection' | 'agents' | 'availability' | 'human_review'

export type FindingStatus = 'confirmed' | 'needs_validation' | 'rejected'
export type CoverageStatus = 'full' | 'partial' | 'unchecked'

export interface SurfaceDef {
  class: SurfaceClass
  name: string
  focus: string
  manual: boolean
  hasCollector: boolean
}

export interface CoverageEntryView {
  id: string
  surfaceClass: SurfaceClass
  status: CoverageStatus
  evidenceSummary?: string
  autoFindingCount?: number
  candidateCount?: number
  checkedBy?: string
  checkedAt?: number
  partialReason?: string
}

export interface CoverageCriticView {
  id: string
  kind: 'unchecked_surface' | 'no_evidence' | 'stale_evidence' | 'unmapped_class' | 'no_rejected_findings'
  surfaceClass?: SurfaceClass
  detail: string
}

export interface CoverageLedgerView {
  entries: CoverageEntryView[]
  critic: CoverageCriticView[]
  summary: { total: number; full: number; partial: number; unchecked: number; coverageRatio: number }
}

export interface FindingView {
  findingId: string
  candidate: {
    candidateId: string
    surfaceClass: SurfaceClass
    title: string
    detail: string
    traceChain?: string
    observation?: string
    author: string
    createdAt: number
  }
  status: FindingStatus
  severity?: 'high' | 'medium' | 'low'
  unknownFact?: string
  refutation?: string
  defenseInDepth?: boolean
  decidedBy?: string
  decidedAt?: number
  recordReviews: Array<{ reviewId: string; reviewer: string; outcome: 'verified' | 'replaced'; at: number; recordHash: string }>
}

export interface AuditProjectView {
  projectId: string
  name: string
  target: { kind: string; hermesHome?: string; workspace?: string }
  surfaces: SurfaceClass[]
  fingerprint: string
  createdAt: number
  runs: Array<{
    runId: string
    targetFingerprint: string
    startedAt: number
    endedAt?: number
    status: 'open' | 'reported'
    recordReview?: { total: number; verified: number; replaced: number; stale: number }
    ledger?: CoverageLedgerView
  }>
  findings: FindingView[]
}

async function getJson<T>(path: string): Promise<T> {
  const res = await authFetch(path)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await authFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json() as T & { problems?: Array<{ code: string; detail: string }> }
  if (!res.ok) {
    const detail = json.problems?.map((p) => p.detail).join('；') ?? `HTTP ${res.status}`
    throw new Error(detail)
  }
  return json
}

const BASE = '/api/governance/secaudit'

export async function fetchCatalog(): Promise<{ catalog: SurfaceDef[] }> {
  const r = await getJson<{ ok: true; catalog: SurfaceDef[] }>(`${BASE}/catalog`)
  return { catalog: r.catalog }
}

export async function fetchProjects(): Promise<{ projects: AuditProjectView[] }> {
  const r = await getJson<{ ok: true; projects: AuditProjectView[] }>(`${BASE}/projects`)
  return { projects: r.projects }
}

export async function createProject(input: { name: string; target: { kind: string; hermesHome?: string }; surfaces?: SurfaceClass[] }): Promise<AuditProjectView> {
  const r = await postJson<{ ok: true; project: AuditProjectView }>(`${BASE}/projects`, input)
  return r.project
}

export async function startRun(projectId: string): Promise<AuditProjectView['runs'][number]> {
  const r = await postJson<{ ok: true; run: AuditProjectView['runs'][number] }>(`${BASE}/projects/${projectId}/runs`, {})
  return r.run
}

export async function submitCandidate(projectId: string, input: {
  surfaceClass: SurfaceClass
  title: string
  detail: string
  traceChain?: string
  observation?: string
  author: string
}): Promise<FindingView> {
  const r = await postJson<{ ok: true; finding: FindingView }>(`${BASE}/projects/${projectId}/candidates`, input)
  return r.finding
}

export async function verifyFinding(projectId: string, findingId: string, input: {
  verifier: string
  status: FindingStatus
  refutation?: string
  unknownFact?: string
  severity?: 'high' | 'medium' | 'low'
  defenseInDepth?: boolean
}): Promise<FindingView> {
  const r = await postJson<{ ok: true; finding: FindingView }>(`${BASE}/projects/${projectId}/findings/${findingId}/verify`, input)
  return r.finding
}

export async function recordReview(projectId: string, findingId: string, input: {
  reviewer: string
  outcome: 'verified' | 'replaced'
}): Promise<FindingView> {
  const r = await postJson<{ ok: true; finding: FindingView }>(`${BASE}/projects/${projectId}/findings/${findingId}/record-review`, input)
  return r.finding
}

export async function finalizeRun(projectId: string, runId: string): Promise<{ report: unknown; markdown: string; schemaProblems: string[] }> {
  const r = await postJson<{ ok: true; report: unknown; markdown: string; schemaProblems: string[] }>(`${BASE}/projects/${projectId}/runs/${runId}/finalize`, {})
  return { report: r.report, markdown: r.markdown, schemaProblems: r.schemaProblems }
}
