// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/ia-column-controls.test.ts
// v12.4 栏控簇守门（2026-09-20 用户裁定：栏控迁三栏各自右上角）：
// 按钮组合按 props 收窄（fold 方向/showMax/showPopout），动作全 emit；
// 最大化态换还原图标与还原文案。
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import IaColumnControls from '../components/IaColumnControls.vue'

describe('IaColumnControls — 三栏栏控簇', () => {
  it('左栏形态：仅折叠钮（◀），无最大化/独立窗口钮', () => {
    const w = mount(IaColumnControls, { props: { testid: 'ia-col-left', fold: 'left' } })
    expect(w.find('[data-testid="ia-col-left-fold"]').text()).toBe('◀')
    expect(w.find('[data-testid="ia-col-left-max"]').exists()).toBe(false)
    expect(w.find('[data-testid="ia-col-left-popout"]').exists()).toBe(false)
  })

  it('右栏形态：折叠钮箭头朝右（▶）', () => {
    const w = mount(IaColumnControls, { props: { testid: 'ia-col-right', fold: 'right' } })
    expect(w.find('[data-testid="ia-col-right-fold"]').text()).toBe('▶')
  })

  it('中栏形态：最大化+独立窗口；最大化态换 ⤡ 与还原文案；动作 emit 对应事件', async () => {
    const w = mount(IaColumnControls, {
      props: { testid: 'ia-col-center', showMax: true, maximized: false, showPopout: true },
    })
    const max = w.find('[data-testid="ia-col-center-max"]')
    expect(max.text()).toBe('⤢')
    expect(max.attributes('title')).toBe('ia2.wm.maxCenter')
    expect(w.find('[data-testid="ia-col-center-fold"]').exists()).toBe(false)
    await max.trigger('click')
    await w.find('[data-testid="ia-col-center-popout"]').trigger('click')
    expect(w.emitted('max')).toHaveLength(1)
    expect(w.emitted('popout')).toHaveLength(1)
    await w.setProps({ maximized: true })
    expect(w.find('[data-testid="ia-col-center-max"]').text()).toBe('⤡')
    expect(w.find('[data-testid="ia-col-center-max"]').attributes('title')).toBe('ia2.wm.restoreCenter')
  })
})
