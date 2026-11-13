// 账号切换器 UI 守门（spec 2026-11-13 matrix-account-switch）：
// 双源合并渲染（档位 ∪ vault，同 userId 去重取档位项）/ 当前账号高亮禁用 /
// 点击分发到对应编排 / manual 项移除即时生效（localStorage 非响应式源的版本号刷新）/
// 档位加载失败降级仅 manual。
// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const switchToProfileAccount = vi.hoisted(() => vi.fn())
const switchToManualAccount = vi.hoisted(() => vi.fn())
const state = vi.hoisted(() => ({ userId: '@cur:ms.test' as string | null }))

vi.mock('../stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ get userId() { return state.userId } }),
}))
vi.mock('../stores/account-switcher', () => ({
  switchToProfileAccount,
  switchToManualAccount,
  StaleTokenError: class StaleTokenError extends Error {},
  PendingAccountError: class PendingAccountError extends Error {},
}))
vi.mock('@/utils/deployment-url', () => ({ deploymentUrl: (p: string) => p }))
const showToast = vi.hoisted(() => vi.fn())
vi.mock('@/custom/ide/utils/toast', () => ({ showToast }))

import MatrixAccountSwitcher from '../components/MatrixAccountSwitcher.vue'
import { upsertAccountVault } from '../stores/matrix-credentials'

function stubFetch(body: unknown, ok = true, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status, json: async () => body })))
}

function mountSwitcher() {
  const w = mount(MatrixAccountSwitcher, { attachTo: document.body })
  return w
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  state.userId = '@cur:ms.test'
})

describe('列表合并渲染', () => {
  it('档位项 + vault manual 项合并；同 userId 去重取档位项；当前账号标「当前」并禁用', async () => {
    upsertAccountVault(
      { accessToken: 't1', userId: '@cur:ms.test', deviceId: '', homeserverUrl: 'https://ms.test' },
      { displayName: '当前用户' },
    )
    upsertAccountVault(
      { accessToken: 't2', userId: '@hu:ms.test', deviceId: '', homeserverUrl: 'https://ms.test' },
      { displayName: '胡工' },
    )
    stubFetch({ accounts: [
      { profile: 'pay-orchestrator', userId: '@pay:ms.test', homeserverUrl: 'https://ms.test' },
      // 与 vault 当前账号同 userId 的档位项——去重后取档位形态
      { profile: 'cur-team', userId: '@cur:ms.test', homeserverUrl: 'https://ms.test' },
    ] })
    const w = mountSwitcher()
    await w.find('button.page-sidebar-menu-btn').trigger('click')
    await flushPromises()

    const items = w.findAll('.account-switcher-item')
    // 3 项：cur-team（档位，当前）+ pay-orchestrator（档位）+ @hu（manual；@cur 的 manual 形态被档位项吃掉）
    expect(items).toHaveLength(3)
    const active = w.find('.account-switcher-item.active')
    expect(active.text()).toContain('cur-team')
    expect((active.element as HTMLButtonElement).disabled).toBe(true)
    expect(w.text()).toContain('档位 · pay-orchestrator')
    expect(w.text()).toContain('胡工')
    expect(w.text()).toContain('本机登录')
    w.unmount()
  })

  it('档位加载失败 → 降级提示 + 仅 manual 项', async () => {
    upsertAccountVault(
      { accessToken: 't2', userId: '@hu:ms.test', deviceId: '', homeserverUrl: 'https://ms.test' },
      { displayName: '胡工' },
    )
    stubFetch({}, false, 403)
    const w = mountSwitcher()
    await w.find('button.page-sidebar-menu-btn').trigger('click')
    await flushPromises()
    expect(w.find('.account-switcher-hint').exists()).toBe(true)
    expect(w.findAll('.account-switcher-item')).toHaveLength(1)
    expect(w.text()).toContain('胡工')
    w.unmount()
  })
})

describe('切换分发', () => {
  it('点击档位项 → switchToProfileAccount(档位名)', async () => {
    stubFetch({ accounts: [{ profile: 'pay-orchestrator', userId: '@pay:ms.test', homeserverUrl: 'https://ms.test' }] })
    switchToProfileAccount.mockResolvedValue({ userId: '@pay:ms.test', profileSwitch: 'done', profile: 'pay-orchestrator' })
    const w = mountSwitcher()
    await w.find('button.page-sidebar-menu-btn').trigger('click')
    await flushPromises()
    await w.findAll('.account-switcher-item')[0].trigger('click')
    await flushPromises()
    expect(switchToProfileAccount).toHaveBeenCalledWith('pay-orchestrator')
    w.unmount()
  })

  it('点击 manual 项 → switchToManualAccount(userId)', async () => {
    upsertAccountVault(
      { accessToken: 't2', userId: '@hu:ms.test', deviceId: '', homeserverUrl: 'https://ms.test' },
      { displayName: '胡工' },
    )
    stubFetch({ accounts: [] })
    switchToManualAccount.mockResolvedValue({ userId: '@hu:ms.test', profileSwitch: 'done' })
    const w = mountSwitcher()
    await w.find('button.page-sidebar-menu-btn').trigger('click')
    await flushPromises()
    await w.findAll('.account-switcher-item')[0].trigger('click')
    await flushPromises()
    expect(switchToManualAccount).toHaveBeenCalledWith('@hu:ms.test')
    w.unmount()
  })
})

describe('manual 项移除', () => {
  it('移除钮点击后列表即时消失（版本号刷新非响应式源）', async () => {
    upsertAccountVault(
      { accessToken: 't2', userId: '@hu:ms.test', deviceId: '', homeserverUrl: 'https://ms.test' },
      { displayName: '胡工' },
    )
    stubFetch({ accounts: [] })
    const w = mountSwitcher()
    await w.find('button.page-sidebar-menu-btn').trigger('click')
    await flushPromises()
    expect(w.findAll('.account-switcher-item')).toHaveLength(1)
    await w.find('.account-switcher-remove').trigger('click')
    await flushPromises()
    expect(w.findAll('.account-switcher-item')).toHaveLength(0)
    expect(showToast).toHaveBeenCalledWith('已从本机账号列表移除')
    w.unmount()
  })
})
