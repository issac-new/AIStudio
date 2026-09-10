// overlay/custom/client/loop/runcenter/adapters/intervention.ts
// 介入层投影（task-7）：peek 行内展开 / 审批 interrupt payload 结构化 /
// A2 超时自动通过识别 / 节点检查器数据组织。组件薄壳化的纯函数层——
// 不触网络与 DOM，不改入参，双词汇事件（socket GraphEvent ∪ 日志 GraphLogEvent）
// 经 run-graph.ts 的 ReplayEventLike 公共超集消费（结构赋值，零模块耦合）。
//
// 服务端事实源（只读对齐，不 import server 模块）：
// - 审批 interrupt value：phase-nodes.ts validation 节点 { kind:'approval', contractId,
//   loopId, prompt, contractSummary, policy:{ approvers, policy, onReject, timeout? } }；
// - 超时自动通过 resume 值（interrupt-timeout.ts AUTO_APPROVE_VALUE）：
//   { auto:true, decision:'approved', reason:'timeout', autoApproved:true }；
// - node.completed：socket result.update 携带真实键值，事件日志 payload 仅 updateKeys
//   （graph-runtime.logPayload 只落键名，不落值）。

import type { ReplayEventLike } from './run-graph'
import { canonicalEventType } from './run-graph'

// ---------------------------------------------------------------------------
// peek 投影（列表行内展开的最新事件摘要）
// ---------------------------------------------------------------------------

/** peek 摘要行（原值透传，组件层零翻译） */
export interface PeekLine {
  ts: string | number
  /** 事件名原值（socket type 优先，日志 kind 兜底） */
  type: string
  step?: number
  nodeId?: string
  error?: string
  /** A2 超时自动通过的 resume 事件标记（runcenter.approval.timeoutAuto 文案位） */
  autoApproved: boolean
}

/** latestEvents — 最新 n 条事件摘要（保持时间序：旧→新）；n 缺省 3 */
export function latestEvents(events: readonly ReplayEventLike[], n: number = 3): PeekLine[] {
  return events.slice(-n).map(e => ({
    ts: e.ts,
    type: e.kind ?? e.type ?? '',
    ...(typeof e.step === 'number' ? { step: e.step } : {}),
    ...(typeof e.nodeId === 'string' && e.nodeId ? { nodeId: e.nodeId } : {}),
    ...(typeof e.error === 'string' && e.error ? { error: e.error } : {}),
    autoApproved: isAutoResume(e),
  }))
}

// ---------------------------------------------------------------------------
// 审批 interrupt payload 结构化（ApprovalPanel 数据源）
// ---------------------------------------------------------------------------

export interface ApprovalInterruptView {
  interruptId: string
  prompt: string
  contractId: string | null
  /** 契约摘要原值（id/source/ref/summary/artifactType/attempts），畸形不炸 */
  contractSummary: Record<string, unknown> | null
  /** 通过策略原值：all / majority / any / specified（组件层翻译） */
  policy: string
  /** 审批人展示标签：数组逗号连接；channel/assignee 来源渲染 from:* */
  approversLabel: string
  /** 拒绝去向：'fail' 或 goto 目标节点名 */
  onReject: string
  /** 超时策略（P2 台账 h）：value.timeout 原值裁剪；无则 null */
  timeout: { ms: number | null; onTimeout: string | null } | null
  /** interrupt 挂起时刻（已等时长起点） */
  raisedAt: string | number | null
}

/** interrupt value 读取：socket 顶层 value ∪ 日志 payload.value */
function interruptValueOf(e: ReplayEventLike): Record<string, unknown> | null {
  const raw = e.value ?? e.payload?.value
  return raw != null && typeof raw === 'object' ? raw as Record<string, unknown> : null
}

/** interruptId 读取：顶层 ∪ payload */
function interruptIdOf(e: ReplayEventLike): string | null {
  const raw = e.interruptId ?? e.payload?.interruptId
  return typeof raw === 'string' && raw ? raw : null
}

