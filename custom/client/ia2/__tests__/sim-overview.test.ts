// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/sim-overview.test.ts
// 签 1 运行总览（总览屏）单测（B 波收尾件，R1/R3/R6/N1）：
// 纯函数（运行模式档/质量门全名行/净计双行）+面板 VTU（运行模式横幅三档色带+遗留项灯红绿、
// 健康行如实、六道质量门全名首现、净计双行并列+分型紫标、端点 503 如实）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('../api/overview', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/overview')>()
  return { ...actual, fetchRunState: vi.fn() }
})
vi.mock('../api/ops', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/ops')>()
  return { ...actual, fetchTopology: vi.fn() }
})

import { postureKind, gateRows, netCardRows } from '../api/overview'
import { fetchRunState } from '../api/overview'
import { fetchTopology } from '../api/ops'
import CockpitPanel from '../views/sim/CockpitPanel.vue'

const mockedRunState = vi.mocked(fetchRunState)
const mockedTopology = vi.mocked(fetchTopology)

describe('纯函数层', () => {
  it('postureKind：三档识别+非三档值 unknown（如实灰显不猜）', () => {
    expect(postureKind('strict')).toBe('strict')
    expect(postureKind('standard')).toBe('standard')
    expect(postureKind('demo')).toBe('demo')
    expect(postureKind('military')).toBe('unknown')
    expect(postureKind('')).toBe('unknown')
  })
  it('gateRows：六闸全名首现+安全闸/人工批准/收尾键映射；未知键保原名', () => {
    const rows = gateRows({
      g1_frozen: '2026-10-15T08:00:00Z', g2_arch_pass: '1', security_review_done: '1',
      humangate_g5: '1', report_done: '1', custom_gate: 'x',
    })
    const byKey = Object.fromEntries(rows.map(r => [r.key, r.label]))
    expect(byKey.g1_frozen).toBe('G1 需求冻结')
    expect(byKey.g2_arch_pass).toBe('G2 架构评审')
    expect(byKey.security_review_done).toBe('安全闸')
    expect(byKey.humangate_g5).toBe('人工批准（HumanGate）')
    expect(byKey.report_done).toBe('报告完成')
    expect(byKey.custom_gate).toBe('custom_gate')
  })
  it('netCardRows：双行并列（含代偿/已清）+分型计数倒序', () => {
    const n = netCardRows({ total: 40, open: 27, byType: { nudge: 5, 'auto-approve': 22 } })
    expect(n.compensated).toBe('台账 40 笔，未清 27')
    expect(n.net).toBe('已清 13')
    expect(n.byType[0]).toEqual({ type: 'auto-approve', count: 22 })
  })
})

describe('OverviewPanel — 总览屏', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('轻量条（B10）：query 带 run 自动装载——三徽标（运行模式色点/遗留项灯/服务异常）+点击跳签 1', async () => {
    mockedRunState.mockResolvedValue({
      run: 'r', posture: 'standard', gates: {}, steps: {},
      ledger: { total: 40, open: 27, byType: { 'auto-approve': 22 } },
      source: { stateFile: 's', ledgerFile: 'l', ledgerPresent: true },
    })
    mockedTopology.mockResolvedValue({
      services: {
        gateway: { ok: true, latency_ms: 1 }, studio: { ok: false, latency_ms: 2, error: 'x' },
        synapse: { ok: true, latency_ms: 1 }, hindsight: { ok: true, latency_ms: 1 },
      },
      checkedAt: 't',
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/app/sim', name: 'ia2.sim', component: { template: '<div />' } }],
    })
    await router.push('/app/sim?run=r')
    await router.isReady()
    const w = mount(CockpitPanel, { global: { plugins: [router] } })
    await flushPromises()
    expect(w.find('[data-testid="cpb-strip"]').exists()).toBe(true)
    expect(w.find('.cpb__dot--standard').exists()).toBe(true)
    expect(w.find('[data-testid="cpb-clearance"]').text()).toContain('27 待处理')
    expect(w.find('[data-testid="cpb-services"]').text()).toContain('1 异常')
    await w.find('[data-testid="cpb-strip"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.sim')
    w.unmount()
  })

  it('轻量条：无 run=待命提示（不自建输入，单一事实源在签 1）', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/app/sim', name: 'ia2.sim', component: { template: '<div />' } }],
    })
    await router.push('/app/sim')
    await router.isReady()
    const w = mount(CockpitPanel, { global: { plugins: [router] } })
    await flushPromises()
    expect(w.find('[data-testid="cpb-empty"]').text()).toContain('值班台待命')
    expect(mockedRunState).not.toHaveBeenCalled()
    w.unmount()
  })

  it('轻量条：run-state 不可达如实（红点+错误徽标），不渲染正常徽标', async () => {
    mockedRunState.mockRejectedValue(new Error('x → 503'))
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/app/sim', name: 'ia2.sim', component: { template: '<div />' } }],
    })
    await router.push('/app/sim?run=r')
    await router.isReady()
    const w = mount(CockpitPanel, { global: { plugins: [router] } })
    await flushPromises()
    expect(w.find('[data-testid="cpb-error"]').text()).toContain('不可达')
    expect(w.find('[data-testid="cpb-clearance"]').exists()).toBe(false)
    w.unmount()
  })
})
