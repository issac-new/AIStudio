// overlay/custom/server/loop/engine/stuck-detector.ts
import type { LoopInstance } from '../../../client/loop/types'
import type { LoopStateStore } from '../store/state-store'

export type StuckReason = 'max-attempts' | 'no-output' | 'validation-loop' | 'agent-silent'

export class StuckDetector {
  constructor(private store: LoopStateStore) {}

  async check(loop: LoopInstance): Promise<StuckReason | null> {
    const contracts = await this.store.queryContracts(loop.id)
    // max-attempts: any contract at maxAttempts
    for (const c of contracts) {
      if (c.attempts >= c.maxAttempts && c.status !== 'escalated') {
        return 'max-attempts'
      }
    }
    // no-output: running for > 15min with no recent events
    if (loop.status === 'running' && loop.lastTickAt) {
      const elapsed = Date.now() - new Date(loop.lastTickAt).getTime()
      if (elapsed > 15 * 60 * 1000) {
        const events = await this.store.queryEvents(loop.id, undefined, 1)
        if (events.length === 0 || this.isStaleEvent(events[0])) {
          return 'no-output'
        }
      }
    }
    // validation-loop: check for repeated fail pattern in events
    const recentEvents = await this.store.queryEvents(loop.id, undefined, 20)
    const failCount = recentEvents.filter(e =>
      e.type === 'loop.verification-complete' && !(e as any).passed
    ).length
    if (failCount >= 3) return 'validation-loop'

    return null
  }

  private isStaleEvent(event: any): boolean {
    if (!event.ts) return true
    return Date.now() - new Date(event.ts).getTime() > 10 * 60 * 1000
  }

  async handleStuck(loop: LoopInstance, reason: StuckReason): Promise<void> {
    switch (reason) {
      case 'max-attempts':
        await this.store.updateLoop(loop.id, { status: 'paused' })
        break
      case 'no-output':
        await this.store.updateLoop(loop.id, { status: 'paused' })
        break
      case 'validation-loop':
        // Try switching maker model — just flag for now
        await this.store.updateLoop(loop.id, { status: 'blocked' })
        break
      case 'agent-silent':
        await this.store.updateLoop(loop.id, { status: 'blocked' })
        break
    }
  }
}
