// custom/server/orchestrator/thread.ts
// Thread 订阅与游标（2026-10-31 A+B 批 A 部分）。
// 语义对照 docs/003-execution.md：订阅者在 Thread 上有自己的游标，
// 新事件按游标增量交付；订阅只是上下文投递，不授予授权（授权另由 Decision/Mandate 承载）。
import { advanceCursor, getThread, listSubscriptions, listTriggers, upsertSubscription } from './store'
import type { Subscription, Thread, Trigger } from './types'

export function threadOf(id: string): Thread | null {
  return getThread(id)
}

export function subscribe(input: {
  threadId: string
  subscriber: string
  mode: Subscription['mode']
  cursor?: string | null
}): Subscription {
  return upsertSubscription(input)
}

export function subscriptionsOf(threadId: string): Subscription[] {
  return listSubscriptions(threadId)
}

/**
 * 取订阅者游标之后的增量事件。
 * cursor=null 表示从未读过：只返回最近 `initialLimit` 条（避免新订阅者被全史淹没）。
 * 返回按时间正序，便于调用方顺序注入上下文。
 */
export function pendingFor(threadId: string, subscriber: string, opts: { initialLimit?: number } = {}): Trigger[] {
  const sub = listSubscriptions(threadId).find(s => s.subscriber === subscriber)
  const all = listTriggers(1000).filter(t => t.threadKey === (getThread(threadId)?.threadKey ?? '\u0000'))
  const ordered = all.slice().sort((a, b) => a.receivedAt - b.receivedAt)
  if (!sub || sub.cursor === null) {
    return ordered.slice(-(opts.initialLimit ?? 20))
  }
  const idx = ordered.findIndex(t => t.id === sub.cursor)
  return idx >= 0 ? ordered.slice(idx + 1) : ordered.slice(-(opts.initialLimit ?? 20))
}

/** 推进游标到指定事件；返回是否实际更新（订阅不存在时 false）。 */
export function markRead(threadId: string, subscriber: string, triggerId: string): boolean {
  return advanceCursor(threadId, subscriber, triggerId)
}
