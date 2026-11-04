// overlay/custom/client/projects/api/projects.ts
// 项目工作流客户端 API：消费服务端 /api/projectworkflow/*（列表/详情/暂停/
// 恢复/完成五端点收作四函数 + 拓扑 graph 端点）与既有 /api/hermes/diagram/
// mermaid-brand（品牌渲染）。fetch 包装照 ia2/api/sim-director.ts 的本地
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

// --- 拓扑面（AgentTeams 吸收批三）：GET /projects/:id/graph + mermaid 品牌渲染 ---

/** 拓扑节点（字段镜像服务端 graph.ts GraphNode） */
export interface ProjectGraphNode {
  id: string
  title: string
  status: string
  board: string
  assignee?: string
}

/** 父→子依赖边（source=父） */
export interface ProjectGraphEdge {
  source: string
  target: string
}

export type ProjectGraphInterruptKind =
  | 'blocked-card'
  | 'project-paused'
  | 'review-pending'
  | 'cross-board-link'
  | 'cycle-dropped'

export interface ProjectGraphInterrupt {
  id: string
  kind: ProjectGraphInterruptKind
  reason: string
}

/** 拓扑四元投影（buildWorkflow 对标；含项目级状态上下文） */
export interface ProjectTaskGraphData {
  projectId: string
  projectStatus: ProjectStatus
  nodes: ProjectGraphNode[]
  edges: ProjectGraphEdge[]
  next: string[]
  interrupts: ProjectGraphInterrupt[]
}

/**
 * 项目拓扑：默认 JSON 四元；format='mermaid' 返回 text/plain 的 graph TD 源
 * （非 JSON 端点，不走 json() 包装，res.text() 直取）。
 */
export async function fetchProjectGraph(id: string, format: 'mermaid'): Promise<string>
export async function fetchProjectGraph(id: string): Promise<ProjectTaskGraphData>
export async function fetchProjectGraph(id: string, format?: string): Promise<ProjectTaskGraphData | string> {
  const query = format === 'mermaid' ? '?format=mermaid' : ''
  const res = await authFetch(`/api/projectworkflow/projects/${encodeURIComponent(id)}/graph${query}`)
  if (!res.ok) throw new Error('项目拓扑获取失败')
  if (format === 'mermaid') return res.text()
  const r = await res.json() as { ok: boolean; graph?: ProjectTaskGraphData }
  if (!r.ok || !r.graph) throw new Error('项目拓扑获取失败')
  return r.graph
}

/** mermaid-brand 响应（契约镜像 custom/server/diagram/diagram-controller.ts:48-72） */
export interface MermaidBrandResult {
  ok: boolean
  html?: string
  kind?: string
  reason?: 'extract_failed' | 'unsupported_kind'
  runnerError?: string
}

/**
 * mermaid 源 → 服务端品牌 HTML+SVG（POST /api/hermes/diagram/mermaid-brand，
 * 请求体 { source, title? }）。产物是服务端自渲染 HTML——展示面必须走
 * iframe srcdoc（同 IdeWikiPane 安全形态），禁止直接 v-html。
 */
export async function fetchMermaidBrand(source: string, title?: string): Promise<MermaidBrandResult> {
  const res = await authFetch('/api/hermes/diagram/mermaid-brand', {
    method: 'POST',
    body: JSON.stringify({ source, ...(title ? { title } : {}) }),
  })
  if (!res.ok) throw new Error('mermaid 品牌渲染请求失败')
  return res.json() as Promise<MermaidBrandResult>
}
