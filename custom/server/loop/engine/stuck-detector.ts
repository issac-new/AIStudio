// overlay/custom/server/loop/engine/stuck-detector.ts
import type { LoopInstance } from '../types'
import type { LoopStateStore } from '../store/state-store'

export type StuckReason = 'max-attempts' | 'no-output' | 'validation-loop' | 'agent-silent'

export interface StuckDetectorOpts {
  store: LoopStateStore
  /**
   * 长会话治理 B3（13b5739 教训产品化）：外部进展指纹。注入后 validation-loop
   * 判定加门——指纹较上次检查有变化（外部证据真的动了）则不判 stuck；连续两次
   * 检查指纹不变才允许触发。缺省不注入 = 原语义（纯事件窗计数）。
   */
  progressFingerprint?: (loop: LoopInstance) => Promise<string | null>
}

export class StuckDetector {
  private lastFingerprint = new Map<string, string>()

  /** 兼容两构造形状：裸 store（旧调用方）或 { store, progressFingerprint } */
  constructor(private opts: StuckDetectorOpts | LoopStateStore) {}

  private get store(): LoopStateStore {
    return 'queryContracts' in this.opts ? this.opts : (this.opts as StuckDetectorOpts).store
  }

  private get progressFingerprint(): ((loop: LoopInstance) => Promise<string | null>) | undefined {
    return 'queryContracts' in this.opts ? undefined : this.opts.progressFingerprint
  }

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
    if (failCount >= 3) {
      // B3：外部证据在动（指纹变了）→ 失败在反复但工作在推进，不判 stuck；
      // 指纹不变（连续两次一致）→ 才坐实 validation-loop。指纹 null（无契约面）
      // 回退原语义。
      if (this.progressFingerprint) {
        const fp = await this.progressFingerprint(loop)
        if (fp !== null) {
          const prev = this.lastFingerprint.get(loop.id)
          this.lastFingerprint.set(loop.id, fp)
          if (fp !== prev) return null
        }
      }
      return 'validation-loop'
    }

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
