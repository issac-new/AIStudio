// overlay/custom/client/ide/__tests__/briefing-context-files.test.ts
// P3.2/P3.3 守门（2026-09-28 产品 UI 缺陷修复 §四）：简报面板上下文文件列表
// 渲染 + 归类徽标 + open-file 事件（一键打开接线在 IdeShell → filesStore.openEditor）。
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TaskBriefingPanel from '../components/TaskBriefingPanel.vue'
import type { BriefingTask, BriefingContextFile } from '../components/briefing-types'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const task: BriefingTask = { id: 't_1', title: '支付渠道接入', status: 'review' }
const files: BriefingContextFile[] = [
  { path: 'docs/需求-支付渠道.md', kind: 'req', title: '支付渠道需求' },
  { path: 'docs/概设-网关.md', kind: 'design' },
  { path: 'plan.md', kind: 'schedule' },
]

describe('TaskBriefingPanel 上下文文件（P3.2/P3.3）', () => {
  it('文件列表渲染：三类徽标 + 文件名（title 优先）', () => {
    const wrap = mount(TaskBriefingPanel, { props: { task, contextFiles: files } })
    const list = wrap.find('[data-testid="briefing-context-files"]')
    expect(list.exists()).toBe(true)
    const items = wrap.findAll('[data-testid="briefing-open-file"]')
    expect(items).toHaveLength(3)
    expect(items[0].text()).toContain('支付渠道需求')
    expect(items[0].find('.ctx-file__kind--req').exists()).toBe(true)
    expect(items[1].find('.ctx-file__kind--design').exists()).toBe(true)
    expect(items[2].find('.ctx-file__kind--schedule').exists()).toBe(true)
  })

  it('点击文件 → open-file 事件携路径（一键打开）', async () => {
    const wrap = mount(TaskBriefingPanel, { props: { task, contextFiles: files } })
    await wrap.findAll('[data-testid="briefing-open-file"]')[1].trigger('click')
    expect(wrap.emitted('open-file')?.[0]).toEqual(['docs/概设-网关.md'])
  })

  it('无列表不渲染文件区；面板本体不受影响', () => {
    const wrap = mount(TaskBriefingPanel, { props: { task } })
    expect(wrap.find('[data-testid="briefing-context-files"]').exists()).toBe(false)
    expect(wrap.find('[data-testid="task-briefing-panel"]').exists()).toBe(true)
  })
})
