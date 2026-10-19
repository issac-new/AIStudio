// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/attention-strip.test.ts
// v12.4 注意力条守门（2026-09-20 用户裁定）：标签改「swarm kanban」双击进
// 看板总览（emit open-board，与原 AI协作中心页面同动线）；右侧 ⚙管理按钮
// 退役（管理台入口收敛到左栏 FlowNavPanel）；条目点击 select 保留；空态条
// 与标签常驻。
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'fs'
import { resolve } from 'path'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import AttentionStrip from '../components/AttentionStrip.vue'
import type { AttentionRow } from '../adapters/overview'

const ROW: AttentionRow = {
  id: 'att-t1', taskId: 't1', title: '等外部凭据',
  status: 'blocked', severity: 'high', priority: 1, createdAt: 1,
}

describe('AttentionStrip — swarm kanban 标签（v12.4）', () => {
  it('标签=swarm kanban，双击 emit open-board；右侧 ⚙管理退役；条目 select 保留', async () => {
    const wrapper = mount(AttentionStrip, { props: { items: [ROW] } })
    const label = wrapper.find('[data-testid="ia-attn-label"]')
    expect(label.exists()).toBe(true)
    expect(label.text()).toBe('ia2.overview.swarmKanbanLabel')
    await label.trigger('dblclick')
    expect(wrapper.emitted('open-board')).toHaveLength(1)
    expect(wrapper.find('[data-testid="ia-attn-gov"]').exists()).toBe(false)
    await wrapper.find('.ia-attn__item').trigger('click')
    expect(wrapper.emitted('select')).toHaveLength(1)
    wrapper.unmount()
  })

  it('空态：条与标签常驻（管理入口退役后不再依赖 ⚙ 常驻）', () => {
    const empty = mount(AttentionStrip, { props: { items: [] } })
    expect(empty.find('[data-testid="ia-attn-label"]').exists()).toBe(true)
    expect(empty.text()).toContain('ia2.overview.attentionEmpty')
    empty.unmount()
  })

  it('chip 整体限宽 160px（1280 视口 ~7 个；tier 补 ellipsis 上限）', () => {
    // 2026-09-23 走查观察项：~305px chip 在 1280 视口只放 3-4 个。
    // 守门断言 ia2.scss（chip 样式单一事实源），漂移即 fail。
    const scss = readFileSync(resolve(__dirname, '../styles/ia2.scss'), 'utf8')
    const itemBlock = scss.slice(scss.indexOf('.ia-attn__item {'), scss.indexOf('.ia-attn__bar {'))
    expect(itemBlock).toContain('max-width: 160px')
    const tierBlock = scss.slice(scss.indexOf('.ia-attn__tier {'), scss.indexOf('.ia-attn__text {'))
    expect(tierBlock).toContain('text-overflow: ellipsis')
    expect(tierBlock).toContain('max-width: 56px')
  })
})

describe('AttentionStrip — 降噪（2026-10-19 P1 批）', () => {
  const rows: AttentionRow[] = Array.from({ length: 6 }, (_, i) => ({
    id: `att-t${i}`, taskId: `t${i}`, title: `任务 ${i}`,
    status: i < 4 ? 'blocked' : 'review', severity: 'high', priority: i + 1, createdAt: 1,
  }))

  it('超过 3 条：行内只留前 3 条 + 计数入口；不把全部 chip 堆在首屏', () => {
    const w = mount(AttentionStrip, { props: { items: rows } })
    expect(w.findAll('.ia-attn__items .ia-attn__item')).toHaveLength(3)
    const summary = w.find('[data-testid="ia-attn-summary"]')
    expect(summary.exists()).toBe(true)
    expect(summary.text()).toContain('6')
    expect(w.find('[data-testid="ia-attn-panel"]').exists()).toBe(false)
    w.unmount()
  })

  it('点计数入口开抽屉：按梯队分组、列出全部条目；行点击 emit select 且收起', async () => {
    const w = mount(AttentionStrip, { props: { items: rows } })
    await w.find('[data-testid="ia-attn-summary"]').trigger('click')
    const panel = w.find('[data-testid="ia-attn-panel"]')
    expect(panel.exists()).toBe(true)
    expect(w.find('[data-testid="ia-attn-group-blocked"]').text()).toContain('4')
    expect(w.find('[data-testid="ia-attn-group-review"]').text()).toContain('2')
    expect(w.findAll('[data-testid^="ia-attn-row-"]')).toHaveLength(6)
    await w.find('[data-testid="ia-attn-row-att-t4"]').trigger('click')
    expect(w.emitted('select')).toHaveLength(1)
    expect(w.find('[data-testid="ia-attn-panel"]').exists()).toBe(false)
    w.unmount()
  })

  it('抽屉底部「打开看板」emit open-board 并收起', async () => {
    const w = mount(AttentionStrip, { props: { items: rows } })
    await w.find('[data-testid="ia-attn-summary"]').trigger('click')
    await w.find('[data-testid="ia-attn-panel-board"]').trigger('click')
    expect(w.emitted('open-board')).toHaveLength(1)
    expect(w.find('[data-testid="ia-attn-panel"]').exists()).toBe(false)
    w.unmount()
  })

  it('不超过 3 条：全量行内展示，计数入口仍在（显示总数）', () => {
    const w = mount(AttentionStrip, { props: { items: rows.slice(0, 2) } })
    expect(w.findAll('.ia-attn__items .ia-attn__item')).toHaveLength(2)
    expect(w.find('[data-testid="ia-attn-summary"]').text()).toContain('2')
    w.unmount()
  })

  it('守门：ia2.scss 保留单行纪律（chip 限宽 + 条本体定位锚）', () => {
    const scss = readFileSync(resolve(__dirname, '../styles/ia2.scss'), 'utf8')
    const attnBlock = scss.slice(scss.indexOf('.ia-attn {'), scss.indexOf('.ia-attn__label'))
    expect(attnBlock).toContain('position: relative')
  })
})
