// overlay/custom/client/loop/api/loop-rest.ts
import type { LoopInstance, TaskContract, LoopEvent, PatternTemplate } from '../types'

const BASE = '/api/loop'

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function patchJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function deleteJson(url: string): Promise<any> {
  const res = await fetch(url, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export const loopRest = {
  listLoops: async (status?: string[]): Promise<LoopInstance[]> => {
    const qs = status ? `?status=${status.join(',')}` : ''
    return (await fetchJson(`${BASE}/loops${qs}`)).loops
  },
  getLoop: async (id: string): Promise<LoopInstance> => {
    return (await fetchJson(`${BASE}/loops/${id}`)).loop
  },
  createLoop: async (loop: Partial<LoopInstance>): Promise<LoopInstance> => {
    return (await postJson(`${BASE}/loops`, loop)).loop
  },
  updateLoop: async (id: string, patch: Partial<LoopInstance>): Promise<LoopInstance> => {
    return (await patchJson(`${BASE}/loops/${id}`, patch)).loop
  },
  deleteLoop: async (id: string): Promise<void> => {
    await deleteJson(`${BASE}/loops/${id}`)
  },
  tickLoop: async (id: string): Promise<void> => {
    await postJson(`${BASE}/loops/${id}/tick`, {})
  },
  pauseLoop: async (id: string): Promise<void> => {
    await postJson(`${BASE}/loops/${id}/pause`, {})
  },
  getContracts: async (loopId: string): Promise<TaskContract[]> => {
    return (await fetchJson(`${BASE}/loops/${loopId}/contracts`)).contracts
  },
  getEvents: async (loopId: string, since?: string, limit?: number): Promise<LoopEvent[]> => {
    const qs = since ? `?since=${since}` : ''
    const qs2 = limit ? `${since ? '&' : '?'}limit=${limit}` : ''
    return (await fetchJson(`${BASE}/loops/${loopId}/events${qs}${qs2}`)).events
  },
  getPatterns: async (): Promise<PatternTemplate[]> => {
    return (await fetchJson(`${BASE}/patterns`)).patterns
  },
}
