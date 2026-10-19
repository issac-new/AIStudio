// overlay/custom/client/ia2/api/sim-verdicts.ts
// UAT 判定与 G5 发布门台账客户端（spec 2026-10-19-studio-p2 §2.1/§2.2）：
// 写端点绑 run，台账落运行 evidence/（append-only jsonl），与 TracePanel/发布门面板共用。
import { authFetch } from '../../ide/utils/auth-fetch'

export type UatVerdictKey = 'pass' | 'conditional' | 'reject'

export interface UatVerdictRecord {
  ts: string
  actor: string
  run: string
  ac: string
  verdict: UatVerdictKey
  note?: string
}

export type ReleaseGateDecision = 'approve' | 'reject'

export interface ReleaseGateRecord {
  ts: string
  actor: string
  run: string
  decision: ReleaseGateDecision
  note?: string
}

export interface ReleaseGateStatus {
  run: string
  decision: ReleaseGateDecision | null
  current: ReleaseGateRecord | null
  records: ReleaseGateRecord[]
  source: string | null
}

async function getJson<T>(path: string): Promise<T> {
  const res = await authFetch(path)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json() as Promise<T>
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await authFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => null) as (T & { error?: string }) | null
  if (!res.ok) throw new Error(data?.error || `${path} → ${res.status}`)
  return data as T
}

export function fetchUatRecords(run: string): Promise<{ run: string; records: UatVerdictRecord[]; source: string | null }> {
  return getJson(`/api/hermes/sim/uat-verdicts?run=${encodeURIComponent(run)}`)
}

export function postUatVerdict(input: { run: string; ac: string; verdict: UatVerdictKey; note?: string }): Promise<{ ok: boolean; record: UatVerdictRecord }> {
  return postJson('/api/hermes/sim/uat-verdict', input)
}

export function fetchReleaseGate(run: string): Promise<ReleaseGateStatus> {
  return getJson(`/api/hermes/sim/release-gate?run=${encodeURIComponent(run)}`)
}

export function postReleaseGate(input: { run: string; decision: ReleaseGateDecision; note?: string }): Promise<{ ok: boolean; record: ReleaseGateRecord }> {
  return postJson('/api/hermes/sim/release-gate', input)
}
