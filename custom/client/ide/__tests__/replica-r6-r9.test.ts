// 复刻批 R6-R9 守门：任务组/排队/回笼摘要/评审面板。
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
const chatState: Record<string, unknown> = {
  activeSessionId: 's1', activeSession: null, sendMessage: vi.fn(), isLoading: false,
}
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => chatState }))
// A6：IdeQueuePanel 新增 ide store（workspace 取自治队列）与 fetch（queue 端点）依赖
vi.mock('../store/ide', () => ({ useIdeStore: () => ({ workspace: null }) }))
vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, queue: [] }) })))

describe('R6 Task Groups 真实链（taskPlan 映射）', () => {
  it('会话 taskPlan 快照→组+步骤映射（completed=✓/pending=未执行徽标）', async () => {
    const { default: IdeTaskGroupsPanel } = await import('../components/IdeTaskGroupsPanel.vue')
    chatState.activeSession = {
      taskPlan: { plan_id: 'p1', run_id: 'run-abc12345', plan: [
        { id: 'st1', step: '实现支付流', status: 'completed' },
        { id: 'st2', step: '上线切流', status: 'pending' },
      ] },
    }
    const w = mount(IdeTaskGroupsPanel)
    expect(w.find('[data-testid="ide-task-groups"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-tg-pending"]').text()).toContain('上线切流')
    await w.find('[data-testid="ide-tg-head-p1"]').trigger('click')
    expect(w.text()).toContain('实现支付流')
    chatState.activeSession = null
  })
})

describe('R6 Task Groups 面板', () => {
  it('组展开/edited-files pill/未执行步骤专区（A3：假批准按钮已移除）', async () => {
    const { default: IdeTaskGroupsPanel } = await import('../components/IdeTaskGroupsPanel.vue')
    const w = mount(IdeTaskGroupsPanel, {
      props: {
        groups: [{
          groupId: 'g1', title: '支付收银台',
          editedFiles: ['src/pay.ts', 'src/checkout.vue'],
          steps: [
            { stepId: 's1', description: '实现支付流', approved: true },
            { stepId: 's2', description: '上线切流', approved: false },
          ],
        }],
      },
    })
    expect(w.find('[data-testid="ide-task-groups"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-tg-pending"]').text()).toContain('上线切流')
    await w.find('[data-testid="ide-tg-head-g1"]').trigger('click')
    expect(w.find('[data-testid="ide-tg-file-src/pay.ts"]').exists()).toBe(true)
    // A3：引擎无逐步批准语义，不再有假批准按钮
    expect(w.find('[data-testid="ide-tg-approve-s2"]').exists()).toBe(false)
    expect(w.text()).toContain('未执行')
    await w.find('[data-testid="ide-tg-file-src/pay.ts"]').trigger('click')
    expect(w.find('[data-testid="ide-tg-filestate"]').exists()).toBe(true)
  })
})

describe('A3 会话级真实待批审批（pendingApproval → respondApproval）', () => {
  it('审批卡渲染四档按钮，点击调 respondApproval；missing 显错不冒充已批', async () => {
    const { default: IdeTaskGroupsPanel } = await import('../components/IdeTaskGroupsPanel.vue')
    const respondApproval = vi.fn(() => 'submitted')
    chatState.activePendingApproval = {
      approvalId: 'ap1', command: 'git push', description: '推送远端',
      choices: ['once', 'session', 'deny'], allowPermanent: false,
    }
    chatState.respondApproval = respondApproval
    const w = mount(IdeTaskGroupsPanel)
    expect(w.find('[data-testid="ide-tg-session-approval"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-tg-session-approval"]').text()).toContain('推送远端')
    await w.find('[data-testid="ide-tg-approval-once"]').trigger('click')
    expect(respondApproval).toHaveBeenCalledWith('once')
    // missing 路径：显错不静默
    respondApproval.mockReturnValue('missing')
    await w.find('[data-testid="ide-tg-approval-deny"]').trigger('click')
    expect(w.find('[data-testid="ide-tg-approval-err"]').exists()).toBe(true)
    delete chatState.activePendingApproval
    delete chatState.respondApproval
  })

  it('无待批审批时不渲染审批卡', async () => {
    const { default: IdeTaskGroupsPanel } = await import('../components/IdeTaskGroupsPanel.vue')
    const w = mount(IdeTaskGroupsPanel, {
      props: { groups: [{ groupId: 'g1', title: 't', editedFiles: [], steps: [{ stepId: 's1', description: 'd', approved: true }] }] },
    })
    expect(w.find('[data-testid="ide-tg-session-approval"]').exists()).toBe(false)
  })
})

