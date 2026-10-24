// overlay/custom/client/ia2/workflow.ts
// 工作流客户端 API（2026-10-23 五轮 H）：与 /api/ia2/workflow/runs（server
// controllers/ia2/workflow.ts）对话。模型迁移自 zcode dynamic-workflow 的
// agent().ask()：步骤=对一个调度目标（本机分布式 hermes 身份 / matrix 集群
// 房间）下达指令并取回执。

export interface WorkflowStep {
  targetKind: 'identity' | 'matrix'
  ref: string
  instructions: string
  status: 'pending' | 'running' | 'ok' | 'queued' | 'error'
  reply?: string
  eventId?: string
  error?: string
}

export interface WorkflowRun {
  id: string
  name: string
  mode: 'parallel' | 'serial'
  status: 'running' | 'done' | 'partial' | 'failed'
  steps: WorkflowStep[]
  createdAt: number
  finishedAt?: number
}

async function req(path: string, init?: RequestInit): Promise<unknown> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('hermes_api_key') || '' : ''
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!res.ok) throw new Error(String((body as { error?: string })?.error ?? `HTTP ${res.status}`))
  return body
}

export async function fetchWorkflowRuns(): Promise<WorkflowRun[]> {
  const data = (await req('/api/ia2/workflow/runs')) as { runs?: WorkflowRun[] }
  return data?.runs ?? []
}

export async function fetchWorkflowRun(id: string): Promise<WorkflowRun | null> {
  const data = (await req(`/api/ia2/workflow/runs/${encodeURIComponent(id)}`)) as { run?: WorkflowRun }
  return data?.run ?? null
}

export async function startWorkflow(input: {
  name: string
  mode: 'parallel' | 'serial'
  steps: Array<{ targetKind: 'identity' | 'matrix'; ref: string; instructions: string }>
}): Promise<WorkflowRun> {
  const data = (await req('/api/ia2/workflow/runs', { method: 'POST', body: JSON.stringify(input) })) as { run: WorkflowRun }
  return data.run
}

export async function deleteWorkflowRun(id: string): Promise<void> {
  await req(`/api/ia2/workflow/runs/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
