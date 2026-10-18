// @vitest-environment jsdom
// 文件下载鉴权守门（2026-10-18 回归）：SecNoQueryToken 后 query token 不再被
// 接受，下载按钮实测 401。fetch 路径须剥离 URL token 并改用 Authorization。
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/client', () => ({
  ensureDesktopAuthReady: vi.fn(async () => {}),
  getApiKey: () => 'tok-123',
  getBaseUrlValue: () => '',
  getActiveProfileName: () => null,
}))

const { downloadFile, fetchFileText } = await import('@/api/studio/download')

describe('downloadFile / fetchFileText 鉴权', () => {
  const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x']), text: async () => 'body' }))
  beforeEach(() => {
    fetchMock.mockClear()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    URL.createObjectURL = vi.fn(() => 'blob:test')
    URL.revokeObjectURL = vi.fn()
  })

  it('downloadFile：URL 不带 token，Authorization 走 header', async () => {
    await downloadFile('README.md', 'README.md', null)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).not.toContain('token=')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123')
  })

  it('fetchFileText：同样走 header 鉴权', async () => {
    await fetchFileText('README.md', 'README.md', null)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).not.toContain('token=')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123')
  })

  it('workspaceRoot 模式：root 参数随 URL 传递（缺 root 会 404）', async () => {
    await downloadFile('README.md', 'README.md', null, '/Users/me/ws')
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain(`root=${encodeURIComponent('/Users/me/ws')}`)
    expect(url).not.toContain('token=')
  })
})
