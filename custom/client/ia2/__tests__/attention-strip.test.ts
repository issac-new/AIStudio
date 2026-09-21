// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/attention-strip.test.ts
// v12.4 注意力条守门（2026-09-20 用户裁定）：标签改「swarm kanban」双击进
// 看板总览（emit open-board，与原 AI协作中心页面同动线）；右侧 ⚙管理按钮
// 退役（管理台入口收敛到左栏 FlowNavPanel）；条目点击 select 保留；空态条
// 与标签常驻。
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

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
})
