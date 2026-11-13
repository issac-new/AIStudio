// 账号切换编排守门（spec 2026-11-13 matrix-account-switch）：
// 三步全序（取档位三元组 → matrix-login 换 JWT → 档位联动）与失败语义
// （D2 先登录后切档：登录失败不动档位不动本地凭据；401 删仓上抛；403 零写入；
// 档位联动 403 降级不阻断）。
// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest'

const setApiKey = vi.hoisted(() => vi.fn())
vi.mock('@/api/client', () => ({ setApiKey }))
vi.mock('@/utils/deployment-url', () => ({ deploymentUrl: (p: string) => p }))

import {
  switchToProfileAccount,
  switchToManualAccount,
  StaleTokenError,
  PendingAccountError,
  ProfileNotConfiguredError,
} from '../stores/account-switcher'
import { getMatrixCredentials, listVaultAccounts, upsertAccountVault } from '../stores/matrix-credentials'

// jsdom 的 window.location.reload 只读——重定义 location 为带 mock reload 的桩
const reloadMock = vi.hoisted(() => vi.fn())
Object.defineProperty(window, 'location', {
  value: { reload: reloadMock, href: 'http://localhost/' },
  writable: true,
})

type Call = { url: string; init?: RequestInit }

function mockFetchSeq(responses: Array<{ match: (c: Call) => boolean; status: number; body?: unknown }>) {
  const calls: Call[] = []
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const call = { url, init }
    calls.push(call)
    const hit = responses.find(r => r.match(call))
    if (!hit) throw new Error(`unexpected fetch: ${url}`)
    return {
      ok: hit.status >= 200 && hit.status < 300,
      status: hit.status,
      json: async () => hit.body ?? {},
    } as Response
  })
  vi.stubGlobal('fetch', fn)
  return { calls, fn }
}

const isGet = (path: string) => (c: Call) => c.url === path && (c.init?.method ?? 'GET') === 'GET'
const isPut = (path: string) => (c: Call) => c.url === path && c.init?.method === 'PUT'
const isPost = (path: string) => (c: Call) => c.url === path && c.init?.method === 'POST'

const PROFILE_CREDS = { configured: true, homeserverUrl: 'https://ms.test', accessToken: 'syt_profile', userId: '@pay:ms.test' }
const LOGIN_OK = { token: 'jwt_new', user: { matrix_display_name: '支付总监', matrix_avatar_url: null } }

beforeEach(() => {
  localStorage.clear()
  setApiKey.mockClear()
  reloadMock.mockClear()
  vi.unstubAllGlobals()
})

