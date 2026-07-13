// overlay/custom/client/loop/api/loop-rest.ts
import { request } from '@/api/client'
import type { LoopInstance, TaskContract, LoopEvent } from '../types'

const BASE = '/api/loop'

export const loopRest = {
  listLoops: async (status?: string[]): Promise<LoopInstance[]> => {
    const qs = status && status.length ? `?status=${status.join(',')}` : ''
    const res = await request<{ loops: LoopInstance[] }>(`${BASE}/loops${qs}`)
    return res.loops
  },
  getLoop: async (id: string): Promise<LoopInstance> => {
    const res = await request<{ loop: LoopInstance }>(`${BASE}/loops/${id}`)
    return res.loop
  },
  createLoop: async (loop: Partial<LoopInstance>): Promise<LoopInstance> => {
    const res = await request<{ loop: LoopInstance }>(`${BASE}/loops`, {
      method: 'POST',
      body: JSON.stringify(loop),
    })
    return res.loop
  },
  updateLoop: async (id: string, patch: Partial<LoopInstance>): Promise<LoopInstance> => {
    const res = await request<{ loop: LoopInstance }>(`${BASE}/loops/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    return res.loop
  },
  deleteLoop: async (id: string): Promise<void> => {
    await request<{ ok?: boolean }>(`${BASE}/loops/${id}`, { method: 'DELETE' })
  },
  tickLoop: async (id: string): Promise<void> => {
    await request<{ ok?: boolean }>(`${BASE}/loops/${id}/tick`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },
  pauseLoop: async (id: string): Promise<void> => {
    await request<{ ok?: boolean }>(`${BASE}/loops/${id}/pause`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },
  getContracts: async (loopId: string): Promise<TaskContract[]> => {
    const res = await request<{ contracts: TaskContract[] }>(`${BASE}/loops/${loopId}/contracts`)
    return res.contracts
  },
  getEvents: async (loopId: string, since?: string, limit?: number): Promise<LoopEvent[]> => {
    const params = new URLSearchParams()
    if (since) params.set('since', since)
    if (limit) params.set('limit', String(limit))
    const qs = params.toString() ? `?${params.toString()}` : ''
    const res = await request<{ events: LoopEvent[] }>(`${BASE}/loops/${loopId}/events${qs}`)
    return res.events
  },
}
