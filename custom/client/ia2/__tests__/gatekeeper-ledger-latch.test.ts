// overlay/custom/client/ia2/__tests__/gatekeeper-ledger-latch.test.ts
// W4 台账 503 降噪守门（2026-10-20 验收挂账清零轮）：台账端点未配置（503/「未配置」）时
// fetchClearanceLedger 记一次失败并停轮询——同会话后续调用复用该失败、authFetch 只发一次。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const authFetchMock = vi.fn()
vi.mock('../../ide/utils/auth-fetch', () => ({ authFetch: (...args: unknown[]) => authFetchMock(...args) }))

const { fetchClearanceLedger, __resetClearanceUnavailableForTest } = await import('../api/gatekeeper')

describe('fetchClearanceLedger 未配置闩', () => {
  beforeEach(() => {
    authFetchMock.mockReset()
    __resetClearanceUnavailableForTest()
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('503 未配置：首次请求后闩住，后续调用不再发请求且抛同一错误', async () => {
    authFetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: '清偿台账未配置（ORGLOOP_LEDGER_TSV 缺席=fail-closed）' }),
    })
    await expect(fetchClearanceLedger()).rejects.toThrow('未配置')
    await expect(fetchClearanceLedger()).rejects.toThrow('未配置')
    expect(authFetchMock).toHaveBeenCalledTimes(1)
  })

  it('非 503 类失败不闩：每次调用都真发请求', async () => {
    authFetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'db locked' }) })
    await expect(fetchClearanceLedger()).rejects.toThrow('db locked')
    await expect(fetchClearanceLedger()).rejects.toThrow('db locked')
    expect(authFetchMock.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