/** resume 值读取：socket resumeValue ∪ 日志 payload.value */
function resumeValueOf(e: ReplayEventLike): Record<string, unknown> | null {
  const raw = e.resumeValue ?? e.payload?.value
  return raw != null && typeof raw === 'object' ? raw as Record<string, unknown> : null
}

/** 审批人展示标签：名单逗号连接；{ from, name? } 渲染 `from:<channel>[:<name>]` */
function approversLabelOf(raw: unknown): string {
  if (Array.isArray(raw)) return raw.map(x => String(x)).join(', ')
  if (raw != null && typeof raw === 'object') {
    const o = raw as { from?: unknown; name?: unknown }
    if (typeof o.from === 'string') {
      return typeof o.name === 'string' && o.name ? `from:${o.from}:${o.name}` : `from:${o.from}`
    }
  }
  return ''
}

/**
 * parseApprovalInterrupt — 最后一个未决审批 interrupt 的结构化视图。
 * 未决判定与 latestOpenInterrupt 同一扫描语义（resume 同 id / 终态关闭）；
 * 无未决 interrupt 返回 null（面板不渲染）；value 畸形返回骨架视图不抛错。
 */
export function parseApprovalInterrupt(events: readonly ReplayEventLike[]): ApprovalInterruptView | null {
  let open: ReplayEventLike | null = null
  let openId: string | null = null
  for (const e of events) {
    const kind = canonicalEventType(e)
    if (kind === 'interrupted') {
      const id = interruptIdOf(e)
      if (id) { open = e; openId = id }
    } else if (kind === 'resumed' && interruptIdOf(e) === openId) {
      open = null
      openId = null
    } else if (kind === 'run-completed' || kind === 'run-failed') {
      open = null
      openId = null
    }
  }
  if (!open || !openId) return null

  const value = interruptValueOf(open)
  const policy = (value?.policy ?? null) as Record<string, unknown> | null
  const timeoutRaw = (policy?.timeout ?? null) as Record<string, unknown> | null
  return {
    interruptId: openId,
    prompt: typeof value?.prompt === 'string' ? value.prompt : '',
    contractId: typeof value?.contractId === 'string' ? value.contractId : null,
    contractSummary: value?.contractSummary != null && typeof value.contractSummary === 'object'
      ? value.contractSummary as Record<string, unknown>
      : null,
    policy: typeof policy?.policy === 'string' ? policy.policy : '',
    approversLabel: approversLabelOf(policy?.approvers),
    onReject: typeof policy?.onReject === 'object' && policy.onReject !== null
      ? String((policy.onReject as { goto?: unknown }).goto ?? '')
      : typeof policy?.onReject === 'string' ? policy.onReject : '',
    timeout: timeoutRaw
      ? {
          ms: typeof timeoutRaw.ms === 'number' && Number.isFinite(timeoutRaw.ms) ? timeoutRaw.ms : null,
          onTimeout: typeof timeoutRaw.onTimeout === 'string' ? timeoutRaw.onTimeout : null,
        }
      : null,
    raisedAt: open.ts,
  }
}

// ---------------------------------------------------------------------------
// A2 超时自动通过识别（interrupt-timeout.ts AUTO_APPROVE_VALUE 对齐）
// ---------------------------------------------------------------------------

/**
 * isAutoResume — 该事件是否"超时自动通过"的 resume：
 * resume 值（socket resumeValue ∪ 日志 payload.value）带 auto/autoApproved，
 * 或日志 payload 顶层 autoApproved 投影（graph-runtime.logPayload）。非 resume 恒 false。
 */
export function isAutoResume(e: ReplayEventLike): boolean {
  const kind = canonicalEventType(e)
  if (kind !== 'resumed') return false
  if ((e.payload as { autoApproved?: unknown } | undefined)?.autoApproved === true) return true
  const value = resumeValueOf(e)
  return value?.auto === true || value?.autoApproved === true
}

/** latestResumeIsAuto — 最后一条 resume 是否自动通过（上一轮审批超时横幅的判定源） */
export function latestResumeIsAuto(events: readonly ReplayEventLike[]): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    if (canonicalEventType(events[i]) === 'resumed') return isAutoResume(events[i])
  }
  return false
}

