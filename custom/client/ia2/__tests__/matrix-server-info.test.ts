// overlay/custom/client/ia2/__tests__/matrix-server-info.test.ts
// 客户端 server-info helper 守门：端点口径合并、模块级缓存、失败兜底。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchMatrixServerInfo, __resetMatrixServerInfoCache, MATRIX_SERVER_INFO_FALLBACK } from '../matrix-server-info'

const fetchMock = vi.fn()
beforeEach(() => {
  __resetMatrixServerInfoCache()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('fetchMatrixServerInfo', () => {
  it('命中端点：合并服务端值（缺键落兜底）', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ homeserverUrl: 'http://10.0.0.8:8008', serverName: 'corp.internal' }) })
    const info = await fetchMatrixServerInfo()
    expect(fetchMock).toHaveBeenCalledWith('/api/matrix/server-info')
    expect(info.homeserverUrl).toBe('http://10.0.0.8:8008')
    expect(info.serverName).toBe('corp.internal')
    expect(info.elementWebUrl).toBe('/element-web/')
  })

  it('模块级缓存：第二次调用不再发请求', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    await fetchMatrixServerInfo()
    await fetchMatrixServerInfo()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('端点非 200 → 全兜底', async () => {
    fetchMock.mockResolvedValue({ ok: false })
    const info = await fetchMatrixServerInfo()
    expect(info).toEqual(MATRIX_SERVER_INFO_FALLBACK)
  })

  it('网络异常 → 全兜底不抛出', async () => {
    fetchMock.mockRejectedValue(new Error('down'))
    const info = await fetchMatrixServerInfo()
    expect(info).toEqual(MATRIX_SERVER_INFO_FALLBACK)
  })
})
