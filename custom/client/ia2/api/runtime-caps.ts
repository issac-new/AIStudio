// overlay/custom/client/ia2/api/runtime-caps.ts
// hermes 暗能力只读代理的前端出口（2026-10-01 吸收批 9：#7/#17）。
// 后端=custom/server/runtimecaps（CLI spawn+TTL 缓存+单飞锁）。
// 文本协议解析为纯函数（守门测试锚点）；409=runtime 通道缺席（诚实空态语义）。
import { authFetch } from '../../ide/utils/auth-fetch'

export interface CredentialProviderRow {
  provider: string
  count: number
  failed: boolean
  /** 失败明细（首个失败行截断） */
  failureDetail: string | null
}

export interface CronRunRow {
  runId: string
  status: string
  job: string
  source: string
  ts: string
}

export interface ApprovalSuggestion {
  n: number
  pattern: string
  kind: string
  count: number
  classes?: string[]
  examples?: string[]
}

/** auth list 文本 → provider 行（"name (N credentials):" 分节 + 块内 auth failed 探测） */
export function parseCredentials(raw: string): CredentialProviderRow[] {
  const out: CredentialProviderRow[] = []
  const lines = raw.split('\n')
  let current: CredentialProviderRow | null = null
  for (const line of lines) {
    const head = /^(\S+)\s+\((\d+) credentials?\):/.exec(line)
    if (head) {
      if (current) out.push(current)
      current = { provider: head[1]!, count: Number(head[2]), failed: false, failureDetail: null }
      continue
    }
    if (current && /auth failed|invalid_api_key|re-auth/i.test(line)) {
      current.failed = true
      if (!current.failureDetail) current.failureDetail = line.trim().slice(0, 120)
    }
  }
  if (current) out.push(current)
  return out
}

/** cron runs 文本行（"<runId>  <status>  job=<id>  source=<s>  <iso-ts>"）→ 行 */
export function parseCronRuns(raw: string): CronRunRow[] {
  const out: CronRunRow[] = []
  for (const line of raw.split('\n')) {
    const m = /^([0-9a-f]{16,})\s+(completed|failed|running|missed|skipped)\s+job=(\S+)\s+source=(\S+)\s+(\S+)$/.exec(line.trim())
    if (m) {
      out.push({ runId: m[1]!.slice(0, 8), status: m[2]!, job: m[3]!.slice(0, 8), source: m[4]!, ts: m[5]! })
    }
  }
  return out
}

async function fetchRaw(path: string): Promise<string | null> {
  const res = await authFetch(path)
  if (!res.ok) return null
  const data = (await res.json()) as { ok?: boolean; raw?: string }
  return data.ok && typeof data.raw === 'string' ? data.raw : null
}

export async function fetchCredentialProviders(): Promise<CredentialProviderRow[] | null> {
  const raw = await fetchRaw('/api/runtime-caps/credentials')
  return raw ? parseCredentials(raw) : null
}

export async function fetchCronRuns(limit = 10): Promise<CronRunRow[] | null> {
  const raw = await fetchRaw(`/api/runtime-caps/cron-runs?limit=${limit}`)
  return raw ? parseCronRuns(raw) : null
}

export async function fetchApprovalSuggestions(limit = 6): Promise<ApprovalSuggestion[] | null> {
  const res = await authFetch(`/api/runtime-caps/approval-suggestions?limit=${limit}`)
  if (!res.ok) return null
  const data = (await res.json()) as { ok?: boolean; raw?: string }
  if (!data.ok || typeof data.raw !== 'string') return null
  try {
    const parsed = JSON.parse(data.raw) as { proposals?: ApprovalSuggestion[] }
    return parsed.proposals ?? []
  } catch {
    return null
  }
}


// ── 网关 api_server 代理出口（2026-10-02 三受阻项解封：#7 分叉/#10 能力面/#11 蓝图）──

export interface GatewayBlueprintSlot {
  name: string
  type: string
  label: string
  default: unknown
  options: string[] | null
  optional: boolean
  help: string | null
  strict: boolean
}

export interface GatewayBlueprint {
  key: string
  title: string
  description: string
  category: string
  schedule_template: string
  prompt_template: string
  deliver_default: string
  skills: string[]
  tags: string[]
  slots: GatewayBlueprintSlot[]
}

/** 蓝图目录（后端=运行时 venv python 导入 CATALOG，16 件；409=通道缺席） */
export async function fetchGatewayBlueprints(): Promise<{ blueprints: GatewayBlueprint[] } | { error: string }> {
  const res = await authFetch('/api/runtime-caps/gateway/blueprints')
  const data = (await res.json()) as { ok?: boolean; blueprints?: GatewayBlueprint[]; error?: string }
  if (!res.ok || !data.ok) return { error: data.error ?? `HTTP ${res.status}` }
  return { blueprints: data.blueprints ?? [] }
}

/** 蓝图实例化：填槽→网关 POST /api/jobs 真实建任务（422=槽位校验错，内联展示） */
export async function instantiateGatewayBlueprint(
  key: string, values: Record<string, string>,
): Promise<{ ok: true; job: unknown } | { ok: false; error: string; status: number }> {
  const res = await authFetch('/api/runtime-caps/gateway/blueprints/instantiate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, values }),
  })
  const data = (await res.json()) as { ok?: boolean; job?: unknown; error?: string }
  if (!res.ok || !data.ok) return { ok: false, error: data.error ?? `HTTP ${res.status}`, status: res.status }
  return { ok: true, job: data.job }
}

export interface GatewaySession {
  id: string
  source: string
  title: string | null
  model: string | null
  started_at: number
  ended_at: number | null
}

export async function fetchGatewaySessions(limit = 20): Promise<GatewaySession[] | null> {
  const res = await authFetch(`/api/runtime-caps/gateway/sessions?limit=${limit}`)
  if (!res.ok) return null
  const data = (await res.json()) as { ok?: boolean; data?: GatewaySession[] }
  return data.ok ? (data.data ?? []) : null
}

/** 会话分叉（真链路）：成功返回新会话；语义=父会话 branched 结束（UI 须提示） */
export async function forkGatewaySession(
  sessionId: string, title?: string,
): Promise<{ ok: true; session: GatewaySession } | { ok: false; error: string; status: number }> {
  const res = await authFetch(`/api/runtime-caps/gateway/sessions/${encodeURIComponent(sessionId)}/fork`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(title ? { title } : {}),
  })
  const data = (await res.json()) as { ok?: boolean; session?: GatewaySession; error?: unknown }
  if (!res.ok || !data.ok) return { ok: false, error: typeof data.error === 'string' ? data.error : `HTTP ${res.status}`, status: res.status }
  return { ok: true, session: data.session as GatewaySession }
}

export interface GatewayStatus {
  healthy: boolean
  capabilities?: { model?: string; runtime?: { mode?: string }; auth?: { type?: string } }
}

export async function fetchGatewayStatus(): Promise<GatewayStatus | null> {
  const res = await authFetch('/api/runtime-caps/gateway/status')
  if (!res.ok) return null
  const data = (await res.json()) as { ok?: boolean; healthy?: boolean; capabilities?: GatewayStatus['capabilities'] }
  return data.ok ? { healthy: !!data.healthy, capabilities: data.capabilities } : null
}
