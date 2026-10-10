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

describe('AttentionStrip — 自适应限量显示（2026-10-10 根治轮）', () => {
  // jsdom 无布局：stub offsetWidth/clientWidth 让测量行/容器有确定宽度。
  function stubLayout(offsets: number, client: number): () => void {
    const off = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
    const cli = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => offsets })
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => client })
    return () => {
      if (off) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', off)
      if (cli) Object.defineProperty(HTMLElement.prototype, 'clientWidth', cli)
    }
  }

  const rows: AttentionRow[] = Array.from({ length: 6 }, (_, i) => ({
    id: `att-t${i}`, taskId: `t${i}`, title: `任务 ${i}`,
    status: i < 4 ? 'blocked' : 'review', severity: 'high', priority: i + 1, createdAt: 1,
  }))

  it('放得下 → 全量渲染，无 +N chip；测量行 aria-hidden 存在', async () => {
    const restore = stubLayout(100, 2000)
    try {
      const w = mount(AttentionStrip, { props: { items: rows } })
      await new Promise(r => setTimeout(r, 0))
      expect(w.findAll('.ia-attn__items .ia-attn__item:not(.ia-attn__more)')).toHaveLength(6)
      expect(w.find('[data-testid="ia-attn-more"]').exists()).toBe(false)
      expect(w.find('.ia-attn__measure').attributes('aria-hidden')).toBe('true')
      w.unmount()
    } finally { restore() }
  })

  it('放不下 → 前缀切片 + 「+N」chip（计数正确、点击 emit open-board、悬浮含梯队摘要）', async () => {
    // 每个 chip 100px、容器 300：预算 300-56-6=238 → 可见 2、+4
    const restore = stubLayout(100, 300)
    try {
      const w = mount(AttentionStrip, { props: { items: rows } })
      await new Promise(r => setTimeout(r, 0))
      const visible = w.findAll('.ia-attn__items .ia-attn__item:not(.ia-attn__more)')
      expect(visible).toHaveLength(2)
      const more = w.find('[data-testid="ia-attn-more"]')
      expect(more.text()).toBe('+4')
      expect(more.attributes('title')).toContain('ia2.overview.tierBlocked 2')
      await more.trigger('click')
      expect(w.emitted('open-board')).toHaveLength(1)
      w.unmount()
    } finally { restore() }
  })

  it('量不到宽度（jsdom 缺省 0）→ 兜底全显示，不出 +N', async () => {
    const w = mount(AttentionStrip, { props: { items: rows } })
    await new Promise(r => setTimeout(r, 0))
    expect(w.findAll('.ia-attn__items .ia-attn__item:not(.ia-attn__more)')).toHaveLength(6)
    expect(w.find('[data-testid="ia-attn-more"]').exists()).toBe(false)
    w.unmount()
  })

  it('守门：ia2.scss 保留单行纪律与 +N chip 样式（根治轮锚）', () => {
    const scss = readFileSync(resolve(__dirname, '../styles/ia2.scss'), 'utf8')
    expect(scss).toContain('.ia-attn__more')
    // 测量行锚定：条本体须为定位上下文
    const attnBlock = scss.slice(scss.indexOf('.ia-attn {'), scss.indexOf('.ia-attn__label'))
    expect(attnBlock).toContain('position: relative')
  })
})
