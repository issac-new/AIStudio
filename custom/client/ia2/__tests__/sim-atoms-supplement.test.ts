// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/sim-atoms-supplement.test.ts
// X0 补三原子守门（wp4，2026-10-16）：步境标/闸全名徽/RACI 角标——六原子包补齐定稿三·补的八展示原子面。
// 规则锚：闸全名首现（§5.3）、七幕名（§2.9）、RACI 职能角标（§2.2/§2.9）、代偿代判紫标（§2.6.5）。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import { SimStepBadge, SimGateBadge, SimRaciBadge } from '../components/sim/index'

describe('SimStepBadge — 步境标（§2.9/§3.3）', () => {
  it('幕+步齐：显示「幕名 · 步 N」', () => {
    const w = mount(SimStepBadge, { props: { act: 5, step: 18 } })
    expect(w.find('[data-testid="sim-step-badge"]').text()).toBe('第四幕生产 · 步 18')
    w.unmount()
  })

  it('缺席态：步缺席只显幕名；双缺席不渲染', () => {
    const a = mount(SimStepBadge, { props: { act: 1 } })
    expect(a.find('[data-testid="sim-step-badge"]').text()).toBe('序幕搭台')
    a.unmount()
    const b = mount(SimStepBadge, { props: {} })
    expect(b.find('[data-testid="sim-step-badge"]').exists()).toBe(false)
    b.unmount()
  })

  it('未知幕序号降级为步号（不硬凑幕名）', () => {
    const w = mount(SimStepBadge, { props: { act: 9, step: 3 } })
    expect(w.find('[data-testid="sim-step-badge"]').text()).toBe('步 3')
    w.unmount()
  })
})

describe('SimGateBadge — 质量门全名徽（§5.3 全名首现）', () => {
  it('六道质量门全名逐一正确且首现即全名', () => {
    const names: Array<[string, string]> = [
      ['G1', 'G1 需求冻结'], ['G2', 'G2 架构评审'], ['G3', 'G3 代码门禁'],
      ['G4', 'G4 独立验证'], ['G5', 'G5 发布准出'], ['G6', 'G6 复盘'],
    ]
    for (const [gate, name] of names) {
      const w = mount(SimGateBadge, { props: { gate } })
      expect(w.find('.gate-name').text(), gate).toBe(name)
      w.unmount()
    }
  })

  it('状态色类与首过/打回计数', () => {
    const w = mount(SimGateBadge, { props: { gate: 'g3', status: 'pass', firstPass: false, rejectCount: 1 } })
    expect(w.find('.gate-name.pass').exists()).toBe(true)
    expect(w.find('[data-testid="sim-gate-first"]').exists()).toBe(false)
    expect(w.find('[data-testid="sim-gate-reject"]').text()).toBe('打回 1')
    w.unmount()
  })

  it('provenance：代偿代判=紫标类，缺席不渲染来源', () => {
    const w = mount(SimGateBadge, { props: { gate: 'G2', provenance: 'compensated' } })
    expect(w.find('[data-testid="sim-gate-prov"]').text()).toBe('代偿代判')
    expect(w.find('.prov-comp').exists()).toBe(true)
    w.unmount()
    const b = mount(SimGateBadge, { props: { gate: 'G2' } })
    expect(b.find('[data-testid="sim-gate-prov"]').exists()).toBe(false)
    b.unmount()
  })
})

describe('SimRaciBadge — RACI 职能角标（§2.2/§2.9）', () => {
  it('职能名+RACI 字母，title 带职责说明', () => {
    const w = mount(SimRaciBadge, { props: { role: '需求分析AI', raci: 'R' } })
    expect(w.find('[data-testid="sim-raci-badge"]').text()).toBe('需求分析AI · R')
    expect(w.find('[data-testid="sim-raci-badge"]').attributes('title')).toBe('R 负责执行')
    w.unmount()
  })

  it('缺席态：字母缺席只显职能名；A 的 title=最终负责', () => {
    const a = mount(SimRaciBadge, { props: { role: '主管A' } })
    expect(a.find('[data-testid="sim-raci-badge"]').text()).toBe('主管A')
    expect(a.find('[data-testid="sim-raci-badge"]').attributes('title')).toBe('')
    a.unmount()
    const b = mount(SimRaciBadge, { props: { role: '主管A', raci: 'A' } })
    expect(b.find('[data-testid="sim-raci-badge"]').attributes('title')).toContain('最终负责')
    b.unmount()
  })
})
