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

