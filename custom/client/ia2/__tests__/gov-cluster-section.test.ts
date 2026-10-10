// overlay/custom/client/ia2/__tests__/gov-cluster-section.test.ts
// 守门：GovClusterSection 调 @/api/client 的 request(path, options) 参数序。
// 回归锚：曾错传 request('POST', path) → fetch 拿到 "http://127.0.0.1:8802POST"
// 抛 Failed to parse URL（2026-10-10 用户指认「立即巡检/刷新」双炸）。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import GovClusterSection from '../views/gov/GovClusterSection.vue'

const api = vi.hoisted(() => ({ request: vi.fn(async () => ({})) }))
vi.mock('@/api/client', () => api)

beforeEach(() => {
  api.request.mockReset()
  api.request.mockResolvedValue({ anomalies: [], snapshot: null, inspector: {} })
})

describe('GovClusterSection（集群健康）request 参数序守门', () => {
  it('挂载即拉快照：首参是路径，不是 HTTP 方法', async () => {
    mount(GovClusterSection)
    await flushPromises()
    expect(api.request).toHaveBeenCalledWith('/api/hermes/cluster-inspector/snapshot')
  })

  it('立即巡检：路径在前，POST 落在 options.method', async () => {
    const w = mount(GovClusterSection)
    await flushPromises()
    api.request.mockClear()
    await w.findAll('button')[0].trigger('click')
    await flushPromises()
    expect(api.request).toHaveBeenCalledWith('/api/hermes/cluster-inspector/run', { method: 'POST' })
  })

  it('刷新按钮：同以路径为首参，且成功响应不落错误条', async () => {
    const w = mount(GovClusterSection)
    await flushPromises()
    api.request.mockClear()
    await w.findAll('button')[1].trigger('click')
    await flushPromises()
    expect(api.request).toHaveBeenCalledWith('/api/hermes/cluster-inspector/snapshot')
    expect(w.find('.err').exists()).toBe(false)
  })
})