describe('R7 排队面板', () => {
  it('queuedMessages 渲染行；无队列不渲染；运行中让位提示', async () => {
    const { default: IdeQueuePanel } = await import('../components/IdeQueuePanel.vue')
    chatState.activeSession = { messages: [
      { id: 'm0', role: 'user', content: '先跑起来' },
      { id: 'q1', role: 'user', content: '稍后改个文案', queued: true },
      { id: 'q2', role: 'user', content: '再补个测试', queued: true },
    ] }
    chatState.isLoading = true
    const w = mount(IdeQueuePanel)
    expect(w.find('[data-testid="ide-queue-q1"]').exists()).toBe(true)
    expect(w.text()).toContain('运行中让位')
    chatState.activeSession = { messages: [{ id: 'm0', role: 'user', content: '普通' }] }
    expect(mount(IdeQueuePanel).find('[data-testid="ide-queue-panel"]').exists()).toBe(false)
    chatState.activeSession = null
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

  it('发起评审必须带 domain（服务端必填两域）+ resolve 回流 resolve 端点', async () => {
    const { default: IdeReviewPanel } = await import('../components/IdeReviewPanel.vue')
    const calls: Array<{ url: string; method: string; body?: string }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: { method?: string; body?: string }) => {
      const u = String(url)
      calls.push({ url: u, method: init?.method ?? 'GET', body: init?.body })
      if (u === '/api/review') return { ok: true, status: 200, json: async () => ({ ok: true, review: { reviewId: 'r1', domain: 'uncommitted' } }) }
      return { ok: true, status: 200, json: async () => ({ ok: true, review: { reviewId: 'r1', comments: [] } }) }
    }))
    try {
      const w = mount(IdeReviewPanel)
      await w.find('[data-testid="ide-review-start"]').trigger('click')
      await w.vm.$nextTick()
      const post = calls.find((c) => c.url === '/api/review' && c.method === 'POST')
      expect(post).toBeTruthy()
      expect(JSON.parse(post!.body ?? '{}')).toMatchObject({ domain: 'uncommitted' })
      const vm = w.vm as unknown as { reviewId: string | null; findings: Array<Record<string, unknown>> }
      expect(vm.reviewId?.startsWith('ide-s1-')).toBe(true)
      // resolve 回流：本地置 resolved 后 POST resolve 端点
      vm.findings = [{ id: 'f1', domain: 'uncommitted', severity: 'high', text: 'x', resolved: false }]
      await w.vm.$nextTick()
      await w.find('[data-testid="ide-review-resolve-f1"]').trigger('click')
      await w.vm.$nextTick()
      const resolveCall = calls.find((c) => c.url === `/api/review/${vm.reviewId}/comments/f1/resolve`)
      expect(resolveCall?.method).toBe('POST')
      expect(w.find('[data-testid="ide-review-f1"]').exists()).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('resolve 回流失败如实回退（服务端仍 open，不得假 resolved）', async () => {
    const { default: IdeReviewPanel } = await import('../components/IdeReviewPanel.vue')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ ok: false, detail: 'boom' }) })))
    try {
      const w = mount(IdeReviewPanel)
      const vm = w.vm as unknown as { reviewId: string | null; findings: Array<Record<string, unknown>> }
      vm.reviewId = 'r1'
      vm.findings = [{ id: 'f1', domain: 'uncommitted', severity: 'high', text: 'x', resolved: false }]
      await w.vm.$nextTick()
      await w.find('[data-testid="ide-review-resolve-f1"]').trigger('click')
      await w.vm.$nextTick()
      expect(w.find('[data-testid="ide-review-f1"]').exists()).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
