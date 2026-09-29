// overlay/custom/client/cockpit/api/approvals.ts
// P1 审批收件箱 API 客户端（/api/approvals/*）。
import { request } from '@/api/client'

/** V4-N1 风险档：high 不可逆高危（红标逐条裁决）/ medium 常规 / low 低风险（可自动通过+抽检） */
export type ApprovalRiskTier = 'high' | 'medium' | 'low'

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
  risk?: ApprovalRiskTier
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
  risk?: ApprovalRiskTier
}

export function fetchPendingApprovals(): Promise<{ items: PendingApprovalItem[] }> {
  return request<{ items: PendingApprovalItem[] }>('/api/approvals/pending')
}

/**
 * 待裁决去重（视觉审计 2026-09-29 第 5 条）：同一对象（taskId 优先，无则 title）只保留
 * 最新一条——后端 pending 可能对同一评审对象产生多条记录（run2 实锤 t_9e5c6c18 双卡，
 * 16:27/17:54 各一），前端聚合按新盖旧，避免"2 项待审"实为同卡。
 */
export function dedupePending(items: PendingApprovalItem[]): PendingApprovalItem[] {
  const byKey = new Map<string, PendingApprovalItem>()
  for (const it of items) {
    const key = `${it.kind}:${it.taskId || it.title}`
    const prev = byKey.get(key)
    if (!prev || it.createdAt > prev.createdAt) byKey.set(key, it)
  }
  return [...byKey.values()]
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
