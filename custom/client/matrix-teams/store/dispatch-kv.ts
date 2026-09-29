// overlay/custom/client/matrix-teams/store/dispatch-kv.ts
// 外派任务防重索引：taskId → 本地落地信息（localStorage，模式同 cockpit-kv）。
import type { ReceiptStatus } from '../protocol'

export const DISPATCH_INDEX_KEY = 'matrix-teams.dispatchIndex'

export interface DispatchIndexEntry {
  localTaskId: string
  lastStatus: ReceiptStatus
  lastSyncedAt: number
}

export function loadDispatchIndex(): Record<string, DispatchIndexEntry> {
  try {
    const raw = localStorage.getItem(DISPATCH_INDEX_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, DispatchIndexEntry> : {}
  } catch { return {} }
}

export function saveDispatchIndex(map: Record<string, DispatchIndexEntry>): void {
  try { localStorage.setItem(DISPATCH_INDEX_KEY, JSON.stringify(map)) } catch { /* quota 静默 */ }
}

// ── 4A 治理层第六期①：跨机派发成功率聚合（本机侧；集群汇总由 Matrix 房间事件另行接线）──

export interface CrossMachineDispatchStats {
  total: number
  created: number
  running: number
  done: number
  failed: number
  waitingHuman: number
  /** 成功率口径：receipt 达 created/running 的占比（跨机 dispatch.successRate 的本地计算面）。 */
  deliveredRate: number | null
}

export function deriveDispatchStats(index: Record<string, DispatchIndexEntry>): CrossMachineDispatchStats {
  const entries = Object.values(index)
  const c = { total: entries.length, created: 0, running: 0, done: 0, failed: 0, waitingHuman: 0 }
  for (const e of entries) {
    if (e.lastStatus === 'created') c.created += 1
    else if (e.lastStatus === 'running') c.running += 1
    else if (e.lastStatus === 'done') c.done += 1
    else if (e.lastStatus === 'failed') c.failed += 1
    else if (e.lastStatus === 'waiting-human') c.waitingHuman += 1
  }
  const delivered = c.created + c.running
  const denom = delivered + c.failed
  return { ...c, deliveredRate: denom > 0 ? delivered / denom : null }
}

/** 读取并聚合（供面板/审计消费；kv 缺席如实零态）。 */
export function loadDispatchStats(): CrossMachineDispatchStats {
  return deriveDispatchStats(loadDispatchIndex())
}
