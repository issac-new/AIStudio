/**
 * 跨机派发账本聚合（4A 治理层第六期①服务端面）——dispatch-ledger 的 target 维度统计。
 *
 * 定位：dispatch.successRate 的服务端权威源。与客户端 dispatch-kv 的派生存量
 * （localStorage 索引）互补：服务端读的是引擎真实落账（append-only，含 reason 词表），
 * 客户端索引是 lastStatus 视图；二者口径分列，不合并（单一事实源在派发台账）。
 *
 * 聚合语义：同一 taskId 多条事件按 ts 最新一条为准（幂等覆盖，对齐 task.receipt 语义）。
 * delivered=created/running；failed=failed；waiting-human/done 为终态不计成败。
 */
import { readDispatchLedger } from './dispatch-ledger'
import type { DispatchLedgerEntry } from './dispatch-ledger'

export interface CrossMachineDispatchStats {
  total: number
  created: number
  running: number
  done: number
  failed: number
  waitingHuman: number
  deliveredRate: number | null
  byReason: Record<string, number>
  lastAt: number | null
  found: boolean
}

const TERMINAL_OK = new Set(['created', 'running'])

export function deriveDispatchLedgerStats(entries: DispatchLedgerEntry[]): CrossMachineDispatchStats {
  // 按 taskId 取最新一条（幂等覆盖）
  const latest = new Map<string, DispatchLedgerEntry>()
  let lastAt: number | null = null
  for (const e of entries) {
    const prev = latest.get(e.commandId ?? `${e.ts}-${e.target}`)
    if (!prev || e.ts >= prev.ts) latest.set(e.commandId ?? `${e.ts}-${e.target}`, e)
    if (e.ts > (lastAt ?? 0)) lastAt = e.ts
  }
  const c = { created: 0, running: 0, done: 0, failed: 0, waitingHuman: 0 }
  const byReason: Record<string, number> = {}
  for (const e of latest.values()) {
    byReason[e.reason] = (byReason[e.reason] ?? 0) + 1
    if (e.reason === 'queued' || e.reason === 'coalesced') c.created += 1
    else if (e.reason === 'deferred') c.waitingHuman += 1
    else if (['engine_unreachable', 'handshake_failed', 'command_rejected', 'internal_error', 'target_unavailable'].includes(e.reason)) c.failed += 1
    else c.running += 1
  }
  const delivered = c.created
  const denom = delivered + c.failed
  return {
    total: latest.size,
    ...c,
    deliveredRate: denom > 0 ? delivered / denom : null,
    byReason,
    lastAt,
    found: entries.length > 0,
  }
}

export function crossMachineDispatchStats(): CrossMachineDispatchStats {
  return deriveDispatchLedgerStats(readDispatchLedger(2000))
}
