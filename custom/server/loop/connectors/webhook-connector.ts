// overlay/custom/server/loop/connectors/webhook-connector.ts
import type { LoopInstance, TaskContract } from '../types'
import { createContract } from '../engine/task-contract'

export interface WebhookPayload {
  source: string
  eventType: string
  payload: unknown
}

export class WebhookConnector {
  private pendingPayloads: Map<string, WebhookPayload[]> = new Map()

  enqueue(loopId: string, payload: WebhookPayload): void {
    const existing = this.pendingPayloads.get(loopId) ?? []
    existing.push(payload)
    this.pendingPayloads.set(loopId, existing)
  }

  async discover(loop: LoopInstance): Promise<TaskContract[]> {
    const pending = this.pendingPayloads.get(loop.id) ?? []
    if (pending.length === 0) return []
    const contracts = pending.map(p => createContract({
      loopId: loop.id,
      source: { type: 'webhook', ref: `${p.source}:${p.eventType}`, summary: `${p.eventType} from ${p.source}`, rawPayload: p.payload },
      readPlan: { requiredReads: [] },
      writeBoundary: ['packages/**'],
      verificationIntent: { programmatic: [], judge: null, human: null },
      resultTemplate: { artifactType: 'patch', requiredFiles: [] },
    }))
    this.pendingPayloads.delete(loop.id)
    return contracts
  }
}
