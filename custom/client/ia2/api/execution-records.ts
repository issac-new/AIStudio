// overlay/custom/client/ia2/api/execution-records.ts
// 执行记录面 API（AgentTeams 吸收批二）：消费服务端 /api/execution-records/*
// （服务端域=custom/server/execution-records，编码 CLI run 与 delegate 通道的
// 统一留痕索引）。fetch 包装照 ia2/api/sim-director.ts 的本地 json() 形态
// （authFetch 来自 custom/client/shared/http.ts 统一鉴权实现）。
// 契约（写死）：
//   GET /api/execution-records?kind=&agent=&task=&outcome=&limit=&offset=
//     → { ok:true, records, total, offset, limit, hasMore }
//   GET /api/execution-records/delegate/:taskId
//     → { ok:true, record, result, logTail, logBytes }
//   GET /api/execution-records/coding/:sessionId
//     → { ok:true, record, session, usage, changes }
// fail-soft 口径：ok:false 视为契约违约抛错；可选字段缺席回落空形（不猜数）。
import { authFetch } from '../../shared/http'
import { serializeRecordFilters, type RecordFilterValues } from '../utils/records'

/** 单条执行记录（镜像服务端 ExecutionRecord；可选字段缺失即未知） */
export interface ExecutionRecord {
  v: number
  /** 记录族：coding-run=编码 CLI 托管 run；delegate=委托通道（zcode-acp-delegate） */
  kind: 'coding-run' | 'delegate'
  runId: string
  sessionId?: string
  agentId?: string
  cli?: string
  taskId?: string
  board?: string
  /** success=正常收工；failed=异常退出；timeout=超时；blocked=启动前拒绝 */
  outcome: 'success' | 'failed' | 'timeout' | 'blocked'
  exitCode?: number
  /** 机器可读拒绝/失败原因（短码，如 engine-not-found） */
  reason?: string
  startedAt: number
  endedAt?: number
  promptSha256?: string
  logBytes?: number
}

/** 列表页结果（分页四元组 + 当页记录） */
export interface ExecutionRecordsPage {
  records: ExecutionRecord[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
}

/** 委托详情（result 为对象；logTail 为尾部日志行） */
export interface DelegateDetail {
  record: ExecutionRecord | null
  result: Record<string, unknown> | null
  logTail: string[]
  logBytes: number
}

/** 编码运行变更行（服务端 change 记录原样字段名，不转驼峰） */
export interface CodingChangeRow {
  run_id: string
  change_id: string
  started_at?: number | string
  finished_at?: number | string
  files_changed?: number
  additions?: number
  deletions?: number
}

/** 编码运行详情（session/usage 为对象；字段集合随 CLI 版本演进，原样透传） */
export interface CodingDetail {
  record: ExecutionRecord | null
  session: Record<string, unknown> | null
  usage: Record<string, unknown> | null
  changes: CodingChangeRow[]
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

/** 对象字段透传（null/非对象一律 null，不猜形状） */
function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/**
 * 执行记录列表：筛选四值（空值不下发，序列化单一事实源=utils/records）+
 * 分页（limit 恒下发、offset>0 才下发）。records 缺席回落空数组（fail-soft）。
 */
export async function listExecutionRecords(
  filters: RecordFilterValues = {},
  page: { limit?: number; offset?: number } = {},
): Promise<ExecutionRecordsPage> {
  const query = serializeRecordFilters(filters, page.limit, page.offset)
  const r = await json<{
    ok: boolean
    records?: ExecutionRecord[]
    total?: number
    offset?: number
    limit?: number
    hasMore?: boolean
  }>(`/api/execution-records${query}`)
  if (!r.ok) throw new Error('执行记录列表获取失败')
  return {
    records: Array.isArray(r.records) ? r.records : [],
    total: Number(r.total) || 0,
    offset: Number(r.offset) || 0,
    limit: Number(r.limit) || 0,
    hasMore: r.hasMore === true,
  }
}

/** 委托通道详情（按 taskId；id 走 encodeURIComponent 防路径段注入） */
export async function fetchDelegateDetail(taskId: string): Promise<DelegateDetail> {
  const r = await json<{ ok: boolean; record?: ExecutionRecord | null; result?: unknown; logTail?: unknown; logBytes?: number }>(
    `/api/execution-records/delegate/${encodeURIComponent(taskId)}`,
  )
  if (!r.ok) throw new Error('委托记录详情获取失败')
  return {
    record: r.record ?? null,
    result: asObject(r.result),
    logTail: Array.isArray(r.logTail) ? r.logTail.map(String) : [],
    logBytes: Number(r.logBytes) || 0,
  }
}

/** 编码运行详情（按 sessionId；id 走 encodeURIComponent） */
export async function fetchCodingDetail(sessionId: string): Promise<CodingDetail> {
  const r = await json<{ ok: boolean; record?: ExecutionRecord | null; session?: unknown; usage?: unknown; changes?: unknown }>(
    `/api/execution-records/coding/${encodeURIComponent(sessionId)}`,
  )
  if (!r.ok) throw new Error('编码运行详情获取失败')
  return {
    record: r.record ?? null,
    session: asObject(r.session),
    usage: asObject(r.usage),
    changes: Array.isArray(r.changes) ? (r.changes as CodingChangeRow[]) : [],
  }
}
