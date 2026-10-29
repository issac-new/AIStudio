// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/sim-fleet-bar.test.ts
// 舰队利用率条守门（自我觉察 spec §4 舰队层，最小产品面）：
//   1) 端点可用：主行「活跃 x/y·饱和度·闲置」+九域一行小字（数字自 mock 实测）
//   2) fail-soft 隐藏三态：404 抛错 / available:false / 网络失败——整条不渲染不占布局
//   3) 60s 轮询：到点重拉；卸载停轮（无泄漏定时器）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('../api/fleet-utilization', () => ({
  fetchFleetUtilization: vi.fn(),
}))

import { fetchFleetUtilization } from '../api/fleet-utilization'
import SimFleetBar from '../components/sim/SimFleetBar.vue'

const mockedFetch = vi.mocked(fetchFleetUtilization)

const MOCK_BODY = {
  ok: true,
  available: true,
  domains: [
    { domain: 'orchestration', label: '编排', staffed: 1, active: 1, recent: 1, lastActivityAgoSec: 120, saturationPct: 100 },
    { domain: 'dev', label: '研发', staffed: 4, active: 0, recent: 2, lastActivityAgoSec: 1800, saturationPct: 0 },
    { domain: 'ops', label: '运维', staffed: 1, active: 0, recent: 0, lastActivityAgoSec: null, saturationPct: 0 },
  ],
  fleet: { staffed: 6, active: 1, saturationPct: 17, idleCapacity: 5 },
  windows: { activeMin: 15, recentMin: 60 },
  fetchedAt: 1790000000000,
}

describe('SimFleetBar——舰队利用率条（spec §4 舰队层）', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('端点可用：主行数字+域行小字自 mock 数据实测渲染', async () => {
    mockedFetch.mockResolvedValue(MOCK_BODY)
    const wrapper = mount(SimFleetBar)
    await flushPromises()
    expect(wrapper.find('[data-testid="sim-fleet-bar"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sim-fleet-activity"]').text()).toBe('活跃 1/6')
    expect(wrapper.find('[data-testid="sim-fleet-saturation"]').text()).toBe('饱和度 17%')
    expect(wrapper.find('[data-testid="sim-fleet-idle"]').text()).toBe('闲置 5 工位')
    const rows = wrapper.findAll('[data-testid^="sim-fleet-domain-"]')
    expect(rows).toHaveLength(3)
    expect(rows[0].text()).toBe('编排 1 在编·1 活跃·100%')
    expect(rows[2].text()).toBe('运维 1 在编·0 活跃·0%')
    // 域行 title 携带近期窗/最近活动详情（克制呈现：hover 才见）
    expect(rows[1].attributes('title')).toContain('近期(1h) 2')
    expect(rows[2].attributes('title')).toContain('无活动记录')
    wrapper.unmount()
  })

  it('fail-soft 隐藏①端点 404（抛错）：整条不渲染', async () => {
    mockedFetch.mockRejectedValue(new Error('/api/sim/fleet-utilization → 404'))
    const wrapper = mount(SimFleetBar)
    await flushPromises()
    expect(wrapper.find('[data-testid="sim-fleet-bar"]').exists()).toBe(false)
    // 不占布局：根级只留 v-if 注释锚，零元素节点
    expect(wrapper.html().replace(/<!--.*?-->/g, '').trim()).toBe('')
    wrapper.unmount()
  })

  it('fail-soft 隐藏②available:false（推演根未配）：整条不渲染', async () => {
    mockedFetch.mockResolvedValue({ ok: true, available: false, note: '未配置推演根' })
    const wrapper = mount(SimFleetBar)
    await flushPromises()
    expect(wrapper.find('[data-testid="sim-fleet-bar"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('fail-soft 隐藏③available:true 但缺 fleet 汇总（形状残缺）：不硬凑', async () => {
    mockedFetch.mockResolvedValue({ available: true })
    const wrapper = mount(SimFleetBar)
    await flushPromises()
    expect(wrapper.find('[data-testid="sim-fleet-bar"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('60s 轮询：到点重拉；卸载停轮', async () => {
    vi.useFakeTimers()
    try {
      mockedFetch.mockResolvedValue(MOCK_BODY)
      const wrapper = mount(SimFleetBar)
      await vi.advanceTimersByTimeAsync(0)
      expect(mockedFetch).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(mockedFetch).toHaveBeenCalledTimes(2)
      // 轮询失败回落隐藏（fail-soft：上一次成功不恋战）
      mockedFetch.mockRejectedValue(new Error('network down'))
      await vi.advanceTimersByTimeAsync(60_000)
      expect(mockedFetch).toHaveBeenCalledTimes(3)
      await flushPromises()
      expect(wrapper.find('[data-testid="sim-fleet-bar"]').exists()).toBe(false)
      // 卸载后定时器不再触发
      wrapper.unmount()
      await vi.advanceTimersByTimeAsync(180_000)
      expect(mockedFetch).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })
})

afterEach(() => { vi.clearAllMocks() })
