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
