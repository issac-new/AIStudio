// overlay/outbox 域：派发器（Always-on Agents 吸收 P2，2026-11-16）。
//
// 一次 dispatchDue 的职责（文章「Dispatcher 决定何时、以何形式推送」）：
// 1) 到期候选（pending ∧ notBefore<=now），critical 排最前；
// 2) 非 critical 复检注意力预算（安静时段/日预算/时预算）——被挡则推到下一窗口，不丢；
// 3) normal 消息按 mergeKey 合并成一条 digest（≤10 条），一条发送；
// 4) 通道发送：inbox 恒可用；matrix 仅在 OUTBOX_MATRIX_ROOM 配置时启用（fail-soft）；
// 5) 失败退避 30s/120s，3 次转 failed 死信；终态写 Run 收口账本（P1 协议）。
//
// 设计取舍（spec D4）：限流在派发时复检而非入队时——defer 到期重投必须用「当刻」预算，
// 入队时判定会过期。
import { deliver } from '../inbox/inbox-store'
import { messageContent } from '../orchestrator/delivery'
import { matrixSend } from '../matrix/chat-bridge'
import { resolveMatrixDispatchEnv } from '../matrix/raci-matrix'
import { readAttentionPrefs } from '../proactivity/interventions-service'
import type { AttentionPrefs } from '../proactivity/intervention-governor'
import { recordRunOutcome } from '../notify/run-outcome'
import {
  listOutbox, loadOutbox, nextAttemptState, pendingDue, updateOutbox,
  type OutboxMessage, type OutboxPriority, type OutboxRecipient,
} from './outbox-store'

export interface DispatchOutcome {
  id: string
  status: 'delivered' | 'merged' | 'deferred' | 'failed'
  reason: string
  channel?: string
}

export interface DispatchResult {
  scanned: number
  delivered: number
  merged: number
  deferred: number
  failed: number
  outcomes: DispatchOutcome[]
}

/** 入队 source → Run 收口 runKind（统计口径；未知来源归 manual，不猜）。 */
function runKindOf(source: string): 'automation' | 'kanban' | 'loop' | 'followup' | 'manual' {
  if (source === 'proactivity') return 'kanban'
  if (source === 'automation') return 'automation'
  if (source === 'loop') return 'loop'
  if (source === 'followup') return 'followup'
  return 'manual'
}

export interface DispatchDeps {
  now?: number
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
  prefs?: AttentionPrefs
  limit?: number
}

/** 安静时段（含跨午夜）：[start,end)；start===end 视为不设。纯函数。 */
export function inQuietHours(hour: number, startHour: number, endHour: number): boolean {
  if (startHour === endHour) return false
  return startHour < endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour
}

/** 按收件人统计窗口内已投递条数（预算口径：投递成功才算打扰）。 */
export function deliveredCount(messages: OutboxMessage[], recipient: OutboxRecipient, since: number): number {
  return messages.filter((m) => m.status === 'delivered'
    && m.recipient.kind === recipient.kind && m.recipient.name === recipient.name
    && (m.deliveredAt ?? 0) >= since).length
}

/** 合并多条同键消息为一条 digest（≤10 条；超出部分截断并在尾部注明）。纯函数。 */
export function mergeBodies(messages: OutboxMessage[], cap = 10): string {
  const shown = messages.slice(0, cap)
  const lines = shown.map((m) => `- ${m.body.replace(/\s+/g, ' ').trim()}`)
  const extra = messages.length - shown.length
  return `${messages.length} 条更新：\n${lines.join('\n')}${extra > 0 ? `\n…另有 ${extra} 条` : ''}`
}

