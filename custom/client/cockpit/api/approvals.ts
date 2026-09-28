// overlay/custom/client/cockpit/api/approvals.ts
// P1 审批收件箱 API 客户端（/api/approvals/*）。
import { request } from '@/api/client'

export interface PendingApprovalItem {
  id: string
  kind: 'command' | 'review'
  title: string
  detail: string
  sessionId?: string
  profile?: string
  taskId?: string
  domain?: string
  baseRef?: string
  choices?: string[]
  createdAt: number
}

export interface ApprovalHistoryEntry {
  id: string
  ts: number
  actor: string
  targetKind: 'command' | 'review' | 'kanban'
  targetId: string
  targetTitle: string
  decision: string
  note?: string
}

export function fetchPendingApprovals(): Promise<{ items: PendingApprovalItem[] }> {
  return request<{ items: PendingApprovalItem[] }>('/api/approvals/pending')
}

export function decideApproval(id: string, decision: string, note?: string, title?: string): Promise<{ ok: boolean; entry?: ApprovalHistoryEntry; detail?: string }> {
  return request('/api/approvals/' + encodeURIComponent(id) + '/decide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, note, title }),
  })
}

export function fetchApprovalHistory(limit = 50): Promise<{ entries: ApprovalHistoryEntry[] }> {
  return request<{ entries: ApprovalHistoryEntry[] }>(`/api/approvals/history?limit=${limit}`)
}
