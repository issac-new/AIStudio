// overlay/custom/client/kanban/components/__tests__/kanban-markdown.test.ts
// 治理工件 markdown 渲染守门（视觉审计台账 2026-09-29 第 4 条根治）：
// 表格（|---| 不再裸管道）/引用块（> 不再裸显）/加粗/围栏代码/转义优先。
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import KanbanMarkdown from '../KanbanMarkdown.vue'

const md = [
  '# G1 冻结件',
  '',
  '| AC | 判词 | 锚 |',
  '| --- | --- | --- |',
  '| AC-1 | 通过 | 3aa1b8d |',
  '| AC-2 | 有条件 | 5c1a02d |',
  '',
  '> 独立审计意见：**有保留（待整改）**',
  '> 第二行引用',
  '',
  '普通段 `code` 与 **加粗**。',
  '```ts',
  'const x = 1 < 2',
  '```',
].join('\n')

describe('KanbanMarkdown 渲染（治理工件）', () => {
  it('表格渲染为 table/thead/tbody，无裸 |---| 分隔行', () => {
    const w = mount(KanbanMarkdown, { props: { source: md } })
    const html = w.html()
    expect(html).toContain('kanban-md-table')
    expect(w.findAll('thead th').map((t) => t.text())).toEqual(['AC', '判词', '锚'])
    expect(w.findAll('tbody tr')).toHaveLength(2)
    expect(w.findAll('tbody tr')[1].findAll('td')[1].text()).toBe('有条件')
    expect(html).not.toContain('| --- |')
  })

  it('连续 > 行合并为 blockquote，不裸显 &gt;，加粗生效', () => {
    const w = mount(KanbanMarkdown, { props: { source: md } })
    const bq = w.find('blockquote')
    expect(bq.exists()).toBe(true)
    expect(bq.text()).toContain('独立审计意见：')
    expect(bq.text()).toContain('第二行引用')
    expect(bq.find('strong').text()).toBe('有保留（待整改）')
    expect(w.text()).not.toContain('&gt;')
  })

  it('围栏代码转义优先（< 不被当标签），行内 code 渲染', () => {
    const w = mount(KanbanMarkdown, { props: { source: md } })
    expect(w.find('pre.kanban-md-code').text()).toContain('const x = 1 < 2')
    expect(w.html()).toContain('<code>code</code>')
  })
})
