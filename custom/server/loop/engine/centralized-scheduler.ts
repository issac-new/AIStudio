// overlay/custom/server/loop/engine/centralized-scheduler.ts
//
// 【退役候选】生产零接线（bootstrap 只装配 RunSpawner，见 graph-assembly.ts 四件套），
// 现仅测试消费（client/loop/__tests__）。调度负载唯一登记见
// docs/superpowers/specs/2026-09-25-scheduled-loads-registry.md；新增生产代码禁止
// 引用本类，新调度负载先登记台账再实现。
import { computeNextTick } from '../graph/next-tick'
import type { LoopStateStore } from '../store/state-store'
import type { LoopEngine } from './loop-engine'
import type { LoopInstance } from '../types'

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
    return computeNextTick(loop)
  }
}
