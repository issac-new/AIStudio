// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/ia-column-controls.test.ts
// 栏控簇守门（2026-09-20 栏控迁三栏顶部控制条；2026-10-23 四轮）：
// 单一切换钮——同一方框图标按状态换样式（常态完整方框=独占、独占态外扩
// 双框=还原）；独立窗口 ⧉ 可选；不再有独立最小化钮（min 已并入切换）。
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import IaColumnControls from '../components/IaColumnControls.vue'

describe('IaColumnControls — 栏控簇（单钮切换·同形方框图标）', () => {
  it('默认仅一个切换钮（无独立 min 钮）：常态完整方框（--max）/maxPane，emit max', async () => {
    const w = mount(IaColumnControls, { props: { testid: 'ia-col-left' } })
    const max = w.find('[data-testid="ia-col-left-max"]')
    expect(max.exists()).toBe(true)
    expect(max.find('.colctl__glyph--max').exists()).toBe(true)
    expect(max.attributes('title')).toBe('ia2.wm.maxPane')
    expect(w.find('[data-testid="ia-col-left-min"]').exists()).toBe(false)
    await max.trigger('click')
    expect(w.emitted('max')).toHaveLength(1)
  })

  it('独占态同钮换双框样式（--restore）/restorePane；再点仍 emit max（宿主 toggle 语义）', async () => {
    const w = mount(IaColumnControls, {
      props: { testid: 'ia-col-center', maximized: true },
    })
    const max = w.find('[data-testid="ia-col-center-max"]')
    expect(max.find('.colctl__glyph--restore').exists()).toBe(true)
    expect(max.attributes('title')).toBe('ia2.wm.restorePane')
    await max.trigger('click')
    expect(w.emitted('max')).toHaveLength(1)
  })

  it('独立窗口钮：showPopout 才渲染，emit popout', async () => {
    const w = mount(IaColumnControls, {
      props: { testid: 'ia-col-center', showPopout: true },
    })
    await w.find('[data-testid="ia-col-center-popout"]').trigger('click')
    expect(w.emitted('popout')).toHaveLength(1)
  })
})
