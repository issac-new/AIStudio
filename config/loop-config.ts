// overlay/config/loop-config.ts
import type { LoopHook, HookHandler } from '../custom/server/loop/engine/hooks'

/**
 * Loop Engineering configuration.
 *
 * State adapter selection is now AUTO-DETECTING (see store-factory.ts).
 * The system probes environment capabilities in this order:
 *   1. LOOP_STATE_ADAPTER env var (explicit override for testing/debugging)
 *   2. PostgreSQL available (DATABASE_URL / PGURL / LOOP_PG_URL) -> SaaSStore
 *   3. Matrix credentials available -> MatrixStore
 *   4. Fallback -> LocalStore (always works, zero-dependency)
 *
 * No manual configuration needed — the system adapts to its environment.
 *
 * The fields below are kept as a reference snapshot of what the factory probes;
 * they are NOT used by the composition root (the factory reads env vars directly
 * so it can surface a human-readable `detectedFrom` reason). Tests and tooling
 * may import this object to inspect the resolved environment configuration.
 */
export const loopConfig = {
  // Explicit override: set to 'local' | 'matrix' | 'saas' to force a specific adapter.
  // Leave unset ('') for auto-detection.
  stateAdapterOverride: process.env.LOOP_STATE_ADAPTER || '',

  // SaaS connection (auto-detected from DATABASE_URL / PGURL / LOOP_PG_URL)
  saas: {
    tenantId: process.env.LOOP_SAAS_TENANT_ID || process.env.TENANT_ID || 'default',
  },

  // Matrix connection (auto-detected from LOOP_MATRIX_* env vars)
  matrix: {
    homeserverUrl: process.env.LOOP_MATRIX_HOMESERVER || process.env.MATRIX_HOMESERVER || '',
    accessToken: process.env.LOOP_MATRIX_TOKEN || process.env.MATRIX_ACCESS_TOKEN || '',
    userId: process.env.LOOP_MATRIX_USER || process.env.MATRIX_USER_ID || '',
    roomId: process.env.LOOP_MATRIX_ROOM_ID || process.env.MATRIX_ROOM_ID || '',
  },

  github: {
    repo: process.env.LOOP_GITHUB_REPO || '',
    token: process.env.LOOP_GITHUB_TOKEN || '',
  },
}

export const defaultHooks: Array<{ hook: LoopHook; handler: HookHandler }> = []
