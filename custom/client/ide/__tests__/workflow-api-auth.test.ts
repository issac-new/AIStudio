// @vitest-environment jsdom
// 工作流查询面鉴权守门（2026-10-18 回归）：裸 fetch 缺 Authorization 时
// /api/zcode-engine/workflow/* 返回 401，页签直接显示 http_401:。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchSavedWorkflows, fetchWorkflowRuns } from '../api/workflows'

describe('IDE workflow API 鉴权', () => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ workflows: [], runs: [] }) }))
  beforeEach(() => {
    fetchMock.mockClear()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    localStorage.setItem('hermes_api_key', 'tok-workflow')
  })

  it('fetchSavedWorkflows 携带 Bearer token', async () => {
    await fetchSavedWorkflows('/ws', 'project')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/api/zcode-engine/workflow/saved')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok-workflow')
  })

  it('fetchWorkflowRuns 携带 Bearer token', async () => {
    await fetchWorkflowRuns('/ws', 's1')
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok-workflow')
  })
})
