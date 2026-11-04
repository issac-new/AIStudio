// overlay/custom/client/projects/api/projects.ts
// 项目工作流客户端 API：消费服务端 /api/projectworkflow/*（列表/详情/暂停/
// 恢复/完成五端点收作四函数）。fetch 包装照 ia2/api/sim-director.ts 的本地
// json() 形态（authFetch 来自 custom/client/shared/http.ts 统一鉴权实现）。
// 错误契约：动作端点非 2xx 时体含 { ok:false, error, problems? }——409（恢复
// 已完成）与 422（有未终结任务）的字段以 ProjectActionError 透传给视图，
// 视图据此弹「带豁免理由强制完成」确认框。
import { authFetch } from '../../shared/http'

export type ProjectStatus = 'active' | 'paused' | 'completed'

export interface ProjectTaskStats {
  total: number
  byStatus: Record<string, number>
}

/** 列表行（GET /projects 的条目形状） */
export interface ProjectSummary {
  id: string
  status: ProjectStatus
  pausedAt?: number
  completedAt?: number
  taskStats: ProjectTaskStats
}

export interface ProjectTimelineEvent {
  /** epoch ms */
  at: number
  kind: string
  detail?: string
}

/** 未终结任务（详情页 unfinished 与完成 422 problems 同形） */
export interface UnfinishedTask {
  id: string
  status: string
  title: string
  board: string
}

/** 详情（GET /projects/:id 的 project 形状，列表条目超集） */
export interface ProjectDetailData extends ProjectSummary {
  timeline: ProjectTimelineEvent[]
  unfinished: UnfinishedTask[]
}

/** 动作端点失败：status + 服务端 error 文案 + 422 未终结任务清单 */
export class ProjectActionError extends Error {
  readonly status: number
  readonly problems: UnfinishedTask[]
  constructor(message: string, status: number, problems: UnfinishedTask[] = []) {
    super(message)
    this.name = 'ProjectActionError'
    this.status = status
    this.problems = problems
  }
}

export function isProjectActionError(e: unknown): e is ProjectActionError {
  return e instanceof ProjectActionError
}

/** 本地 json 包装（同 sim-director.ts：非 2xx 抛「路径 → 状态：正文截断」） */
async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(path, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${path} → ${res.status}${text ? `：${text.slice(0, 160)}` : ''}`)
  }
  return res.json() as Promise<T>
}

/** 动作端点响应体（成功任意 JSON；失败契约字段见上） */
type ActionBody = Record<string, unknown> & { ok?: boolean; error?: string; problems?: unknown }

/**
 * 动作端点 POST：统一解析错误体的契约字段。
 * 成功返回解析后的响应体；非 2xx 抛 ProjectActionError（message 优先取服务端
 * error，缺失回落 json() 同款「路径 → 状态：正文截断」；422 的 problems 原样透传）。
 */
async function postAction(path: string): Promise<ActionBody> {
  const res = await authFetch(path, { method: 'POST' })
  const text = await res.text().catch(() => '')
  let body: ActionBody = {}
  if (text) {
    try {
      body = JSON.parse(text) as ActionBody
    } catch {
      body = {} // 非 JSON 错误体：原文进 message，不猜结构
    }
  }
  if (!res.ok) {
    const problems = Array.isArray(body.problems) ? (body.problems as UnfinishedTask[]) : []
    throw new ProjectActionError(
      String(body.error ?? `${path} → ${res.status}${text ? `：${text.slice(0, 160)}` : ''}`),
      res.status,
      problems,
    )
  }
  return body
}

/** 项目列表；ok:false 视为契约违约抛错（fail-soft 只留给缺席字段） */
export async function fetchProjects(): Promise<ProjectSummary[]> {
  const r = await json<{ ok: boolean; projects?: ProjectSummary[] }>('/api/projectworkflow/projects')
  if (!r.ok) throw new Error('项目列表获取失败')
  return r.projects ?? []
}

/** 项目详情（id 走 encodeURIComponent，防路径段注入） */
export async function fetchProject(id: string): Promise<ProjectDetailData> {
  const r = await json<{ ok: boolean; project?: ProjectDetailData }>(
    `/api/projectworkflow/projects/${encodeURIComponent(id)}`,
  )
  if (!r.ok || !r.project) throw new Error('项目详情获取失败')
  return r.project
}

/**
 * 暂停（paused=true）/ 恢复（paused=false）：同端点族二选一，返回动作后的
 * 项目快照。恢复已完成项目 → 409 ProjectActionError（服务端 error 文案）。
 */
export async function setProjectPaused(id: string, paused: boolean): Promise<ProjectSummary> {
  const action = paused ? 'pause' : 'resume'
  const body = await postAction(`/api/projectworkflow/projects/${encodeURIComponent(id)}/${action}`)
  const project = body.project as ProjectSummary | undefined
  if (!project) throw new Error(`${action} 响应缺少 project`)
  return project
}

/**
 * 完成项目：200 → resolve；有未终结任务 → 422 ProjectActionError（problems
 * 列未终结任务，视图弹确认框）。overrideReason 非空时带
 * ?override=true&reason=… 豁免强制完成（理由必填由视图把守，空理由不豁免）。
 */
export async function completeProject(id: string, overrideReason?: string): Promise<void> {
  const base = `/api/projectworkflow/projects/${encodeURIComponent(id)}/complete`
  const reason = overrideReason?.trim()
  const query = reason ? `?override=true&reason=${encodeURIComponent(reason)}` : ''
  await postAction(base + query)
}
