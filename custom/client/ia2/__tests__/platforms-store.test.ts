// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/platforms-store.test.ts
// 网关探测投影双态兼容守门（run5 2026-09-30 在线三数恒零根因）：
// 运行态 0.21.5 网关 /agent-health/detailed 回 platforms 键，新版回 loaded_platforms。
// 旧守门只 mock 新键（loaded_platforms），测试全绿而运行态投影恒空——本文件钉住
// 两种 schema 都必须投影出通道行，缺一即红。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlatformsStore } from '../store/platforms'

function mockFetch(payload: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => payload })))
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.restoreAllMocks()
})

describe('usePlatformsStore 投影双态兼容', () => {
  it('0.21.5 schema（platforms 键，无 loaded_platforms）投影出通道行', async () => {
    mockFetch({
      status: 'ok',
      gateway_state: 'running',
      platforms: {
        api_server: { state: 'connected', updated_at: '2026-09-30T10:00:00Z' },
        'chen:matrix': { state: 'connected', updated_at: '2026-09-30T10:00:00Z' },
        'wei:matrix': { state: 'connected', updated_at: '2026-09-30T10:00:00Z' },
      },
    })
    const store = usePlatformsStore()
    await store.fetchGatewayStatus()
    expect(store.gatewayState).toBe('running')
    expect(store.platforms.length).toBe(3)
    expect(store.platforms.filter((p) => p.state === 'connected' && p.profile).length).toBe(2)
  })

  it('新 schema（loaded_platforms 键）行为不变', async () => {
    mockFetch({
      status: 'ok',
      gateway_state: 'running',
      served_profiles: ['chen'],
      loaded_platforms: {
        api_server: { state: 'connected', updated_at: '' },
        'chen:matrix': { state: 'connected', updated_at: '' },
        'wei:matrix': { state: 'connected', updated_at: '' },
      },
    })
    const store = usePlatformsStore()
    await store.fetchGatewayStatus()
    // served_profiles 过滤仍生效：wei 不在服名单 → 只剩 2 行
    expect(store.platforms.length).toBe(2)
  })

  it('两键皆缺 → 投影为空但状态不停摆', async () => {
    mockFetch({ status: 'ok', gateway_state: 'stopped' })
    const store = usePlatformsStore()
    await store.fetchGatewayStatus()
    expect(store.platforms.length).toBe(0)
    expect(store.gatewayState).toBe('stopped')
  })
})
