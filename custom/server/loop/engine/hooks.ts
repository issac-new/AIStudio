// overlay/custom/server/loop/engine/hooks.ts
import type { LoopInstance } from '../types'

export type LoopHook =
  | 'pre-discovery' | 'post-discovery'
  | 'pre-handoff' | 'post-handoff'
  | 'pre-validation' | 'post-validation'
  | 'pre-persistence' | 'post-persistence'
  | 'pre-tick' | 'post-tick'
  | 'on-stuck' | 'on-budget-exceed'

export interface HookHandler {
  type: 'command' | 'http' | 'mcp_tool' | 'prompt' | 'agent'
  matcher?: string
  config: unknown
}

export interface HookResult {
  decision: 'allow' | 'deny' | 'ask'
  updatedInput?: unknown
  additionalContext?: string
}

type HandlerFn = (loop: LoopInstance) => Promise<HookResult>

export class HookManager {
  private handlers: Map<LoopHook, HandlerFn[]> = new Map()

  register(hook: LoopHook, fn: HandlerFn): void {
    const existing = this.handlers.get(hook) ?? []
    existing.push(fn)
    this.handlers.set(hook, existing)
  }

  async run(hook: LoopHook, loop: LoopInstance): Promise<HookResult> {
    const fns = this.handlers.get(hook) ?? []
    let result: HookResult = { decision: 'allow' }
    for (const fn of fns) {
      const r = await fn(loop)
      if (r.decision === 'deny') return r
      if (r.decision === 'ask') result = r
      if (r.additionalContext) {
        result.additionalContext = (result.additionalContext ?? '') + r.additionalContext
      }
    }
    return result
  }
}
