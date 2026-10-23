// overlay/custom/client/ia2/api/effectiveness.ts
// 交付效能页签数据面（2026-10-23 天猫数字员工两文吸收轮）——消费 delivery 域端点：
//   GET /api/hermes/delivery/digest         跨板日报
//   GET /api/hermes/delivery/matrix         C×L 效能画像矩阵
//   GET /api/hermes/delivery/interventions  介入归因账本（?run= 单 run 下钻）
// 类型=服务端契约最小镜像（锚 custom/server/delivery/）。薄封装同 api/overview.ts
// getJson 模式：失败抛错由调用方如实呈现。
import { authFetch } from '../../ide/utils/auth-fetch'

export interface DigestItem {
  id: string
  board: string
  taskId: string
  title: string
  owner: string
  dwellSec: number | null
  details: string[]
}

export interface DailyDigest {
  generatedAt: number
  windowHours: number
  statuses: Array<{ status: string; count: number }>
  trend: { completed24h: number; completedPrev24h: number; created24h: number; createdPrev24h: number }
  completed: DigestItem[]
  blockers: DigestItem[]
  reviewQueue: DigestItem[]
  stalled: DigestItem[]
  suggestions: Array<{ kind: string; target: string; note: string }>
  boards: number
  boardsAvailable: number
}

export interface DigestResponse {
  available: boolean
  reason?: string
  digest?: DailyDigest
  kanbanHome?: string
  boardErrors?: Array<{ slug: string; error: string }>
}

export interface MatrixCell { c: number; l: number; count: number; avgInterventions: number | null }
export interface DeliveryMatrix {
  rows: Array<{ tier: number; label: string }>
  cols: Array<{ tier: number; label: string }>
  cells: MatrixCell[]
  totals: { tasks: number; evaluatedC: number; avgInterventions: number | null }
  note: string
}

export interface MatrixResponse {
  available: boolean
  reason?: string
  matrix?: DeliveryMatrix
  boards?: number
  boardsAvailable?: number
}

export interface InterventionEntry {
  ts: number
  actor: string
  layer: 'collab' | 'delivery'
  type: 'raise' | 'context' | 'nudge' | 'unblock' | 'confirm' | 'rework'
  source: string
  run: string
  snippet: string
  anchor: string
}

export interface InterventionsResponse {
  available: boolean
  reason?: string
  scope?: string
  runsScanned?: number
  entries?: InterventionEntry[]
  stats?: {
    total: number
    byType: Record<string, number>
    byLayer: { collab: number; delivery: number }
    topActors: Array<{ actor: string; count: number }>
  }
  riskSignals?: Array<{ id: string; label: string; hit: boolean; note: string }>
  meta?: { autoApprove: number; perRun: Array<{ run: string; count: number; autoApprove: number }> }
  sources?: string[]
}

async function getJson<T>(path: string): Promise<T> {
  const res = await authFetch(path)
  if (!res.ok) throw new Error(`${path} → ${res.status}${res.status === 400 || res.status === 503 ? `（${(await res.text()).slice(0, 120)}）` : ''}`)
  return res.json() as Promise<T>
}

export function fetchDigest(): Promise<DigestResponse> {
  return getJson('/api/hermes/delivery/digest')
}

export function fetchMatrix(): Promise<MatrixResponse> {
  return getJson('/api/hermes/delivery/matrix')
}

export function fetchInterventions(run?: string): Promise<InterventionsResponse> {
  const q = run ? `?run=${encodeURIComponent(run)}` : ''
  return getJson(`/api/hermes/delivery/interventions${q}`)
}

// ── D17 协作成熟度（挂账批 2026-10-23） ──
export interface MaturityLevel { key: string; name: string; thesis: string; nextTrigger: string }
export interface MaturityAssessment {
  level: MaturityLevel
  reading: { collabSharePct: number; autoApproveSharePct: number | null; nudges: number; reworks: number; total: number }
  gapNote: string
  note: string
}
export interface MaturityResponse {
  available: boolean
  reason?: string
  levels?: MaturityLevel[]
  assessment?: MaturityAssessment
  scope?: string
}

export function fetchMaturity(run?: string): Promise<MaturityResponse> {
  const q = run ? `?run=${encodeURIComponent(run)}` : ''
  return getJson(`/api/hermes/delivery/maturity${q}`)
}
