// 复刻批 R6-R9 守门：任务组/排队/回笼摘要/评审面板。
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
const chatState: Record<string, unknown> = {
  activeSessionId: 's1', activeSession: null, sendMessage: vi.fn(), isLoading: false,
}
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => chatState }))

describe('R6 Task Groups 面板', () => {
  it('组展开/edited-files pill/待批步骤专区/批准动作', async () => {
    const { default: IdeTaskGroupsPanel } = await import('../components/IdeTaskGroupsPanel.vue')
    const w = mount(IdeTaskGroupsPanel, {
      props: {
        groups: [{
          groupId: 'g1', title: '支付收银台',
          editedFiles: ['src/pay.ts', 'src/checkout.vue'],
          steps: [
            { stepId: 's1', description: '实现支付流', needsApproval: false, approved: true },
            { stepId: 's2', description: '上线切流', needsApproval: true, approved: false },
          ],
        }],
      },
    })
    expect(w.find('[data-testid="ide-task-groups"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-tg-pending"]').text()).toContain('上线切流')
    await w.find('[data-testid="ide-tg-head-g1"]').trigger('click')
    expect(w.find('[data-testid="ide-tg-file-src/pay.ts"]').exists()).toBe(true)
    await w.find('[data-testid="ide-tg-approve-s2"]').trigger('click')
    expect((w.emitted('approve') ?? []).at(0)).toEqual(['g1', 's2', true])
    await w.find('[data-testid="ide-tg-file-src/pay.ts"]').trigger('click')
    expect(w.find('[data-testid="ide-tg-filestate"]').exists()).toBe(true)
  })
})

describe('R7 排队面板', () => {
  it('queuedMessages 渲染行；无队列不渲染；运行中让位提示', async () => {
    const { default: IdeQueuePanel } = await import('../components/IdeQueuePanel.vue')
    chatState.queuedMessages = [{ id: 'q1', content: '稍后改个文案' }, { id: 'q2', content: '再补个测试' }]
    chatState.isLoading = true
    const w = mount(IdeQueuePanel)
    expect(w.find('[data-testid="ide-queue-q1"]').exists()).toBe(true)
    expect(w.text()).toContain('运行中让位')
    chatState.queuedMessages = []
    expect(mount(IdeQueuePanel).find('[data-testid="ide-queue-panel"]').exists()).toBe(false)
  })
})

describe('R8 回笼摘要卡', () => {
  it('display_kind=recap 消息→渲染；无 recap 不渲染', async () => {
    const { default: IdeRecapCard } = await import('../components/IdeRecapCard.vue')
    chatState.activeSession = { messages: [{ role: 'assistant', content: '你走后修了登录 bug', display_kind: 'recap' }] }
    const w = mount(IdeRecapCard)
    expect(w.find('[data-testid="ide-recap-card"]').text()).toContain('修了登录 bug')
    chatState.activeSession = { messages: [{ role: 'assistant', content: '普通回复' }] }
    expect(mount(IdeRecapCard).find('[data-testid="ide-recap-card"]').exists()).toBe(false)
    chatState.activeSession = null
  })
})

describe('R9 评审面板', () => {
  it('findings open/resolved 双区+resolve 动作+三裁决一次定音发消息', async () => {
    const { default: IdeReviewPanel } = await import('../components/IdeReviewPanel.vue')
    const w = mount(IdeReviewPanel)
    const vm = w.vm as unknown as { findings: Array<Record<string, unknown>> }
    vm.findings = [
      { id: 'f1', domain: 'uncommitted', severity: 'high', text: '金额单位换算缺校验', resolved: false },
      { id: 'f2', domain: 'baseline', severity: 'low', text: '日志文案可读性', resolved: true },
    ]
    await w.vm.$nextTick()
    expect(w.find('[data-testid="ide-review-f1"]').exists()).toBe(true)
    expect(w.find('.is-resolved').exists()).toBe(true)
    await w.find('[data-testid="ide-review-resolve-f1"]').trigger('click')
    await w.vm.$nextTick()
    expect(w.find('[data-testid="ide-review-f1"]').exists()).toBe(false)
    await w.find('[data-testid="ide-review-verdict-accept"]').trigger('click')
    expect(w.find('[data-testid="ide-review-verdict-accept"]').classes()).toContain('is-active')
    expect(chatState.sendMessage).toHaveBeenCalled()
  })
})
