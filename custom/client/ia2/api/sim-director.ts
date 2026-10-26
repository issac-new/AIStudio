// overlay/custom/client/ia2/api/sim-director.ts
// 产品内导演：需求 → 模块图 → 起跑；运行状态/人工闸走既有 /api/graph 端点。
import { authFetch } from '../../ide/utils/auth-fetch'

export interface DirectorScenario {
  id: string
  title: string
  description: string
  modules?: string[]
  assignees?: Record<string, string>
}

export interface DirectorInput {
  title: string
  description: string
  modules?: string[]
  assignees?: Record<string, string>
}

export interface DirectorPlan {
  scenario: DirectorInput
  spec: {
    id: string
    nodes: Array<{ id: string; type: string; config?: Record<string, unknown> }>
    edges: Array<{ from: string; to: string }>
  }
  cast: string[]
  nodeCount: number
  gateCount: number
  modules: string[]
}

export interface GraphEvent {
  kind?: string
  type?: string
  nodeId?: string
  interruptId?: string
  value?: unknown
  resumeValue?: unknown
  /** 事件日志字段：epoch ms（实时 socket 词汇也可能是 ISO 字符串） */
  ts?: string | number
  step?: number
  /** 事件日志的 super-step（与 step 同义；回放事件用它标步骤） */
  superStep?: number
  payload?: {
    interruptId?: string
    value?: unknown
    resumeValue?: unknown
    [k: string]: unknown
  }
}

export interface GraphRunState {
  runId: string
  graphId: string
  instance: {
    status?: string
    updatedAt?: string
    /** 图实例当前 super-step（外部 run 骨架可能缺席） */
    currentStep?: number
    graphDefId?: string | null
    /** 外部源 run（无内存实例，仅事件日志骨架） */
    external?: boolean
    eventCount?: number
    totalCost?: number
    [k: string]: unknown
  }
}

export interface PendingGate {
  interruptId: string
  nodeId: string
  prompt: string
}

/** 需求影响推演（JoyAI 闭环吸收轮 P5）：规则式四路命中影响卡。 */
export interface RequirementImpactDto {
  title: string
  description: string
  entities: Array<{ source: 'ontology-instance' | 'board-kg' | 'fibo-term'; id: string; label: string; matchedTerm: string; detail?: string; docs?: string[] }>
  relatedSpecs: Array<{ file: string; title: string; date: string | null; matchedLine: string }>
  suggestedModules: string[]
  boundary: string
  counts: { ontology: number; boardKg: number; fibo: number; specs: number }
}

/** 影响推演响应（含需求指纹——标注 key，挂账清偿批二 C1）。 */
export interface ImpactResponseDto {
  fingerprint: string
  impact: RequirementImpactDto
}

export async function analyzeRequirementImpact(title: string, description: string): Promise<ImpactResponseDto> {
  const r = await json<{ ok: boolean; fingerprint?: string; impact?: RequirementImpactDto }>('/api/hermes/impact/requirement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description }),
  })
  if (!r.ok || !r.impact || !r.fingerprint) throw new Error('影响推演失败')
  return { fingerprint: r.fingerprint, impact: r.impact }
}

/** 业务地图标注（C1：持久化标注+异步协同）。 */
export interface MapAnnotationDto {
  nodeId: string
  note: string
  checked: boolean
  by: string
  at: number
}

export async function fetchMapAnnotations(key: string): Promise<MapAnnotationDto[]> {
  const r = await json<{ ok: boolean; annotations?: MapAnnotationDto[] }>(`/api/hermes/map-annotations?key=${encodeURIComponent(key)}`)
  return r.annotations ?? []
}

export async function saveMapAnnotation(key: string, annotation: { nodeId: string; note: string; checked: boolean }): Promise<MapAnnotationDto> {
  const r = await json<{ ok: boolean; annotation?: MapAnnotationDto }>('/api/hermes/map-annotations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, by: 'map-editor', ...annotation }),
  })
  if (!r.annotation) throw new Error('标注保存失败')
  return r.annotation
}

export async function deleteMapAnnotation(key: string, nodeId: string): Promise<void> {
  await json(`/api/hermes/map-annotations?key=${encodeURIComponent(key)}&nodeId=${encodeURIComponent(nodeId)}`, { method: 'DELETE' })
}

/** LLM 拆模块（挂账清偿批 B1）：clef 判定端拆解；离线回落词表（modulesSource 如实标注）。 */
export interface ModuleSuggestionDto {
  modules: string[]
  rationales: string[]
  modulesSource: 'llm' | 'fallback'
  online: boolean
  reason?: string
}

