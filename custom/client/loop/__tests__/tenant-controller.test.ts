// overlay/custom/client/loop/__tests__/tenant-controller.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('pg', () => ({
  Pool: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
  })),
}))

describe('Tenant Controller', () => {
  it('createTenantRouter returns a Router', async () => {
    const { createTenantRouter } = await import('../../../server/loop/controllers/tenant')
    const { Pool } = await import('pg')
    const router = createTenantRouter(new Pool())
    expect(router).toBeDefined()
    expect(router.routes).toBeDefined()
  })
})