describe('switchToProfileAccount（档位联动链）', () => {
  it('成功链全序：取三元组 → matrix-login → 档位联动 → 写凭据入仓 → reload', async () => {
    const { calls } = mockFetchSeq([
      { match: isGet('/api/matrix/gateway-credentials?profile=pay-orchestrator'), status: 200, body: PROFILE_CREDS },
      { match: isPost('/api/auth/matrix-login'), status: 200, body: LOGIN_OK },
      { match: isPut('/api/hermes/profiles/active'), status: 200, body: { success: true } },
    ])

    const result = await switchToProfileAccount('pay-orchestrator')

    expect(calls.map(c => c.url)).toEqual([
      '/api/matrix/gateway-credentials?profile=pay-orchestrator',
      '/api/auth/matrix-login',
      '/api/hermes/profiles/active',
    ])
    // matrix-login 请求体契约（服务端 controller 字段名）
    const loginBody = JSON.parse(String(calls[1].init?.body))
    expect(loginBody).toMatchObject({
      matrixAccessToken: 'syt_profile',
      matrixUserId: '@pay:ms.test',
      homeserverUrl: 'https://ms.test',
    })
    expect(setApiKey).toHaveBeenCalledWith('jwt_new')
    expect(getMatrixCredentials()).toMatchObject({ accessToken: 'syt_profile', userId: '@pay:ms.test' })
    expect(listVaultAccounts()[0]).toMatchObject({ source: 'profile', profile: 'pay-orchestrator', displayName: '支付总监' })
    expect(result).toEqual({ userId: '@pay:ms.test', profileSwitch: 'done', profile: 'pay-orchestrator' })
    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('登录 401（档位 token 失效）→ StaleTokenError，档位与本地凭据零改动（D2）', async () => {
    const { calls } = mockFetchSeq([
      { match: isGet('/api/matrix/gateway-credentials?profile=pay-orchestrator'), status: 200, body: PROFILE_CREDS },
      { match: isPost('/api/auth/matrix-login'), status: 401, body: { error: 'Invalid Matrix access token' } },
    ])
    await expect(switchToProfileAccount('pay-orchestrator')).rejects.toBeInstanceOf(StaleTokenError)
    expect(calls.map(c => c.url)).not.toContain('/api/hermes/profiles/active')
    expect(setApiKey).not.toHaveBeenCalled()
    expect(getMatrixCredentials()).toBeNull()
    expect(reloadMock).not.toHaveBeenCalled()
  })

  it('登录 403（账号待激活）→ PendingAccountError，零写入', async () => {
    mockFetchSeq([
      { match: isGet('/api/matrix/gateway-credentials?profile=pay-orchestrator'), status: 200, body: PROFILE_CREDS },
      { match: isPost('/api/auth/matrix-login'), status: 403, body: { error: 'Account awaits activation' } },
    ])
    await expect(switchToProfileAccount('pay-orchestrator')).rejects.toBeInstanceOf(PendingAccountError)
    expect(setApiKey).not.toHaveBeenCalled()
    expect(getMatrixCredentials()).toBeNull()
  })

  it('档位未配置（404）→ ProfileNotConfiguredError', async () => {
    mockFetchSeq([
      { match: isGet('/api/matrix/gateway-credentials?profile=ghost'), status: 404, body: { configured: false } },
    ])
    await expect(switchToProfileAccount('ghost')).rejects.toBeInstanceOf(ProfileNotConfiguredError)
  })

  it('档位联动 403（非超管）→ 降级 skipped_forbidden：身份照切、凭据照写、reload 照发', async () => {
    mockFetchSeq([
      { match: isGet('/api/matrix/gateway-credentials?profile=pay-orchestrator'), status: 200, body: PROFILE_CREDS },
      { match: isPost('/api/auth/matrix-login'), status: 200, body: LOGIN_OK },
      { match: isPut('/api/hermes/profiles/active'), status: 403, body: { error: 'forbidden' } },
    ])
    const result = await switchToProfileAccount('pay-orchestrator')
    expect(result.profileSwitch).toBe('skipped_forbidden')
    expect(setApiKey).toHaveBeenCalledWith('jwt_new')
    expect(getMatrixCredentials()?.userId).toBe('@pay:ms.test')
    expect(reloadMock).toHaveBeenCalledTimes(1)
  })
})

describe('switchToManualAccount（vault 直切链）', () => {
  it('成功链：vault 取凭据 → matrix-login → 写凭据（source=manual）→ reload，不动档位', async () => {
    upsertAccountVault(
      { accessToken: 'syt_manual', userId: '@hu:ms.test', deviceId: 'DEV1', homeserverUrl: 'https://ms.test' },
      { displayName: '胡工' },
    )
    const { calls } = mockFetchSeq([
      { match: isPost('/api/auth/matrix-login'), status: 200, body: { token: 'jwt_m', user: {} } },
    ])

    const result = await switchToManualAccount('@hu:ms.test')

    expect(calls.map(c => c.url)).toEqual(['/api/auth/matrix-login'])
    expect(setApiKey).toHaveBeenCalledWith('jwt_m')
    expect(getMatrixCredentials()).toMatchObject({ accessToken: 'syt_manual', userId: '@hu:ms.test', deviceId: 'DEV1' })
    expect(listVaultAccounts()[0]).toMatchObject({ source: 'manual', displayName: '胡工' })
    expect(result).toEqual({ userId: '@hu:ms.test', profileSwitch: 'done' })
    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('token 失效（401）→ 删 vault 项 + StaleTokenError（D3：重登自动再入仓）', async () => {
    upsertAccountVault(
      { accessToken: 'syt_dead', userId: '@hu:ms.test', deviceId: '', homeserverUrl: 'https://ms.test' },
    )
    mockFetchSeq([
      { match: isPost('/api/auth/matrix-login'), status: 401, body: { error: 'Invalid Matrix access token' } },
    ])
    await expect(switchToManualAccount('@hu:ms.test')).rejects.toBeInstanceOf(StaleTokenError)
    expect(getVaultAbsent('@hu:ms.test')).toBe(true)
    expect(getMatrixCredentials()).toBeNull()
  })

  it('vault 缺席 → 直接报错不发请求', async () => {
    const { fn } = mockFetchSeq([])
    await expect(switchToManualAccount('@ghost:ms.test')).rejects.toThrow(/不在本机凭据仓/)
    expect(fn).not.toHaveBeenCalled()
  })
})

function getVaultAbsent(userId: string): boolean {
  return !listVaultAccounts().some(e => e.userId === userId)
}
