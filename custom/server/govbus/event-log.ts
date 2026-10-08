/**
 * 六文调研轮 F：治理事件总线（湖仓治理文章"治理事件总线联动各域"的产品化）。
 *
 * 形态：持久化 append-only 事件日志（JSONL 环形，CAP 2000）+ 类型化域/严重级 +
 * 进程内订阅（fire-and-forget、fail-soft）。上游 webhook business-events 只出不落、
 * socket 事件不落盘、三张事件表各自为政——本总线收编为单一可查询事件流。
 *
 * 域间联动（如"质量 P0 → 暂停下游派发"）：v1 提供订阅 API（subscribe），消费方
 * 注册即得回调；总线自身不内置业务副作用（避免 surprising auto-freeze）。已知
 * 待接线消费者列于 README/规格档，不装已完成。
 *
 * 桥接（真实事件入口，改动最小化）：
 *   - approvals/approval-log appendApprovalLog → decision 事件（deny/reject → high）
 *   - evidence/evidence-store appendEvidence → evidence 事件（verdict=fail → high）
 * 桥接遵循 approval-log 的 recordToDecisionGraph 同款纪律：动态 require + fail-soft，
 * 测试环境不炸主链路。
 */
import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { randomBytes } from 'crypto'

export type GovEventDomain = 'quality' | 'security' | 'cost' | 'approval' | 'autonomy' | 'system'
export type GovEventSeverity = 'info' | 'warn' | 'high'

export const GOV_EVENT_DOMAINS: readonly GovEventDomain[] = ['quality', 'security', 'cost', 'approval', 'autonomy', 'system']
export const GOV_EVENT_SEVERITIES: readonly GovEventSeverity[] = ['info', 'warn', 'high']

export interface GovEvent {
  eventId: string
  ts: number
  domain: GovEventDomain
  severity: GovEventSeverity
  /** 事件类型（点分命名，如 approval.decision / evidence.verdict_fail）。 */
  type: string
    /** 事件源模块（锚点用）。 */
  source: string
  /** 摘要（人话一句——报告纪律）。 */
  summary: string
  /** 结构化载荷（最小暴露：计数/键名/指针，不落正文与密钥）。 */
  payload?: Record<string, unknown>
  /** 关联对象指针（taskId/sessionId/runId 等）。 */
  refs?: Record<string, string>
}

const CAP = 2000

export function govEventDir(): string {
  const env = process.env.HERMES_GOV_EVENT_DIR?.trim()
  if (env) return resolve(env)
  return join(homedir(), '.hermes-web-ui', 'governance-events')
}

function eventFile(): string {
  return join(govEventDir(), 'events.jsonl')
}

// ---------- 订阅（进程内 fan-out） ----------

export interface GovEventHandler {
  /** 订阅标签（排障用）。 */
  label: string
  /** 域过滤（缺省=全域）。 */
  domains?: GovEventDomain[]
  /** 严重级下限（缺省=全级）。 */
  minSeverity?: GovEventSeverity
  fn: (ev: GovEvent) => void
}

const SEVERITY_ORDER: Record<GovEventSeverity, number> = { info: 0, warn: 1, high: 2 }

const handlers: GovEventHandler[] = []

export function subscribeGovEvent(h: GovEventHandler): () => void {
  handlers.push(h)
  return () => {
    const i = handlers.indexOf(h)
    if (i >= 0) handlers.splice(i, 1)
  }
}

function fanOut(ev: GovEvent): void {
  for (const h of handlers) {
    try {
      if (h.domains && !h.domains.includes(ev.domain)) continue
      if (h.minSeverity && SEVERITY_ORDER[ev.severity] < SEVERITY_ORDER[h.minSeverity]) continue
      h.fn(ev)
    } catch { /* fail-soft：订阅者异常不拖垮总线 */ }
  }
}

// ---------- 追加与查询 ----------

export function appendGovEvent(input: Omit<GovEvent, 'eventId' | 'ts'> & { eventId?: string; ts?: number }): GovEvent {
  if (!GOV_EVENT_DOMAINS.includes(input.domain)) throw new Error(`domain 非法：${input.domain}`)
  if (!GOV_EVENT_SEVERITIES.includes(input.severity)) throw new Error(`severity 非法：${input.severity}`)
  const ev: GovEvent = {
    eventId: input.eventId ?? `gov-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`,
    ts: input.ts ?? Date.now(),
    domain: input.domain,
    severity: input.severity,
    type: input.type,
    source: input.source,
    summary: input.summary,
    ...(input.payload ? { payload: input.payload } : {}),
    ...(input.refs ? { refs: input.refs } : {}),
  }
  try {
    mkdirSync(govEventDir(), { recursive: true })
    appendFileSync(eventFile(), JSON.stringify(ev) + '\n')
  } catch { /* 落盘失败不阻断主链路（fire-soft）；查询侧如实看到缺条 */ }
  fanOut(ev)
  return ev
}

export interface GovEventQuery {
  domain?: GovEventDomain
  severity?: GovEventSeverity
  minSeverity?: GovEventSeverity
  typePrefix?: string
  sinceMs?: number
  limit?: number
}

/** 查询（新在前）。坏行跳过（JSONL 尾写半行等）。 */
export function queryGovEvents(q: GovEventQuery = {}): GovEvent[] {
  const file = eventFile()
  if (!existsSync(file)) return []
  let lines: string[]
  try {
    lines = readFileSync(file, 'utf8').split('\n')
  } catch { return [] }
  const limit = Math.max(1, Math.min(q.limit ?? 100, CAP))
  const out: GovEvent[] = []
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    const line = lines[i].trim()
    if (!line) continue
    let ev: GovEvent
    try { ev = JSON.parse(line) as GovEvent } catch { continue }
    if (q.domain && ev.domain !== q.domain) continue
    if (q.severity && ev.severity !== q.severity) continue
    if (q.minSeverity && SEVERITY_ORDER[ev.severity] < SEVERITY_ORDER[q.minSeverity]) continue
    if (q.typePrefix && !ev.type.startsWith(q.typePrefix)) continue
    if (q.sinceMs && ev.ts < q.sinceMs) continue
    out.push(ev)
  }
  return out
}

/** 环形裁剪（CAP）：独立调用（追加高频域由收口方定期调用；读侧不隐式改写文件）。 */
export function compactGovEvents(): { before: number; after: number } {
  const file = eventFile()
  if (!existsSync(file)) return { before: 0, after: 0 }
  let lines: string[] = []
  try { lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()) } catch { return { before: 0, after: 0 } }
  if (lines.length <= CAP) return { before: lines.length, after: lines.length }
  const kept = lines.slice(lines.length - CAP)
  try {
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
    const { writeFileSync, renameSync } = require('fs') as typeof import('fs')
    writeFileSync(tmp, kept.join('\n') + '\n')
    renameSync(tmp, file)
  } catch { /* 裁剪失败不炸（下次重试） */ }
  return { before: lines.length, after: kept.length }
}

/** 测试隔离。 */
export function _useGovEventDirForTests(dir: string): void {
  process.env.HERMES_GOV_EVENT_DIR = dir
}

export function _resetGovEventDirForTests(): void {
  delete process.env.HERMES_GOV_EVENT_DIR
}