/** 派发一轮。不抛：单条失败不影响其余；返回逐条结局供 REST 与测试消费。 */
export async function dispatchDue(opts: DispatchDeps = {}): Promise<DispatchResult> {
  const now = typeof opts.now === 'number' ? opts.now : Date.now()
  const env = opts.env ?? process.env
  const doFetch = opts.fetchImpl ?? fetch
  const prefs = opts.prefs ?? readAttentionPrefs()
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  const matrixEnv = resolveMatrixDispatchEnv(env)
  const matrixRoom = (env.OUTBOX_MATRIX_ROOM ?? '').trim()
  const candidates = pendingDue(now, limit)
  const result: DispatchResult = { scanned: candidates.length, delivered: 0, merged: 0, deferred: 0, failed: 0, outcomes: [] }

  // 合并分组：仅 normal 且带 mergeKey 的消息成组；critical/high 永不合并（时效优先）。
  const groups = new Map<string, OutboxMessage[]>()
  const singles: OutboxMessage[] = []
  for (const m of candidates) {
    if (m.priority === 'normal' && m.mergeKey) {
      const key = `${m.mergeKey}|${m.recipient.kind}|${m.recipient.name}|${m.channel}`
      const arr = groups.get(key) ?? []
      arr.push(m)
      groups.set(key, arr)
    } else {
      singles.push(m)
    }
  }

  const dispatchOne = async (primary: OutboxMessage, body: string, absorbed: OutboxMessage[]): Promise<void> => {
    // 预算复检（critical 豁免）：reject 时推到下一窗口，不丢消息。
    if (primary.priority !== 'critical') {
      const hour = new Date(now).getHours()
      const quiet = prefs.quietHours
      if (quiet && inQuietHours(hour, quiet.startHour, quiet.endHour)) {
        const notBefore = nextQuietWindowEnd(now, quiet.endHour)
        updateOutbox(primary.id, { notBefore })
        result.deferred += 1
        result.outcomes.push({ id: primary.id, status: 'deferred', reason: 'quiet-hours' })
        recordRunOutcome({
          runId: primary.runId ?? primary.id, runKind: runKindOf(primary.source), audience: 'human',
          outcome: 'deferred', reasonCode: 'quiet-hours', refs: [`outbox:${primary.id}`], at: now,
        })
        return
      }
      const all = loadOutbox()
      if (deliveredCount(all, primary.recipient, now - 86_400_000) >= prefs.dailyBudget) {
        updateOutbox(primary.id, { notBefore: now + 3_600_000 })
        result.deferred += 1
        result.outcomes.push({ id: primary.id, status: 'deferred', reason: 'daily-budget' })
        recordRunOutcome({
          runId: primary.runId ?? primary.id, runKind: runKindOf(primary.source), audience: 'human',
          outcome: 'deferred', reasonCode: 'budget-capped', refs: [`outbox:${primary.id}`], at: now,
        })
        return
      }
      if (deliveredCount(all, primary.recipient, now - 3_600_000) >= prefs.hourlyBudget) {
        updateOutbox(primary.id, { notBefore: now + 900_000 })
        result.deferred += 1
        result.outcomes.push({ id: primary.id, status: 'deferred', reason: 'hourly-budget' })
        recordRunOutcome({
          runId: primary.runId ?? primary.id, runKind: runKindOf(primary.source), audience: 'human',
          outcome: 'deferred', reasonCode: 'budget-capped', refs: [`outbox:${primary.id}`], at: now,
        })
        return
      }
    }

    try {
      updateOutbox(primary.id, { status: 'delivering' })
      if (primary.channel === 'matrix') {
        if (!matrixEnv || !matrixRoom) throw new Error('matrix_not_configured（OUTBOX_MATRIX_ROOM/网关凭证缺席）')
        await matrixSend(matrixEnv, matrixRoom, 'm.room.message', messageContent(body, null), doFetch, primary.id)
      } else {
        deliver({
          itemId: primary.id,
          type: 'proactive_notice',
          severity: primary.priority === 'critical' ? 'action_required' : primary.priority === 'high' ? 'attention' : 'info',
          recipientKind: primary.recipient.kind,
          recipient: primary.recipient.name,
          body,
          at: now,
          read: false,
          archived: false,
        })
      }
      updateOutbox(primary.id, {
        status: 'delivered', deliveredAt: now, attempts: primary.attempts + 1, lastError: undefined,
      })
      for (const absorbedMsg of absorbed) {
        updateOutbox(absorbedMsg.id, {
          status: 'delivered', deliveredAt: now, attempts: absorbedMsg.attempts + 1, mergedInto: primary.id,
        })
      }
      result.delivered += 1
      result.merged += absorbed.length
      result.outcomes.push({
        id: primary.id,
        status: absorbed.length ? 'merged' : 'delivered',
        reason: absorbed.length ? `merged:${absorbed.length}` : 'ok',
        channel: primary.channel,
      })
      recordRunOutcome({
        runId: primary.runId ?? primary.id, runKind: runKindOf(primary.source), audience: 'human',
        outcome: 'outbox', reasonCode: 'delivered', refs: [`outbox:${primary.id}`], at: now,
      })
    } catch (err) {
      const next = nextAttemptState(primary, now, err instanceof Error ? err.message : String(err))
      updateOutbox(primary.id, next)
      result.failed += 1
      result.outcomes.push({
        id: primary.id,
        status: next.status === 'failed' ? 'failed' : 'deferred',
        reason: next.lastError ?? 'send-failed',
        channel: primary.channel,
      })
      recordRunOutcome({
        runId: primary.runId ?? primary.id, runKind: runKindOf(primary.source), audience: 'human',
        outcome: next.status === 'failed' ? 'silence' : 'deferred',
        reasonCode: next.status === 'failed' ? 'error' : 'deferred-window',
        refs: [`outbox:${primary.id}`], at: now,
      })
    }
  }

  for (const m of singles) await dispatchOne(m, m.body, [])
  for (const group of groups.values()) {
    const [primary, ...absorbed] = group
    await dispatchOne(primary, group.length > 1 ? mergeBodies(group) : primary.body, absorbed)
  }
  return result
}

/** 当前时刻之后的安静时段结束点（跨午夜时取今日 endHour，否则取今日 endHour 或明日）。 */
export function nextQuietWindowEnd(now: number, endHour: number): number {
  const d = new Date(now)
  const end = new Date(now)
  end.setHours(endHour, 0, 0, 0)
  if (end.getTime() <= now) end.setDate(end.getDate() + 1)
  // 兜底：若计算异常（夏令时等）至少推迟 1 小时，避免立即重试打转。
  return Math.max(end.getTime(), now + 3_600_000)
}

/** 统计读数（controller 用）：pending 的优先级分布与最老等待时长。 */
export function outboxBacklog(now = Date.now()) {
  const messages = listOutbox({ status: 'pending', limit: 500 })
  const byPriority: Record<OutboxPriority, number> = { critical: 0, high: 0, normal: 0 }
  let oldest: number | null = null
  for (const m of messages) {
    byPriority[m.priority] += 1
    oldest = oldest === null ? m.createdAt : Math.min(oldest, m.createdAt)
  }
  return {
    pending: messages.length,
    byPriority,
    oldestAgeMs: oldest === null ? null : Math.max(0, now - oldest),
  }
}
