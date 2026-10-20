// 全流程推演运行编排只读数据面：只消费 graph spec/run 事件源，不读日常工作台
// 任务 store；交互式看板协同图保留在 /app/board。
import { authFetch } from '../../ide/utils/auth-fetch'

export interface SimSpecSummary {
  id: string
  version?: number
  description?: string
  origin?: string
  meta?: { goal?: string }
}

export interface SimRunSummary {
  runId: string
  graphId: string
  status?: string
  updatedAt?: string | null
}

async function getJson<T>(path: string): Promise<T> {
  const res = await authFetch(path)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json() as Promise<T>
}

export async function fetchSimSpecs(): Promise<SimSpecSummary[]> {
  const data = await getJson<SimSpecSummary[] | { specs?: SimSpecSummary[] }>('/api/graph/specs')
  return Array.isArray(data) ? data : data.specs ?? []
}

export async function fetchSimRuns(): Promise<SimRunSummary[]> {
  const data = await getJson<{ runs?: SimRunSummary[] }>('/api/graph/runs')
  return data.runs ?? []
}
