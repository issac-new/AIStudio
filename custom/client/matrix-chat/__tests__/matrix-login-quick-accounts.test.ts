// 登录页「本机账号一键进入」守门（spec 批二变更 3）：
// 双源合并渲染（档位 ∪ vault）/ 点击分发切换编排（登录页场景=免密进入）/
// 失败行内提示（Stale/Pending 人话文案）/ 空态与加载失败降级。
// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const switchToProfileAccount = vi.hoisted(() => vi.fn())
const switchToManualAccount = vi.hoisted(() => vi.fn())
vi.mock('../stores/account-switcher', () => ({
  switchToProfileAccount,
  switchToManualAccount,
  StaleTokenError: class StaleTokenError extends Error {},
  PendingAccountError: class PendingAccountError extends Error {},
}))
vi.mock('@/utils/deployment-url', () => ({ deploymentUrl: (p: string) => p }))

import MatrixLoginQuickAccounts from '../components/MatrixLoginQuickAccounts.vue'
import { upsertAccountVault } from '../stores/matrix-credentials'

function stubFetch(body: unknown, ok = true, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status, json: async () => body })))
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('MatrixLoginQuickAccounts', () => {
  it('档位 ∪ vault 合并渲染；同 userId 去重取档位项', async () => {
    upsertAccountVault(
      { accessToken: 't', userId: '@hu:ms.test', deviceId: '', homeserverUrl: 'https://ms.test' },
      { displayName: '胡工' },
    )
    // 档位项与 vault 无交集 + 一个同 userId 档位（去重）
    upsertAccountVault(
      { accessToken: 't2', userId: '@dup:ms.test', deviceId: '', homeserverUrl: 'https://ms.test' },
    )
    stubFetch({ accounts: [
      { profile: 'pay-orchestrator', userId: '@pay:ms.test', homeserverUrl: 'https://ms.test' },
      { profile: 'dup-team', userId: '@dup:ms.test', homeserverUrl: 'https://ms.test' },
    ] })
    const w = mount(MatrixLoginQuickAccounts)
    await flushPromises()
    const items = w.findAll('.quick-accounts-item')
    // 3 项：@pay（档位）+ @dup（档位形态，vault 形态被去重）+ @hu（manual）
    expect(items).toHaveLength(3)
    expect(w.text()).toContain('档位 · pay-orchestrator')
    expect(w.text()).toContain('胡工')
    expect(w.text()).toContain('本机登录')
    // @dup 只出现一次（档位形态，vault 形态被去重）
    expect(w.text().match(/@dup:ms\.test/g)?.length).toBe(1)
    w.unmount()
  })

  it('点击档位项 → switchToProfileAccount；点击 manual 项 → switchToManualAccount', async () => {
    upsertAccountVault(
      { accessToken: 't', userId: '@hu:ms.test', deviceId: '', homeserverUrl: 'https://ms.test' },
      { displayName: '胡工' },
    )
    stubFetch({ accounts: [{ profile: 'ops-sre', userId: '@ops:ms.test', homeserverUrl: 'https://ms.test' }] })
    switchToProfileAccount.mockResolvedValue({ userId: '@ops:ms.test', profileSwitch: 'done', profile: 'ops-sre' })
    switchToManualAccount.mockResolvedValue({ userId: '@hu:ms.test', profileSwitch: 'done' })

    const w = mount(MatrixLoginQuickAccounts)
    await flushPromises()
    await w.findAll('.quick-accounts-item')[0].trigger('click')
    expect(switchToProfileAccount).toHaveBeenCalledWith('ops-sre')
    await w.findAll('.quick-accounts-item')[1].trigger('click')
    expect(switchToManualAccount).toHaveBeenCalledWith('@hu:ms.test')
    w.unmount()
  })

  it('档位加载失败 → 行内提示，manual 项仍可用（降级）', async () => {
    upsertAccountVault(
      { accessToken: 't', userId: '@hu:ms.test', deviceId: '', homeserverUrl: 'https://ms.test' },
      { displayName: '胡工' },
    )
    stubFetch({}, false, 403)
    const w = mount(MatrixLoginQuickAccounts)
    await flushPromises()
    expect(w.find('.quick-accounts-hint').exists()).toBe(true)
    expect(w.findAll('.quick-accounts-item')).toHaveLength(1)
    w.unmount()
  })

  it('空态：无档位无 vault → 引导文案，零按钮', async () => {
    stubFetch({ accounts: [] })
    const w = mount(MatrixLoginQuickAccounts)
    await flushPromises()
    expect(w.find('.quick-accounts-empty').exists()).toBe(true)
    expect(w.findAll('.quick-accounts-item')).toHaveLength(0)
    w.unmount()
  })

  it('切换失败（StaleTokenError）→ 行内错误不静默', async () => {
    stubFetch({ accounts: [{ profile: 'ops-sre', userId: '@ops:ms.test', homeserverUrl: 'https://ms.test' }] })
    switchToProfileAccount.mockRejectedValue(new Error('档位 ops-sre 的 Matrix 密码已失效，请更新该档位 .env 的 MATRIX_PASSWORD'))
    const w = mount(MatrixLoginQuickAccounts)
    await flushPromises()
    await w.findAll('.quick-accounts-item')[0].trigger('click')
    await flushPromises()
    expect(w.find('.quick-accounts-error').text()).toContain('MATRIX_PASSWORD')
    w.unmount()
  })
})
