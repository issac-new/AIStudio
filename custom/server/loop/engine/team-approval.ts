// overlay/custom/server/loop/engine/team-approval.ts
import type { MatrixClient } from 'matrix-js-sdk'
import { sendMessage } from '../store/matrix-client'

export type ApprovalDecision = 'approved' | 'rejected' | 'changes-requested' | 'pending'

export interface ApprovalRequest {
  contractId: string
  loopId: string
  approvers: string[]
  summary: string
  worktreeId: string | null
  timestamp: string
}

const APPROVAL_TIMEOUT_MS = 72 * 60 * 60 * 1000  // 72 hours

interface PendingEntry {
  request: ApprovalRequest
  resolves: (decision: ApprovalDecision) => void
}

export class TeamApprovalManager {
  private pending: Map<string, PendingEntry[]> = new Map()

  constructor(private client: MatrixClient, private roomId: string) {}

  async requestApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
    // Register the pending entry synchronously so a caller that fires
    // `handleApprovalResponse` immediately after invoking this method still
    // resolves the returned promise.
    const promise = new Promise<ApprovalDecision>((resolve) => {
      const key = request.loopId
      const pending = this.pending.get(key) ?? []
      pending.push({ request, resolves: resolve })
      this.pending.set(key, pending)

      // Auto-timeout → 'pending'
      setTimeout(() => resolve('pending'), APPROVAL_TIMEOUT_MS)
    })

    // Send approval request to Matrix room
    const mentions = request.approvers.map(a => a.startsWith('@') ? a : `@${a}`).join(' ')
    await sendMessage(this.client, this.roomId, 'm.loop.approval-request', {
      ...request,
      mentions,
      body: `⚠️ Approval needed for ${request.contractId} (${request.summary}). Approvers: ${mentions}`,
    })

    return promise
  }

  handleApprovalResponse(contractId: string, _approver: string, decision: ApprovalDecision): void {
    // Find the pending request for this contract
    for (const [loopId, pendingList] of this.pending.entries()) {
      const idx = pendingList.findIndex(p => p.request.contractId === contractId)
      if (idx >= 0) {
        const { resolves } = pendingList[idx]
        pendingList.splice(idx, 1)
        if (pendingList.length === 0) {
          this.pending.delete(loopId)
        }
        resolves(decision)
        return
      }
    }
  }

  getPendingRequests(loopId: string): ApprovalRequest[] {
    return (this.pending.get(loopId) ?? []).map(p => p.request)
  }
}
