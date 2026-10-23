// overlay/custom/client/ia2/api/expertise.ts
// 协作画像「谁懂什么」数据面（2026-10-23 天猫数字员工两文吸收轮）——消费
// GET /api/hermes/expertise/wall 与 /search?q=。类型=服务端契约最小镜像。
import { authFetch } from '../../ide/utils/auth-fetch'

export interface PersonProfile {
  person: string
  concepts: Array<{ term: string; count: number; lastTsMs: number }>
  evidenceTotal: number
  lastActiveMs: number
  sources: string[]
}

export interface TermConflict {
  term: string
  domains: string[]
  persons: string[]
  anchors: Array<{ domain: string; anchor: string }>
}

export interface WallResponse {
  available: boolean
  reason?: string
  persons?: PersonProfile[]
  evidenceCount?: number
  conflicts?: TermConflict[]
  note?: string
  sources?: string[]
}

export interface SearchCandidate {
  person: string
  score: number
  matchedTerms: string[]
  evidence: Array<{ source: string; snippet: string; anchor: string; tsMs: number }>
}

export interface SearchResponse {
  available: boolean
  reason?: string
  query?: string
  candidates?: SearchCandidate[]
  formula?: string
}

async function getJson<T>(path: string): Promise<T> {
  const res = await authFetch(path)
  if (!res.ok) throw new Error(`${path} → ${res.status}${res.status === 400 ? `（${(await res.text()).slice(0, 120)}）` : ''}`)
  return res.json() as Promise<T>
}

export function fetchExpertiseWall(): Promise<WallResponse> {
  return getJson('/api/hermes/expertise/wall')
}

export function searchExpertise(q: string): Promise<SearchResponse> {
  return getJson(`/api/hermes/expertise/search?q=${encodeURIComponent(q)}`)
}

// ── D18 判例库（挂账批 2026-10-23） ──
export interface PrecedentHit {
  run: string
  origin: string
  dispatches: number
  issues: number
  disposals: number
  matches: Array<{ text: string; anchor: string }>
}
export interface PrecedentResponse {
  available: boolean
  reason?: string
  query?: string | null
  runs?: number
  hits?: PrecedentHit[]
  note?: string
  sources?: string[]
}

export function searchPrecedent(q: string): Promise<PrecedentResponse> {
  return getJson(`/api/hermes/precedent/search?q=${encodeURIComponent(q)}`)
}

/** 无 q=run 索引清单 */
export function listPrecedents(): Promise<PrecedentResponse> {
  return getJson('/api/hermes/precedent/search')
}
