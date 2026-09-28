// overlay/custom/client/ide/__tests__/ide-landing-fallback.test.ts
// 守门（2026-09-17 24h 评审）：patch 276/277 登录守卫硬指向 /ide，
// features.ide 关闭时 bootstrap 必须注册 /ide 重定向兜底，否则登录后
// 命中无匹配路由白屏。
// 2026-09-18 统一导航 Task 5：兜底目标 /hermes/cockpit 已是死路由，改指 /app。
import { describe, it, expect, beforeEach, vi } from 'vitest'

const featuresState = vi.hoisted(() => ({
  ide: true,
  matrixChat: false,
  kanbanEnhancements: false,
  branding: false,
  cockpit: false,
}))
vi.mock('../../../../config/features', () => ({ features: featuresState }))

const routerStubs = vi.hoisted(() => ({ addRoute: vi.fn() }))
vi.mock('../../../../../upstream/hermes-studio/packages/client/src/router', () => ({ default: routerStubs }))

const ia2Stubs = vi.hoisted(() => ({
  registerIa2: vi.fn(async () => {}),
}))
vi.mock('../../../../custom/client/ia2', () => ia2Stubs)

const ideStubs = vi.hoisted(() => ({ registerIde: vi.fn(async () => {}) }))
vi.mock('../../../../custom/client/ide', () => ideStubs)

import { bootstrapClient } from '../../../../registries/client/bootstrap'

describe('bootstrap /ide 落点兜底', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('features.ide 开启：走 registerIde，不注册重定向', async () => {
    featuresState.ide = true
    await bootstrapClient({} as never)
    expect(ideStubs.registerIde).toHaveBeenCalledTimes(1)
    expect(routerStubs.addRoute).not.toHaveBeenCalledWith(expect.objectContaining({ path: '/ide' }))
  })

  it('features.ide 关闭：注册 /ide → /app 重定向兜底', async () => {
    featuresState.ide = false
    await bootstrapClient({} as never)
    expect(ideStubs.registerIde).not.toHaveBeenCalled()
    expect(routerStubs.addRoute).toHaveBeenCalledWith({ path: '/ide', redirect: '/app' })
  })
})
