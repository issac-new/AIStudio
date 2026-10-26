// overlay/custom/client/ide/api/workitem.ts
// 工作项全景串联 REST 客户端（JoyAI 闭环吸收轮 P4）：taskId → 全链路八面产物。
// 服务端 custom/server/workitem/panorama.ts 的只读投影；每面独立 fail-soft。
import { authFetch } from '../utils/auth-fetch'

export interface Face<T> {
  available: boolean
  error?: string
  data?: T
}

export interface TaskCardFace {
  board: string; id: string; title: string; status: string; assignee: string | null
  createdAt?: number; completedAt?: number | null
}
export interface KanbanEventFace { id: number; kind: string; createdAt: number; payloadSummary: string }
export interface EvidenceFace {
  count: number
  records: Array<{ evidenceId: string; kind: string; at: number; note?: string; verdict?: string }>
  latestVerdict: { verdict: string; at: number; basis?: string } | null
}
export interface EvalTaskFace { setId: string; setName: string; sealed: boolean; taskId: string; problem?: string; runIds: string[] }
export interface ReviewFace { caseId: string; title: string; state: string; tier: string; updatedAt: number }
export interface PlanFace { planId: string; state: string; fromAgent: string; at: number }
export interface GraphRunFace { runId: string; graphId: string; artifact: string; ts: number }
export interface TraceFace { sessionId: string; via: 'eval_origin' | 'attempt' }
export interface LaneRowFace { laneId: string; kind: 'session' | 'handoff'; ref: string; at: number; label: string }

export interface WorkitemPanoramaDto {
  taskId: string
  generatedAt: number
  task: Face<TaskCardFace>
  kanbanEvents: Face<KanbanEventFace[]>
  evidence: Face<EvidenceFace>
  evals: Face<EvalTaskFace[]>
  reviews: Face<ReviewFace[]>
  plans: Face<PlanFace[]>
  graphRuns: Face<GraphRunFace[]>
  traces: Face<TraceFace[]>
  laneTimeline: Face<LaneRowFace[]>
  coverage: { tracesIndexedByTask: boolean; evalTaskIdMapping: string; note: string }
}

export async function fetchWorkitemPanorama(taskId: string): Promise<WorkitemPanoramaDto> {
  const res = await authFetch(`/api/hermes/workitem/${encodeURIComponent(taskId)}/panorama`)
  if (!res.ok) throw new Error(`全景串联读取失败（${res.status}）`)
  const j = await res.json() as { ok: boolean; panorama?: WorkitemPanoramaDto; error?: string }
  if (!j.ok || !j.panorama) throw new Error(j.error ?? '全景串联读取失败')
  return j.panorama
}
