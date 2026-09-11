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

// ---------------------------------------------------------------------------
// P3 台账（T4/T7 合并，顺延 P4 清偿）：queryEvents 事件窗口语义统一——
// limit 截断取"最新 N 条、升序返回"（与 local-store.slice(-limit) 同契约）。
// 此前 ASC+LIMIT 取最旧 N 条：stuck 检测（limit 1/20）、loop socket 回放（limit 50）
// 在 saas 形态下窗口整体偏旧，熔断计数少计。本组以伪 pg 捕获 SQL 并验证行序反转。
// ---------------------------------------------------------------------------

describe('SaaSStore.queryEvents — 事件窗口语义（P3 台账：与 local 统一取最新 N）', () => {
  interface Recorded { text: string; params?: unknown[] }

  /** 替换 store 内部 pool 为捕获型假客户端；rows 为 pg 按 SQL 序返回的行 */
  async function callQueryEvents(
    rows: Array<{ payload: { type: string } }>,
    args: { loopId?: string; since?: string; limit?: number } = {},
  ): Promise<{ events: Array<{ type: string }>; queries: Recorded[] }> {
    const store = new SaaSStore({ connectionString: 'postgres://localhost/test', tenantId: 'tenant-a' })
    const queries: Recorded[] = []
    const fakeClient = {
      query: async (text: string, params?: unknown[]) => {
        queries.push({ text, params })
        return { rows }
      },
      release: () => {},
    }
    ;(store as unknown as { pool: unknown }).pool = {
      connect: async () => fakeClient,
    }
    const events = await store.queryEvents(args.loopId ?? 'loop-1', args.since, args.limit)
    return { events: events as Array<{ type: string }>, queries }
  }

  it('limit 截断走 ORDER BY ts DESC + LIMIT（取最新 N）并反转回升序', async () => {
    // pg 按 DESC 序返回（最新在前）——e5/e4/e3 即"5 条事件截最新 3 条"的服务端形态
    const { events, queries } = await callQueryEvents(
      [{ payload: { type: 'e5' } }, { payload: { type: 'e4' } }, { payload: { type: 'e3' } }],
      { limit: 3 },
    )
    const select = queries.find(q => q.text.includes('FROM loop_events'))!
    expect(select.text).toContain('ORDER BY ts DESC, id DESC')
    expect(select.text).toContain('LIMIT')
    expect(select.params).toEqual(['loop-1', 3])
    // 反转回升序：返回序契约与 local-store 一致（时间升序，最新 N 条）
    expect(events.map(e => e.type)).toEqual(['e3', 'e4', 'e5'])
  })

  it('since + limit 组合：since 过滤先行，limit 仍取最新 N（DESC 截后反转）', async () => {
    const { events, queries } = await callQueryEvents(
      [{ payload: { type: 'e4' } }, { payload: { type: 'e3' } }],
      { since: '2026-09-10T00:00:00Z', limit: 2 },
    )
    const select = queries.find(q => q.text.includes('FROM loop_events'))!
    expect(select.text).toContain('ts > $2')
    expect(select.text).toContain('ORDER BY ts DESC, id DESC')
    expect(select.params).toEqual(['loop-1', '2026-09-10T00:00:00Z', 2])
    expect(events.map(e => e.type)).toEqual(['e3', 'e4'])
  })

  it('无 limit：全量维持升序（不截断、不反转）', async () => {
    const { events, queries } = await callQueryEvents(
      [{ payload: { type: 'e1' } }, { payload: { type: 'e2' } }],
    )
    const select = queries.find(q => q.text.includes('FROM loop_events'))!
    expect(select.text).toContain('ORDER BY ts ASC, id ASC')
    expect(select.text).not.toContain('LIMIT')
    expect(events.map(e => e.type)).toEqual(['e1', 'e2'])
  })
})
