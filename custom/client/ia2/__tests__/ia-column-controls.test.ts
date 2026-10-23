// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/ia-column-controls.test.ts
// 栏控簇守门（2026-09-20 栏控迁三栏各自顶部控制条；2026-10-23 统一轮）：
// 三栏一致的窗口语义按钮——最小化（–）/最大化（⤢）/还原（⤡）/独立窗口（⧉）；
// 按钮组合按 props 收窄（showMin/showMax/showPopout），动作全 emit。
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import IaColumnControls from '../components/IaColumnControls.vue'

describe('IaColumnControls — 三栏栏控簇（统一窗口语义·同形方框图标）', () => {
  it('最小化钮默认渲染：方框底边加重样式（--min）、title 走 ia2.wm.minPane、emit min', async () => {
    const w = mount(IaColumnControls, { props: { testid: 'ia-col-left' } })
    const min = w.find('[data-testid="ia-col-left-min"]')
    expect(min.find('.colctl__glyph--min').exists()).toBe(true)
    expect(min.attributes('title')).toBe('ia2.wm.minPane')
    expect(w.find('[data-testid="ia-col-left-max"]').exists()).toBe(false)
    await min.trigger('click')
    expect(w.emitted('min')).toHaveLength(1)
  })

  it('showMin=false 收起最小化钮（无可折叠语义的栏）', () => {
    const w = mount(IaColumnControls, { props: { testid: 'ia-col-x', showMin: false } })
    expect(w.find('[data-testid="ia-col-x-min"]').exists()).toBe(false)
  })

  it('最大化钮：常态完整方框（--max）/maxPane，独占态换双框样式（--restore）/restorePane；emit max', async () => {
    const w = mount(IaColumnControls, {
      props: { testid: 'ia-col-center', showMax: true, maximized: false },
    })
    const max = w.find('[data-testid="ia-col-center-max"]')
    expect(max.find('.colctl__glyph--max').exists()).toBe(true)
    expect(max.attributes('title')).toBe('ia2.wm.maxPane')
    await max.trigger('click')
    expect(w.emitted('max')).toHaveLength(1)
    await w.setProps({ maximized: true })
    expect(w.find('[data-testid="ia-col-center-max"]').find('.colctl__glyph--restore').exists()).toBe(true)
    expect(w.find('[data-testid="ia-col-center-max"]').attributes('title')).toBe('ia2.wm.restorePane')
  })

  it('独立窗口钮：showPopout 才渲染，emit popout', async () => {
    const w = mount(IaColumnControls, {
      props: { testid: 'ia-col-center', showMax: true, showPopout: true },
    })
    await w.find('[data-testid="ia-col-center-popout"]').trigger('click')
    expect(w.emitted('popout')).toHaveLength(1)
  })
})
