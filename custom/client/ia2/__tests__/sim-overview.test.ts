// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/sim-overview.test.ts
// 签 1 轮次总览（驾驶屏）单测（B 波收尾件，R1/R3/R6/N1）：
// 纯函数（姿态档/闸全名行/净额双行）+面板 VTU（姿态横幅三档色带+清偿灯红绿、
// 健康行如实、六闸全名首现、净额双行并列+分型紫标、端点 503 如实）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

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
import OverviewPanel from '../views/sim/OverviewPanel.vue'

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

describe('OverviewPanel — 驾驶屏', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('姿态横幅（standard 琥珀带+清偿红灯）+六闸全名行+净额双行+分型紫标', async () => {
    mockedRunState.mockResolvedValue({
      run: 'r', posture: 'standard',
      gates: { g1_frozen: 't1', g5_humangate: '' },
      steps: { a_done: '1', b_done: '1', c_done: '1' },
      ledger: { total: 40, open: 27, byType: { 'auto-approve': 22, nudge: 5 } },
      source: { stateFile: 's', ledgerFile: 'l', ledgerPresent: true },
    })
    mockedTopology.mockResolvedValue({
      services: {
        gateway: { ok: true, latency_ms: 1 }, studio: { ok: false, latency_ms: 2, error: 'x' },
        synapse: { ok: true, latency_ms: 1 }, hindsight: { ok: true, latency_ms: 1 },
      },
      checkedAt: 't',
    })
    const w = mount(OverviewPanel)
    await w.find('[data-testid="ov-run"]').setValue('r')
    await w.find('[data-testid="ov-load"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="ov-posture"]').classes()).toContain('ov__banner--standard')
    const lamp = w.find('[data-testid="ov-clearance-lamp"]')
    expect(lamp.classes()).toContain('ov__clear-lamp--red')
    expect(lamp.text()).toContain('27 笔未清·拒开新轮')
    expect(w.find('[data-testid="ov-health"]').text()).toContain('3/4 在线')
    expect(w.find('[data-testid="ov-health"]').text()).toContain('studio 离线')
    expect(w.find('[data-testid="ov-gate-g1_frozen"]').text()).toContain('G1 需求冻结')
    expect(w.find('[data-testid="ov-gate-g5_humangate"]').text()).toContain('未过')
    expect(w.find('[data-testid="ov-net-compensated"]').text()).toBe('台账 40 笔，未清 27')
    expect(w.find('[data-testid="ov-net-cleared"]').text()).toBe('已清 13')
    expect(w.findAll('[data-testid="sim-comp-tag"]')).toHaveLength(2)
    expect(w.find('[data-testid="ov-steps"]').text()).toContain('3 项')
    w.unmount()
  })

  it('清偿放行绿灯+零代偿如实；拓扑端点失败=健康行缺席标注', async () => {
    mockedRunState.mockResolvedValue({
      run: 'r', posture: 'strict', gates: {}, steps: {},
      ledger: { total: 0, open: 0, byType: {} },
      source: { stateFile: 's', ledgerFile: 'l', ledgerPresent: false },
    })
    mockedTopology.mockRejectedValue(new Error('x → 503'))
    const w = mount(OverviewPanel)
    await w.find('[data-testid="ov-run"]').setValue('r')
    await w.find('[data-testid="ov-load"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="ov-posture"]').classes()).toContain('ov__banner--strict')
    expect(w.find('[data-testid="ov-clearance-lamp"]').classes()).toContain('ov__clear-lamp--green')
    expect(w.find('[data-testid="ov-clearance-lamp"]').text()).toContain('放行')
    expect(w.find('[data-testid="ov-health"]').text()).toContain('未探测')
    expect(w.text()).toContain('零代偿（台账空）')
    w.unmount()
  })

  it('run-state 端点 503（OBS_SIM_ROOT 缺席）如实报错不渲染驾驶屏', async () => {
    mockedRunState.mockRejectedValue(new Error('/api/hermes/sim/run-state → 503'))
    mockedTopology.mockResolvedValue({ services: {}, checkedAt: 't' })
    const w = mount(OverviewPanel)
    await w.find('[data-testid="ov-run"]').setValue('r')
    await w.find('[data-testid="ov-load"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="ov-error"]').text()).toContain('503')
    expect(w.find('[data-testid="ov-posture"]').exists()).toBe(false)
    w.unmount()
  })
})
