// overlay/custom/client/ia2/utils/records.ts
// 执行记录面纯函数（AgentTeams 吸收批二）：outcome 徽标映射 / 筛选参数序列化
// （空值不下发）/ 分页按钮状态矩阵 / 列表→详情路由解析 / 时间与体量格式。
// 视图与 api 层只消费不复制这些判定（单一事实源）；本模块不 import 组件与
// api（api 层反向依赖本文件的序列化，保持单向），node 环境可直跑。

export type RecordKind = 'coding-run' | 'delegate'
export type RecordOutcome = 'success' | 'failed' | 'timeout' | 'blocked'

/** 列表筛选条的四值形状（空串=不过滤；序列化时空值不下发） */
export interface RecordFilterValues {
  kind?: string
  outcome?: string
  agent?: string
  task?: string
}

/** 列表默认页大小（与服务端默认一致即可对账；显式下发便于 URL 可核对） */
export const DEFAULT_RECORDS_PAGE_SIZE = 50

/**
 * 筛选参数序列化：空串/空白值不下发；limit 恒下发（非法回落默认页大小），
 * offset 仅 >0 时下发。返回带前导 ? 的 query 串（limit 恒在故永不为空串）。
 */
export function serializeRecordFilters(filters: RecordFilterValues | undefined, limit?: number, offset?: number): string {
  const parts: string[] = []
  const push = (key: string, raw: unknown): void => {
    const v = typeof raw === 'string' ? raw.trim() : ''
    if (v) parts.push(`${key}=${encodeURIComponent(v)}`)
  }
  push('kind', filters?.kind)
  push('outcome', filters?.outcome)
  push('agent', filters?.agent)
  push('task', filters?.task)
  const lim = Number(limit)
  parts.push(`limit=${Number.isFinite(lim) && lim > 0 ? Math.floor(lim) : DEFAULT_RECORDS_PAGE_SIZE}`)
  const off = Number(offset)
  if (Number.isFinite(off) && off > 0) parts.push(`offset=${Math.floor(off)}`)
  return `?${parts.join('&')}`
}

// ── outcome 徽标（配色 token 落在视图 CSS：fresh 绿 / fail 红 / stale 黄 /
//    text-muted 灰——四处 token 均已 grep 核实存在于 ia2.scss）──────────────

export type OutcomeBadgeClass = 'rec-badge--success' | 'rec-badge--failed' | 'rec-badge--timeout' | 'rec-badge--blocked'

const OUTCOME_BADGE: Record<RecordOutcome, OutcomeBadgeClass> = {
  success: 'rec-badge--success',
  failed: 'rec-badge--failed',
  timeout: 'rec-badge--timeout',
  blocked: 'rec-badge--blocked',
}

/** 未知 outcome 回落灰色（照录不猜色） */
export function outcomeBadgeClass(outcome: string): OutcomeBadgeClass {
  return OUTCOME_BADGE[outcome as RecordOutcome] ?? 'rec-badge--blocked'
}

const OUTCOME_LABEL: Record<RecordOutcome, { zh: string; en: string }> = {
  success: { zh: '成功', en: 'Success' },
  failed: { zh: '失败', en: 'Failed' },
  timeout: { zh: '超时', en: 'Timeout' },
  blocked: { zh: '被阻止', en: 'Blocked' },
}

/** 未知 outcome 原样展示（不吞不猜） */
export function outcomeLabel(outcome: string, locale: 'zh' | 'en' = 'zh'): string {
  const l = OUTCOME_LABEL[outcome as RecordOutcome]
  return l ? (locale === 'zh' ? l.zh : l.en) : outcome
}

const KIND_LABEL: Record<RecordKind, { zh: string; en: string }> = {
  'coding-run': { zh: '编码运行', en: 'Coding run' },
  delegate: { zh: '委托通道', en: 'Delegate' },
}

/** 未知 kind 原样展示 */
export function kindLabel(kind: string, locale: 'zh' | 'en' = 'zh'): string {
  const l = KIND_LABEL[kind as RecordKind]
  return l ? (locale === 'zh' ? l.zh : l.en) : kind
}

// ── 分页（offset 式：上一页/下一页按钮状态矩阵）──────────────────────────

export interface RecordsPaginationState {
  /** offset≤0 无上一页 */
  prevDisabled: boolean
  /** 服务端 hasMore=false 无下一页 */
  nextDisabled: boolean
  /** 1 起页码（offset/limit+1；limit 非法按 1 兜底不炸除法） */
  pageNo: number
}

export function paginationState(offset: number, limit: number, hasMore: boolean): RecordsPaginationState {
  const lim = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 1
  const off = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0
  return {
    prevDisabled: off <= 0,
    nextDisabled: !hasMore,
    pageNo: Math.floor(off / lim) + 1,
  }
}

// ── 列表 → 详情路由解析 ──────────────────────────────────────────────────

/** 详情路由目标（vue-router 按名跳；name 与 routes.ts ia2.recordDetail 对齐） */
export interface RecordDetailTarget {
  name: 'ia2.recordDetail'
  params: { kind: RecordKind; id: string }
}

/** 详情定位所需的最小记录形状（不依赖 api 类型，避免环） */
export interface RecordDetailLike {
  kind: string
  taskId?: string
  sessionId?: string
}

/**
 * 记录 → 详情路由：delegate 按 taskId、coding-run 按 sessionId；定位键缺席
 * 或 kind 未知返回 null（列表渲染纯文本，不造死链）。
 */
export function detailRouteOf(rec: RecordDetailLike | null | undefined): RecordDetailTarget | null {
  if (!rec) return null
  if (rec.kind === 'delegate') {
    const id = rec.taskId?.trim()
    return id ? { name: 'ia2.recordDetail', params: { kind: 'delegate', id } } : null
  }
  if (rec.kind === 'coding-run') {
    const id = rec.sessionId?.trim()
    return id ? { name: 'ia2.recordDetail', params: { kind: 'coding-run', id } } : null
  }
  return null
}

// ── 展示格式（fail-soft：未知值给「—」，不猜数）──────────────────────────

/** epoch ms / ISO 串 → 本地时间串；缺失或不可解析如实回落（空入参=「—」） */
export function formatRecordTime(at: number | string | undefined | null): string {
  if (at === undefined || at === null || at === '') return '—'
  const n = typeof at === 'number' ? at : Date.parse(String(at))
  if (!Number.isFinite(n)) return String(at)
  return new Date(n).toLocaleString('zh-CN', { hour12: false })
}

/** 起止耗时：缺任一侧或负值（时钟偏移）=「—」；秒/分秒/时分两段式 */
export function formatDurationLabel(startedAt?: number, endedAt?: number): string {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return '—'
  const ms = Number(endedAt) - Number(startedAt)
  if (ms < 0) return '—'
  const sec = ms / 1000
  if (sec < 60) return `${sec.toFixed(1)} 秒`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分 ${String(Math.floor(sec % 60)).padStart(2, '0')} 秒`
  return `${Math.floor(min / 60)} 时 ${String(min % 60).padStart(2, '0')} 分`
}

/** 日志体量：B/KiB/MiB（一位小数只在进位后有意义时给）；缺失=「—」 */
export function formatLogBytes(bytes: number | undefined): string {
  if (!Number.isFinite(bytes) || Number(bytes) < 0) return '—'
  const n = Number(bytes)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
  return `${(n / (1024 * 1024)).toFixed(1)} MiB`
}
