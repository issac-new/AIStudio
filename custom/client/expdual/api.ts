// overlay/custom/client/expdual/api.ts
// 双轨经验台账客户端 API（/api/expdual/*，服务端契约镜像）。ok:false + problems 统一抛错（skillgov 同款）。
import { request } from '@/api/client'

export interface DualRuleDto {
  id: string
  channel: 'fact' | 'tip'
  seq: number
  text: string
  count: number
  blameCount: number
  evidence: { kind: string; ref: string; at: number }[]
  status: string
  createdAt: number
  updatedAt: number
}

export interface RetiredRuleDto {
  id: string
  channel: 'fact' | 'tip'
  text: string
  reason: 'blame' | 'contradiction' | 'manual' | 'budget'
  chunk: number
  retiredAt: number
  note?: string
  synthesizedInto?: string
}

export interface SynthesisCandidateDto {
  id: string
  retiredIds: [string, string]
  reason: string
  status: 'open' | 'committed' | 'dismissed'
  createdAt: number
  tipId?: string
  note?: string
}

export interface BlameRecordDto {
  id: string
  chunk: number
  taskRef: string
  step: string
  ruleId: string
  note: string
  at: number
}

export interface BanksDto {
  chunk: number
  facts: DualRuleDto[]
  tips: DualRuleDto[]
  retired: RetiredRuleDto[]
  removed: { id: string; channel: string; text: string; count: number; reason: string }[]
  counts: { facts: number; tips: number; retired: number; removed: number }
}

export interface ClassificationDto {
  channel: 'fact' | 'tip'
  text: string
  rationale: string
}

export interface PremiseSignalDto {
  premiseId: string
  premiseStatus: string
  statement: string
  refutedBy: string | null
  ruleId: string
  ruleText: string
  score: number
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const body = await request<{ ok?: boolean; problems?: string[] } & T>(path, { credentials: 'same-origin', ...init })
  if ((body as { ok?: boolean }).ok === false && Array.isArray(body.problems)) {
    throw new Error(body.problems.join('；'))
  }
  return body as T
}

export const expdualApi = {
  banks: () => req<BanksDto>('/api/expdual/banks'),
  blames: () => req<{ items: BlameRecordDto[] }>('/api/expdual/blames'),
  synthesis: () => req<{ items: SynthesisCandidateDto[] }>('/api/expdual/synthesis'),
  premiseSignals: () => req<{ available: boolean; signals: PremiseSignalDto[]; note?: string; threshold: number }>('/api/expdual/premise-signals'),
  classify: (text: string) =>
    req<{ classification: ClassificationDto }>('/api/expdual/classify', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  induceAdd: (ops: { op: 'ADD'; channel: 'fact' | 'tip'; text: string; condition?: string; action?: string }[]) =>
    req<{ applied: string[] }>('/api/expdual/induce', {
      method: 'POST',
      body: JSON.stringify({ ops }),
    }),
  retire: (ruleId: string, note: string) =>
    req<{ retired: RetiredRuleDto }>('/api/expdual/retire', {
      method: 'POST',
      body: JSON.stringify({ ruleId, reason: 'manual', note }),
    }),
  blame: (input: { taskRef: string; step: string; ruleId: string; note: string }) =>
    req<{ retired: RetiredRuleDto | null }>('/api/expdual/blame', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  detectSynthesis: () =>
    req<{ candidates: SynthesisCandidateDto[] }>('/api/expdual/synthesize/detect', { method: 'POST', body: '{}' }),
  commitSynthesis: (input: { candidateId: string; condition: string; action: string; note?: string }) =>
    req<{ tipId: string }>('/api/expdual/synthesize/commit', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  dismissSynthesis: (candidateId: string, note: string) =>
    req<{ dismissed: string }>('/api/expdual/synthesize/dismiss', {
      method: 'POST',
      body: JSON.stringify({ candidateId, note }),
    }),
}
