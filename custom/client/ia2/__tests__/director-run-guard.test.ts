// overlay/custom/client/ia2/__tests__/director-run-guard.test.ts
// W3 两体系贯通守门（2026-10-20 挂账清零批 B）：导演 run（run-sim-director-*）在旧体系
// API 层即时拒答（改道提示+零网络探测），普通 run 正常发请求。
import { describe, it, expect, vi, beforeEach } from 'vitest'

const authFetchMock = vi.fn()
vi.mock('../../ide/utils/auth-fetch', () => ({ authFetch: (...args: unknown[]) => authFetchMock(...args) }))

const { isDirectorRun, DIRECTOR_RUN_PREFIX } = await import('../utils/director-run')
const { fetchRunState, fetchDeliverables, fetchIssues, fetchBranches } = await import('../api/overview')
const { fetchJournal } = await import('../api/supervision')

describe('isDirectorRun 谓词', () => {
  it('前缀识别', () => {
    expect(isDirectorRun('run-sim-director-mvgar1sm-f7fv-1')).toBe(true)
    expect(isDirectorRun(DIRECTOR_RUN_PREFIX)).toBe(true)
    expect(isDirectorRun('20261015-v8-run20')).toBe(false)
    expect(isDirectorRun('')).toBe(false)
  })
})

describe('旧体系 API 导演 run 守卫', () => {
  beforeEach(() => { authFetchMock.mockReset() })

  it('run-state/deliverables/issues/branches/journal 即时拒答且零网络', async () => {
    const run = 'run-sim-director-abc-1'
    for (const call of [fetchRunState, fetchDeliverables, fetchIssues, fetchBranches]) {
      await expect(call(run)).rejects.toThrow('导演台')
    }
    await expect(fetchJournal(run, 50)).rejects.toThrow('导演台')
    expect(authFetchMock).not.toHaveBeenCalled()
  })

  it('普通 run 不受影响（正常发请求）', async () => {
    authFetchMock.mockResolvedValue({ ok: true, json: async () => ({ steps: {}, gates: {} }) })
    await fetchRunState('20261015-v8-run20')
    expect(authFetchMock).toHaveBeenCalledTimes(1)
    expect(String(authFetchMock.mock.calls[0][0])).toContain('/api/hermes/sim/run-state')
  })
})
