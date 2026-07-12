// overlay/custom/server/loop/store/store-factory.ts
import type { LoopStateStore } from './state-store'
import { LocalStore } from './local-store'

export type StoreAdapterType = 'local' | 'matrix' | 'saas'

export interface StoreFactoryResult {
  store: LoopStateStore
  adapterType: StoreAdapterType
  detectedFrom: string  // human-readable explanation of why this adapter was chosen
}

/**
 * Detect which store adapter to use based on environment capabilities.
 *
 * Detection order (first match wins):
 * 1. Explicit override via LOOP_STATE_ADAPTER env var (for testing/debugging)
 * 2. SaaS: PostgreSQL connection string available (DATABASE_URL or PGURL or LOOP_PG_URL)
 * 3. Matrix: Matrix homeserver credentials available (LOOP_MATRIX_HOMESERVER + LOOP_MATRIX_TOKEN + LOOP_MATRIX_USER + LOOP_MATRIX_ROOM)
 * 4. Local: always available, zero-dependency fallback
 *
 * The factory is async because SaaSStore.init() needs to run (creates schema + RLS).
 * For MatrixStore, the client starts syncing but we don't block on initial sync.
 */
export async function createStateStore(): Promise<StoreFactoryResult> {
  // 1. Explicit override
  const override = process.env.LOOP_STATE_ADAPTER
  if (override === 'local' || override === 'matrix' || override === 'saas') {
    return createByType(override, 'LOOP_STATE_ADAPTER env var override')
  }

  // 2. SaaS: PostgreSQL available?
  const pgUrl = process.env.DATABASE_URL || process.env.PGURL || process.env.LOOP_PG_URL
  if (pgUrl) {
    const tenantId = process.env.LOOP_SAAS_TENANT_ID || process.env.TENANT_ID || 'default'
    try {
      const { SaaSStore } = await import('./saas-store')
      const store = new SaaSStore({ connectionString: pgUrl, tenantId })
      await store.init()
      return { store, adapterType: 'saas', detectedFrom: `PostgreSQL connection string (${maskUrl(pgUrl)})` }
    } catch (err) {
      // PG URL present but connection failed — fall through to next detector
      console.warn(`[loop] SaaSStore init failed (${(err as Error).message}), falling back`)
    }
  }

  // 3. Matrix: credentials available?
  const mxHomeserver = process.env.LOOP_MATRIX_HOMESERVER || process.env.MATRIX_HOMESERVER
  const mxToken = process.env.LOOP_MATRIX_TOKEN || process.env.MATRIX_ACCESS_TOKEN
  const mxUser = process.env.LOOP_MATRIX_USER || process.env.MATRIX_USER_ID
  const mxRoom = process.env.LOOP_MATRIX_ROOM_ID || process.env.MATRIX_ROOM_ID
  if (mxHomeserver && mxToken && mxUser && mxRoom) {
    try {
      const { MatrixStore } = await import('./matrix-store')
      const store = new MatrixStore({
        homeserverUrl: mxHomeserver,
        accessToken: mxToken,
        userId: mxUser,
        roomId: mxRoom,
      })
      return { store, adapterType: 'matrix', detectedFrom: `Matrix homeserver ${mxHomeserver} (room ${mxRoom})` }
    } catch (err) {
      console.warn(`[loop] MatrixStore init failed (${(err as Error).message}), falling back`)
    }
  }

  // 4. Local: always available
  return {
    store: new LocalStore(),
    adapterType: 'local',
    detectedFrom: 'No SaaS or Matrix credentials detected — using local filesystem',
  }
}

/**
 * Create a store by explicit type. Used by the override path and by tests.
 */
export async function createByType(type: StoreAdapterType, reason: string): Promise<StoreFactoryResult> {
  switch (type) {
    case 'local':
      return { store: new LocalStore(), adapterType: 'local', detectedFrom: reason }
    case 'matrix': {
      const homeserver = process.env.LOOP_MATRIX_HOMESERVER || ''
      const token = process.env.LOOP_MATRIX_TOKEN || ''
      const user = process.env.LOOP_MATRIX_USER || ''
      const room = process.env.LOOP_MATRIX_ROOM_ID || ''
      if (!homeserver || !token || !user || !room) {
        throw new Error('LOOP_STATE_ADAPTER=matrix but Matrix credentials missing (need LOOP_MATRIX_HOMESERVER, LOOP_MATRIX_TOKEN, LOOP_MATRIX_USER, LOOP_MATRIX_ROOM_ID)')
      }
      const { MatrixStore } = await import('./matrix-store')
      const store = new MatrixStore({ homeserverUrl: homeserver, accessToken: token, userId: user, roomId: room })
      return { store, adapterType: 'matrix', detectedFrom: reason }
    }
    case 'saas': {
      const pgUrl = process.env.DATABASE_URL || process.env.PGURL || process.env.LOOP_PG_URL || ''
      if (!pgUrl) {
        throw new Error('LOOP_STATE_ADAPTER=saas but no PostgreSQL connection string found (set DATABASE_URL, PGURL, or LOOP_PG_URL)')
      }
      const tenantId = process.env.LOOP_SAAS_TENANT_ID || process.env.TENANT_ID || 'default'
      const { SaaSStore } = await import('./saas-store')
      const store = new SaaSStore({ connectionString: pgUrl, tenantId })
      await store.init()
      return { store, adapterType: 'saas', detectedFrom: reason }
    }
  }
}

function maskUrl(url: string): string {
  // Mask password in connection string for logging
  return url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@')
}
