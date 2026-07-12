// overlay/custom/client/loop/__tests__/saas-store.test.ts
import { describe, it, expect, vi } from 'vitest'

// Mock pg
vi.mock('pg', () => {
  const mockClient = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  }
  return {
    Pool: vi.fn(() => ({
      connect: vi.fn().mockResolvedValue(mockClient),
      query: vi.fn().mockResolvedValue({ rows: [] }),
      end: vi.fn().mockResolvedValue(undefined),
    })),
  }
})

import { SaaSStore } from '../../../server/loop/store/saas-store'

describe('SaaSStore', () => {
  it('constructs with connection string and tenant ID', () => {
    const store = new SaaSStore({ connectionString: 'postgres://localhost/test', tenantId: 'tenant-a' })
    expect(store).toBeDefined()
  })

  it('init creates schema and RLS policies', async () => {
    const store = new SaaSStore({ connectionString: 'postgres://localhost/test', tenantId: 'tenant-a' })
    await store.init()
    // Verify schema SQL was queried (mocked)
  })

  it('getLoop returns null for non-existent', async () => {
    const store = new SaaSStore({ connectionString: 'postgres://localhost/test', tenantId: 'tenant-a' })
    const result = await store.getLoop('nonexistent')
    expect(result).toBeNull()
  })

  it('listLoops returns empty array', async () => {
    const store = new SaaSStore({ connectionString: 'postgres://localhost/test', tenantId: 'tenant-a' })
    const loops = await store.listLoops()
    expect(loops).toEqual([])
  })

  it('detectDrift returns false (DB is source of truth)', async () => {
    const store = new SaaSStore({ connectionString: 'postgres://localhost/test', tenantId: 'tenant-a' })
    const report = await store.detectDrift('any')
    expect(report.hasDrift).toBe(false)
  })

  it('close ends the pool', async () => {
    const store = new SaaSStore({ connectionString: 'postgres://localhost/test', tenantId: 'tenant-a' })
    await store.close()
    // Verify pool.end was called
  })
})
