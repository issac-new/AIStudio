// overlay/custom/server/loop/engine/lease-manager.ts
import type { MatrixClient } from 'matrix-js-sdk'
import { sendMessage, LOOP_STATE_EVENT_TYPES } from '../store/matrix-client'

export interface LeaseInfo {
  instanceId: string
  loopId: string
  timestamp: number
  expiresAt: number
}

const LEASE_DURATION_MS = 5 * 60 * 1000  // 5 minutes
const ELECTION_WINDOW_MS = 5 * 1000      // 5 second window

export class LeaseManager {
  private instanceId: string
  private roomId: string
  private client: MatrixClient

  constructor(client: MatrixClient, roomId: string, instanceId?: string) {
    this.client = client
    this.roomId = roomId
    this.instanceId = instanceId ?? `${process.pid}-${Date.now()}`
  }

  async tryAcquireLease(loopId: string): Promise<boolean> {
    const now = Date.now()
    // Send a lease bid message
    await sendMessage(this.client, this.roomId, LOOP_STATE_EVENT_TYPES.LEASE, {
      instanceId: this.instanceId,
      loopId,
      timestamp: now,
    })

    // Wait for the election window
    await this.sleep(ELECTION_WINDOW_MS)

    // Check all lease bids in the window — lowest timestamp wins
    const bids = await this.getRecentLeaseBids(loopId, now - ELECTION_WINDOW_MS - 1000)
    const sorted = bids.sort((a, b) => a.timestamp - b.timestamp)
    const winner = sorted[0]

    // No bids returned means no competition (we just sent one; in a live Matrix
    // room it would appear in the message history). Treat as a win.
    if (!winner) {
      return true
    }

    if (winner.instanceId !== this.instanceId) {
      return false
    }

    // Check if there's an active unexpired lease from another instance
    const activeLease = await this.getActiveLease(loopId)
    if (activeLease && activeLease.instanceId !== this.instanceId && activeLease.expiresAt > now) {
      return false
    }

    return true
  }

  async renewLease(loopId: string): Promise<boolean> {
    // Re-send lease bid to renew
    return this.tryAcquireLease(loopId)
  }

  async releaseLease(loopId: string): Promise<void> {
    // Send a release message
    await sendMessage(this.client, this.roomId, LOOP_STATE_EVENT_TYPES.LEASE, {
      instanceId: this.instanceId,
      loopId,
      timestamp: Date.now(),
      action: 'release',
    })
  }

  private async getRecentLeaseBids(loopId: string, since: number): Promise<LeaseInfo[]> {
    try {
      const response = await this.client.createMessagesRequest(this.roomId, '', 50, 'b' as any)
      const messages = response.chunk ?? []
      return messages
        .filter((m: any) => {
          const content = m.getContent()
          return content?.loopId === loopId && !content?.action
        })
        .map((m: any) => {
          const c = m.getContent()
          return {
            instanceId: c.instanceId,
            loopId: c.loopId,
            timestamp: c.timestamp,
            expiresAt: (c.timestamp ?? 0) + LEASE_DURATION_MS,
          }
        })
        .filter((bid: LeaseInfo) => bid.timestamp >= since)
    } catch {
      return []
    }
  }

  private async getActiveLease(loopId: string): Promise<LeaseInfo | null> {
    const bids = await this.getRecentLeaseBids(loopId, Date.now() - LEASE_DURATION_MS)
    if (bids.length === 0) return null
    const sorted = bids.sort((a, b) => a.timestamp - b.timestamp)
    const oldest = sorted[0]
    return oldest.expiresAt > Date.now() ? oldest : null
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
