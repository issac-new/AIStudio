// overlay/custom/client/loop/__tests__/billing.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('pg', () => {
  const row = {
    total_cost: '12.50',
    active_loops: '3',
    total_iterations: '15',
    tasks_completed: '8',
    completed: '2',
    // Fields used by getMonthlyReport (different SQL column aliases)
    cost: '12.50',
    iterations: '15',
    loops_created: '3',
  }
  return {
    Pool: vi.fn(() => ({
      query: vi.fn().mockResolvedValue({ rows: [row] }),
    })),
  }
})

import { BillingService } from '../../../server/loop/engine/billing'

describe('BillingService', () => {
  it('gets tenant billing summary', async () => {
    const { Pool } = await import('pg')
    const billing = new BillingService(new Pool())
    const result = await billing.getTenantBilling('tenant-a')
    expect(result.tenantId).toBe('tenant-a')
    expect(result.totalCost).toBe(12.50)
    expect(result.activeLoopCount).toBe(3)
    expect(result.averageCompletionRate).toBeCloseTo(66.67, 1) // 2/3 * 100
  })

  it('gets monthly report', async () => {
    const { Pool } = await import('pg')
    const billing = new BillingService(new Pool())
    const result = await billing.getMonthlyReport('tenant-a', 2026, 7)
    expect(result.tenantId).toBe('tenant-a')
    expect(result.cost).toBe(12.50)
    expect(result.iterations).toBe(15)
  })
})
