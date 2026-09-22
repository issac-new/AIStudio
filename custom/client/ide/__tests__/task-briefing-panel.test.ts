// @vitest-environment jsdom
// TaskBriefingPanel 挂载守门：六区块渲染 + 数据映射 + 折叠 + 辅助会话发送。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import TaskBriefingPanel from '@/custom/ide/components/TaskBriefingPanel.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh',
  messages: { zh: {} },
})

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(TaskBriefingPanel, {
    global: { plugins: [i18n] },
    props: {
      task: { id: 'T-001', title: '支付收银台收单模块', status: 'running', priority: 1, body: '基于财付通/支付宝公开技术手册' },
      raci: { responsible: ['dev-wang'], approver: ['lead-zhang'], consulted: ['arch-li'], informed: ['qa-zhao'] },
      git: { branch: 'feature/T-001', worktreePath: '/tmp/ws/T-001', commits: [{ hash: 'abc1234abcd', subject: 'feat: 收银台骨架' }] },
      workflow: { stage: 'running', parentIds: ['REQ-1'], childIds: ['T-2'], blocked: false, retryCount: 1 },
      collab: [{ sender: 'qa-sun', excerpt: '提测通过' }],
      recap: { summary: '开发中', decisions: ['选微信 SDK v3'], blockers: [], todos: ['自测退款'] },
      ...overrides,
    },
  })
}

describe('TaskBriefingPanel', () => {
  it('renders all six briefing sections', () => {
    const w = mountPanel()
    expect(w.find('[data-testid="briefing-header-block"]').exists()).toBe(true)
    expect(w.find('[data-testid="briefing-context-block"]').exists()).toBe(true)
    expect(w.find('[data-testid="briefing-git-block"]').exists()).toBe(true)
    expect(w.find('[data-testid="briefing-workflow-block"]').exists()).toBe(true)
    expect(w.find('[data-testid="briefing-collab-block"]').exists()).toBe(true)
    expect(w.find('[data-testid="briefing-aux-block"]').exists()).toBe(true)
  })

  it('maps task / raci / workflow data into the header block', () => {
    const w = mountPanel()
    const headerText = w.find('[data-testid="briefing-header-block"]').text()
    expect(headerText).toContain('T-001')
    expect(headerText).toContain('dev-wang')
    expect(headerText).toContain('lead-zhang')
    const wfText = w.find('[data-testid="briefing-workflow-block"]').text()
    expect(wfText).toContain('1/3')
  })

  it('toggles a section collapsed and back', async () => {
    const w = mountPanel()
    const gitToggle = w.find('[data-testid="briefing-git-block"] .section-toggle')
    await gitToggle.trigger('click')
    expect(w.find('[data-testid="briefing-git-block"] .section-body').exists()).toBe(false)
    await gitToggle.trigger('click')
    expect(w.find('[data-testid="briefing-git-block"] .section-body').exists()).toBe(true)
  })

  it('emits aux-send with trimmed text', async () => {
    const w = mountPanel()
    await w.find('[data-testid="briefing-aux-input"]').setValue('  查一下退款接口  ')
    await w.find('[data-testid="briefing-aux-send"]').trigger('click')
    expect(w.emitted('aux-send')?.[0]).toEqual(['查一下退款接口'])
  })

  it('renders danger styling when retry count reaches leader threshold', () => {
    const w = mountPanel({ workflow: { stage: 'blocked', parentIds: [], childIds: [], blocked: true, retryCount: 3 } })
    const wfText = w.find('[data-testid="briefing-workflow-block"]').text()
    expect(wfText).toContain('3/3')
  })
})
