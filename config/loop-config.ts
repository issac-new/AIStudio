// overlay/config/loop-config.ts
import type { LoopHook, HookHandler } from '../custom/server/loop/engine/hooks'

export const loopConfig = {
  stateAdapter: process.env.LOOP_STATE_ADAPTER || 'local',
  matrix: {
    roomId: process.env.LOOP_MATRIX_ROOM_ID || '',
  },
  saas: {
    apiUrl: process.env.LOOP_SAAS_API_URL || '',
    tenantId: process.env.LOOP_SAAS_TENANT_ID || '',
  },
  github: {
    repo: process.env.LOOP_GITHUB_REPO || '',
    token: process.env.LOOP_GITHUB_TOKEN || '',
  },
}

export const defaultHooks: Array<{ hook: LoopHook; handler: HookHandler }> = [
  // BudgetGuard and StuckDetector are called directly in loop-engine, not as hooks
  // These are for user-extensible hooks
]
