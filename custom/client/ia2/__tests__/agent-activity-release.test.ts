// overlay/custom/client/ia2/__tests__/agent-activity-release.test.ts
// useAgentActivity 释放语义守门（2026-10-04 24h 审查轮增设）。
// 事故实锤：KanbanTaskCard（全站最高频挂载组件）只取值从不释放，consumers 只增
// 不减——15s /api/hermes/fleet/sessions 轮询在离开看板后仍进程级常驻（资源泄漏）。
// 守门三条：① scope 销毁自动停表（泄漏根治面）；② 手动 release 通道仍可用；
// ③ 双通道（手动 release + scope dispose）不二次减计。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { effectScope } from 'vue'

describe('useAgentActivity 释放语义', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // refresh() 的 authFetch 悬置：测试只关心表的生命周期，不打真实网络
    vi.stubGlobal('fetch', () => new Promise(() => {}))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('effect scope 销毁后轮询表自动清零（KanbanTaskCard 泄漏根治）', async () => {
    const { useAgentActivity } = await import('../composables/useAgentActivity')
    expect(vi.getTimerCount()).toBe(0)
    const scope = effectScope()
    scope.run(() => { useAgentActivity() })
    expect(vi.getTimerCount()).toBe(1)
    scope.stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('手动 releaseAgentActivity 通道仍停表', async () => {
    const { useAgentActivity } = await import('../composables/useAgentActivity')
    const scope = effectScope()
    const handle = scope.run(() => useAgentActivity())!
    expect(vi.getTimerCount()).toBe(1)
    handle.releaseAgentActivity()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('手动 release 后再 scope dispose 不二次减计（幂等），且可重新起表', async () => {
    const { useAgentActivity } = await import('../composables/useAgentActivity')
    const scope = effectScope()
    const handle = scope.run(() => useAgentActivity())!
    handle.releaseAgentActivity()
    scope.stop()
    expect(vi.getTimerCount()).toBe(0)
    // 消费者计数未被打穿：新 scope 能重新起表
    const scope2 = effectScope()
    scope2.run(() => { useAgentActivity() })
    expect(vi.getTimerCount()).toBe(1)
    scope2.stop()
    expect(vi.getTimerCount()).toBe(0)
  })
})