export async function suggestModules(title: string, description: string): Promise<ModuleSuggestionDto> {
  const r = await json<{ ok: boolean; suggestion?: ModuleSuggestionDto }>('/api/hermes/impact/suggest-modules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description }),
  })
  if (!r.ok || !r.suggestion) throw new Error('模块拆解失败')
  return r.suggestion
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(path, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${path} → ${res.status}${text ? `：${text.slice(0, 160)}` : ''}`)
  }
  return res.json() as Promise<T>
}

export async function fetchDirectorScenarios(): Promise<DirectorScenario[]> {
  const r = await json<{ scenarios?: DirectorScenario[] }>('/api/graph/sim-director/scenarios')
  return r.scenarios ?? []
}

export function planDirectorScenario(input: DirectorInput): Promise<DirectorPlan> {
  return json<DirectorPlan>('/api/graph/sim-director/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export interface DirectorNotifyStatus {
  sent: boolean
  reason?: string
}

export function startDirectorScenario(input: DirectorInput): Promise<{
  ok: boolean
  specId: string
  runId: string
  cast: string[]
  modules: string[]
  notify?: DirectorNotifyStatus
}> {
  return json('/api/graph/sim-director/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function fetchGraphRun(runId: string): Promise<GraphRunState> {
  return json<GraphRunState>(`/api/graph/runs/${encodeURIComponent(runId)}`)
}

export async function fetchGraphEvents(runId: string): Promise<GraphEvent[]> {
  const r = await json<{ events?: GraphEvent[] }>(`/api/graph/runs/${encodeURIComponent(runId)}/replay`)
  return r.events ?? []
}

export function resumeGraphGate(runId: string, interruptId: string, approved: boolean): Promise<{ notify?: DirectorNotifyStatus } & Record<string, unknown>> {
  return json(`/api/graph/runs/${encodeURIComponent(runId)}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ interruptId, value: { approved } }),
  })
}

/** replay 事件 → 仍未应答的人工闸（interrupt.raised 未被同 id resume 关闭）。 */
export function pendingGatesOf(events: GraphEvent[]): PendingGate[] {
  const open = new Map<string, PendingGate>()
  for (const e of events) {
    const kind = String(e.kind ?? e.type ?? '')
    const payload = (e.payload && typeof e.payload === 'object' ? e.payload : {}) as Record<string, unknown>
    const interruptId = String(e.interruptId ?? payload.interruptId ?? '')
    if (!interruptId) continue
    if (kind === 'interrupt.raised' || kind === 'graph.interrupt') {
      const value = (e.value ?? payload.value ?? {})
      const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
      open.set(interruptId, {
        interruptId,
        nodeId: String(e.nodeId ?? (v.nodeId as string) ?? ''),
        prompt: String(v.prompt ?? v.title ?? `人工闸 ${interruptId}`),
      })
    } else if (kind === 'interrupt.resumed' || kind === 'graph.resume') {
      open.delete(interruptId)
    }
  }
  return [...open.values()]
}

/** 最近事件的人话摘要（导演台只显示尾部 12 条）。 */
export function recentEventRows(events: GraphEvent[], limit = 12): Array<{ kind: string; nodeId: string; ts: string }> {
  return events.slice(-limit).map(e => ({
    kind: String(e.kind ?? e.type ?? ''),
    nodeId: String(e.nodeId ?? ''),
    ts: String(e.ts ?? ''),
  }))
}

// ── 受控 harness 启动器（/api/harness/sim-launch；默认关闭）──────────────
export interface SimLaunchStatus {
  ok: boolean
  enabled: boolean
  running: boolean
  process?: { runId: string; pid: number | null; startedAt: string; logFile: string } | null
  lastExit?: { runId: string; code: number | null; signal: string | null; endedAt: string } | null
  script: string
  simRoot: string
  driverLock: boolean
  logTail?: string
}

export function fetchSimLaunchStatus(): Promise<SimLaunchStatus> {
  return json<SimLaunchStatus>('/api/harness/sim-launch/status')
}

export function startSimLaunch(runId: string): Promise<SimLaunchStatus> {
  return json<SimLaunchStatus>('/api/harness/sim-launch/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runId }),
  })
}

export function stopSimLaunch(): Promise<{ ok: boolean; stopping?: boolean; pid?: number; runId?: string }> {
  return json('/api/harness/sim-launch/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
}
