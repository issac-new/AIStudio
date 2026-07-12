// overlay/custom/server/loop/engine/centralized-scheduler.ts
import cronParser from 'cron-parser'
import type { LoopStateStore } from '../store/state-store'
import type { LoopEngine } from './loop-engine'
import type { LoopInstance } from '../../../client/loop/types'

export class CentralizedScheduler {
  private timer: NodeJS.Timeout | null = null
  private ticking: Set<string> = new Set()

  constructor(
    private store: LoopStateStore,
    private engine: LoopEngine,
    private pollIntervalMs: number = 30_000,
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.poll().catch(() => {}), this.pollIntervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async poll(): Promise<void> {
    // Find all loops with next_tick_at <= now
    const loops = await this.store.listLoops()
    const now = Date.now()
    for (const loop of loops) {
      if (loop.status !== 'idle') continue
      if (!loop.nextTickAt) continue
      if (new Date(loop.nextTickAt).getTime() > now) continue
      if (this.ticking.has(loop.id)) continue

      this.ticking.add(loop.id)
      this.engine.tick(loop.id)
        .catch(() => {})
        .finally(() => {
          this.ticking.delete(loop.id)
        })
    }
  }

  async manualTick(loopId: string): Promise<void> {
    if (this.ticking.has(loopId)) return
    this.ticking.add(loopId)
    try {
      await this.engine.tick(loopId)
    } finally {
      this.ticking.delete(loopId)
    }
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
