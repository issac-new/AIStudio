// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/engine-policy-card.test.ts
// P3 Task 8 — 策略下发最小版：GraphEnginePolicyCard（设置页"图引擎策略"卡）。
// 只读展示：GRAPH_ENGINE 当前模式 + 默认审批超时/熔断阈值（§7B.4，策略文件化随 P4）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { getEnginePolicy } = vi.hoisted(() => ({
  getEnginePolicy: vi.fn(),
}))
vi.mock('@/custom/loop/runcenter/api', () => ({
  runRest: { getEnginePolicy },
}))

import GraphEnginePolicyCard from '../components/GraphEnginePolicyCard.vue'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GraphEnginePolicyCard', () => {
  it('加载后渲染模式徽标与只读阈值', async () => {
    getEnginePolicy.mockResolvedValue({
      mode: 'on',
      policy: {
        failureBreakerLimit: 10,
        stagnationLimit: 10,
        interruptTimeoutMs: 72 * 60 * 60 * 1000,
        escalationResendMs: 24 * 60 * 60 * 1000,
      },
    })
    const w = mount(GraphEnginePolicyCard)
    await flushPromises()
    expect(w.find('[data-testid="ia-engine-mode"]').text()).toBe('on')
    expect(w.text()).toContain('ia2.engine.failureBreaker')
    expect(w.text()).toContain('10')
    // 72h 展示
    expect(w.text()).toContain('72h')
    expect(w.text()).toContain('24h')
  })

  it('加载失败显示不可用态而非崩溃', async () => {
    getEnginePolicy.mockRejectedValue(new Error('down'))
    const w = mount(GraphEnginePolicyCard)
    await flushPromises()
    expect(w.find('[data-testid="ia-engine-error"]').exists()).toBe(true)
  })

  it('加载中渲染占位', () => {
    getEnginePolicy.mockReturnValue(new Promise(() => {}))
    const w = mount(GraphEnginePolicyCard)
    expect(w.find('[data-testid="ia-engine-loading"]').exists()).toBe(true)
  })
})
