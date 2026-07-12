// overlay/custom/server/loop/engine/scheduler.ts
import cronParser from 'cron-parser'
import type { LoopInstance, LoopEvent } from '../types'
import type { LoopStateStore } from '../store/state-store'
import type { LoopEngine } from './loop-engine'
import type { WebhookConnector } from '../connectors/webhook-connector'

export class Scheduler {
  private timers: Map<string, NodeJS.Timeout> = new Map()

  constructor(
    private store: LoopStateStore,
    private engine: LoopEngine,
    private webhookConnector: WebhookConnector,
  ) {}

  start(): void {
    this.scheduleAll()
  }

  stop(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }

  async scheduleAll(): Promise<void> {
    const loops = await this.store.listLoops({ status: ['idle'] })
    for (const loop of loops) {
      this.scheduleLoop(loop)
    }
  }

  scheduleLoop(loop: LoopInstance): void {
    // Clear existing timer
    const existing = this.timers.get(loop.id)
    if (existing) clearTimeout(existing)

    if (loop.schedule.mode === 'manual') return
    if (loop.schedule.mode === 'cron' && loop.schedule.cron) {
      const nextTick = this.computeNextTick(loop)
      const delay = Math.max(0, new Date(nextTick).getTime() - Date.now())
      const timer = setTimeout(() => {
        this.engine.tick(loop.id).catch(() => {}).finally(() => {
          this.rescheduleLoop(loop.id)
        })
      }, delay)
      this.timers.set(loop.id, timer)
    }
    // webhook mode: handled by webhook endpoint, no timer needed
  }

  private async rescheduleLoop(loopId: string): Promise<void> {
    const loop = await this.store.getLoop(loopId)
    if (loop && loop.status === 'idle') {
      this.scheduleLoop(loop)
    }
  }

  async handleWebhook(loopId: string, source: string, eventType: string, payload: unknown): Promise<void> {
    // Debounce: 5s window
    const key = `${loopId}:${source}:${eventType}`
    const existing = this.timers.get(key)
    if (existing) clearTimeout(existing)
    this.webhookConnector.enqueue(loopId, { source, eventType, payload })
    const timer = setTimeout(() => {
      this.engine.tick(loopId).catch(() => {}).finally(() => {
        this.timers.delete(key)
      })
    }, 5000)
    this.timers.set(key, timer)
  }

  async manualTick(loopId: string): Promise<void> {
    await this.engine.tick(loopId)
    const loop = await this.store.getLoop(loopId)
    if (loop) this.scheduleLoop(loop)
  }

  computeNextTick(loop: LoopInstance): string {
    if (loop.schedule.mode === 'cron' && loop.schedule.cron) {
      try {
        const interval = cronParser.CronExpressionParser.parse(loop.schedule.cron, { tz: loop.schedule.timezone })
        return interval.next().toISOString()
      } catch {
        return new Date(Date.now() + 3600_000).toISOString()
      }
    }
    return new Date(Date.now() + 3600_000).toISOString()
  }
}