// ---------------------------------------------------------------------------
// 节点检查器数据组织（attach 档）
// ---------------------------------------------------------------------------

export interface NodeInspection {
  nodeId: string
  /** 该节点关联事件（时间序）：nodeId 命中 ∪ resume 按 interruptId 归位 */
  events: ReplayEventLike[]
  /** 最近一次 update 的 channel 键值：socket 有真实键值，日志只有键名 */
  lastUpdate: {
    ts: string | number
    updateKeys: string[]
    update: Record<string, unknown> | null
  } | null
  /** 最近一次失败的人类可读原因（顶层 error ∪ payload.error） */
  error: string | null
}

/** 错误事实读取：顶层 error ∪ payload.error（字符串非空才算） */
function errorOf(e: ReplayEventLike): string | null {
  const raw = e.payload?.error ?? e.error
  return typeof raw === 'string' && raw ? raw : null
}

/**
 * inspectNode — 选中节点的检查器视图模型（纯函数）：
 * - 关联事件：nodeId 直接命中；resume 常不带 nodeId，按"该节点曾发出的 interruptId"归位
 *   （与 run-graph.buildRunGraph 的 interruptNodeById 同一映射语义）；
 * - lastUpdate：最后一次 completed 的 update——socket result.update（真实键值）优先，
 *   日志 payload.updateKeys（仅键名）兜底（日志不落值是服务端契约，非缺陷）；
 * - error：最后一次 failed 的错误文本。
 */
export function inspectNode(events: readonly ReplayEventLike[], nodeId: string): NodeInspection {
  // 第一遍：该节点发出的 interruptId 集合（resume 归位映射）
  const ownInterruptIds = new Set<string>()
  for (const e of events) {
    if (canonicalEventType(e) !== 'interrupted') continue
    if (e.nodeId !== nodeId) continue
    const id = interruptIdOf(e)
    if (id) ownInterruptIds.add(id)
  }

  const related: ReplayEventLike[] = []
  let lastUpdate: NodeInspection['lastUpdate'] = null
  let error: string | null = null

  for (const e of events) {
    const kind = canonicalEventType(e)
    const isOwnNode = e.nodeId === nodeId
    const isOwnResume = kind === 'resumed' && (() => {
      const id = interruptIdOf(e)
      return id !== null && ownInterruptIds.has(id)
    })()
    if (!isOwnNode && !isOwnResume) continue
    related.push(e)

    if (kind === 'completed' && isOwnNode) {
      // socket：result.update 真实键值；日志：payload.update（若服务端未来落值）或 updateKeys 仅键名
      const rawUpdate = e.result?.update ?? e.payload?.update
      if (rawUpdate != null && typeof rawUpdate === 'object') {
        lastUpdate = {
          ts: e.ts,
          updateKeys: Object.keys(rawUpdate as Record<string, unknown>),
          update: rawUpdate as Record<string, unknown>,
        }
      } else {
        const keys = e.payload?.updateKeys
        if (Array.isArray(keys)) {
          lastUpdate = {
            ts: e.ts,
            updateKeys: keys.filter((k): k is string => typeof k === 'string'),
            update: null,
          }
        }
      }
    }
    if (kind === 'failed') {
      const err = errorOf(e)
      if (err) error = err
    }
  }

  return { nodeId, events: related, lastUpdate, error }
}

// ---------------------------------------------------------------------------
// 时长标签（locale 无关，与画布 durationLabel 同语言）
// ---------------------------------------------------------------------------

/**
 * formatDurationMs — 毫秒 → 紧凑时长：<1s 为 ms；<1min 为秒；<1h 为 m+s；
 * <1d 为 h+m；更长为 d+h。负值/非有限值夹为 '0ms'。
 */
export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3_600_000) {
    return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`
  }
  if (ms < 86_400_000) {
    return `${Math.floor(ms / 3_600_000)}h${Math.floor((ms % 3_600_000) / 60_000)}m`
  }
  return `${Math.floor(ms / 86_400_000)}d${Math.floor((ms % 86_400_000) / 3_600_000)}h`
}
