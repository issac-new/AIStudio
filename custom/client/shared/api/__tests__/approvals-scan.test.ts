// overlay/custom/client/shared/api/__tests__/approvals-scan.test.ts
// P0 Task 4（2026-11-05）客户端契约守门：自动审批从 GET 读请求迁入显式写命令——
// fetchPendingApprovals / fetchPendingSummary 必须先 POST /api/approvals/autopass/scan
// 再 GET；POST 失败显式向调用方抛错（不吞错、不伪装成功、不再发 GET）。
// mock @/api/client 的 request：真实 client 会连锁拉入上游 router（见 approval-panel.test 同款理由）。
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/client', () => ({ request: vi.fn() }))

const { request } = await import('@/api/client')
const { fetchPendingApprovals, fetchPendingSummary } = await import('@/custom/shared/api/approvals')

interface Call { method?: string; path: string }
const calls: Call[] = []

beforeEach(() => {
  calls.length = 0
  vi.mocked(request).mockReset()
  vi.mocked(request).mockImplementation(async (path: string, options?: RequestInit) => {
    calls.push({ method: options?.method, path })
    if (path === '/api/approvals/autopass/scan') return { ok: true, acted: 0 }
    if (path === '/api/approvals/pending') return { items: [] }
    if (path === '/api/approvals/pending-summary') {
      return { total: 0, command: 0, review: 0, enforce: 0, byRisk: { high: 0, medium: 0, low: 0 }, ts: 0 }
    }
    throw new Error(`unexpected request path: ${path}`)
  })
})

describe('审批读面前置显式扫描（P0 Task 4）', () => {
  it('fetchPendingApprovals 先 POST /autopass/scan 再 GET /pending', async () => {
    await fetchPendingApprovals()
    expect(calls).toEqual([
      { method: 'POST', path: '/api/approvals/autopass/scan' },
      { method: undefined, path: '/api/approvals/pending' },
    ])
  })

  it('fetchPendingSummary 先 POST /autopass/scan 再 GET /pending-summary', async () => {
    await fetchPendingSummary()
    expect(calls).toEqual([
      { method: 'POST', path: '/api/approvals/autopass/scan' },
      { method: undefined, path: '/api/approvals/pending-summary' },
    ])
  })

  it('POST 扫描失败显式抛错：不吞错、不伪装成功、不再发 GET', async () => {
    vi.mocked(request).mockImplementation(async (path: string, options?: RequestInit) => {
      calls.push({ method: options?.method, path })
      if (path === '/api/approvals/autopass/scan') {
        throw Object.assign(new Error('API Error 403: 需要平台超级管理员权限'), { status: 403 })
      }
      return { items: [] }
    })
    await expect(fetchPendingApprovals()).rejects.toThrow('API Error 403')
    await expect(fetchPendingSummary()).rejects.toThrow('API Error 403')
    // 两次调用都停在扫描 POST，GET 未发出（失败不得静默降级成"扫描成功"的读面）
    expect(calls).toEqual([
      { method: 'POST', path: '/api/approvals/autopass/scan' },
      { method: 'POST', path: '/api/approvals/autopass/scan' },
    ])
  })
})
