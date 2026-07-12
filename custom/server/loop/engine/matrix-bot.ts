// overlay/custom/server/loop/engine/matrix-bot.ts
import type { MatrixClient } from 'matrix-js-sdk'
import { sendMessage } from '../store/matrix-client'
import type { LoopEvent } from '../../../client/loop/types'

export class MatrixBot {
  constructor(private client: MatrixClient, private roomId: string) {}

  async notify(event: LoopEvent): Promise<void> {
    const message = this.formatEvent(event)
    if (message) {
      await sendMessage(this.client, this.roomId, 'm.loop.notification', {
        body: message,
        msgtype: 'm.text',
      })
    }
  }

  private formatEvent(event: LoopEvent): string | null {
    switch (event.type) {
      case 'loop.created':
        return `🔄 Loop created: ${(event as any).loop.name} (${(event as any).loop.id})`

      case 'loop.stage-transition':
        return `📋 ${event.loopId}: ${(event as any).from} → ${(event as any).to} (${(event as any).reason})`

      case 'loop.task-discovered':
        return `🔍 ${event.loopId}: discovered ${(event as any).contract.source.summary}`

      case 'loop.task-handed-off':
        return `🤝 ${event.loopId}: handed off ${(event as any).contractId} to worktree ${(event as any).worktreeId}`

      case 'loop.verification-complete': {
        const passed = (event as any).passed ? '✅' : '❌'
        return `🔍 ${(event as any).contractId}: verification ${passed}`
      }

      case 'loop.persisted':
        return `💾 ${event.loopId}: persisted ${(event as any).artifact}`

      case 'loop.tick-complete':
        return `✅ ${event.loopId}: tick #${(event as any).iteration} complete`

      case 'loop.budget-warning': {
        const spent = (event as any).spent
        const limit = (event as any).limit
        const pct = ((spent / limit) * 100).toFixed(1)
        return `⚠️ ${event.loopId}: budget ${pct}% ($${spent.toFixed(2)}/$${limit.toFixed(2)})`
      }

      case 'loop.stuck':
        return `🚨 ${event.loopId}: STUCK — ${(event as any).reason}`

      case 'loop.completed':
        return `🎉 ${event.loopId}: COMPLETED!`

      default:
        return null
    }
  }

  async notifyApprovalNeeded(loopId: string, contractId: string, summary: string, approvers: string[]): Promise<void> {
    const mentions = approvers.map(a => a.startsWith('@') ? a : `@${a}`).join(' ')
    await sendMessage(this.client, this.roomId, 'm.loop.notification', {
      body: `⚠️ Approval needed: ${contractId} (${summary}) — Approvers: ${mentions}`,
      msgtype: 'm.text',
    })
  }
}
