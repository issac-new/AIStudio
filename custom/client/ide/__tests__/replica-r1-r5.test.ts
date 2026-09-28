// 复刻批 R1-R5 守门：恢复对话框/权限七档/问卷卡/mention chip/执行日志。
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
const chatState = { activeSessionId: 's1', activeSession: null as unknown, sendMessage: vi.fn() }
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => chatState,
}))
vi.mock('../store/ide', () => ({ useIdeStore: () => ({ workspace: '/w' }) }))

describe('R2 权限七档切换器', () => {
  it('默认标准档；点开面板七档可选；选中持久化', async () => {
    const { default: IdePermissionSwitcher } = await import('../components/IdePermissionSwitcher.vue')
    localStorage.clear()
    const w = mount(IdePermissionSwitcher)
    expect(w.find('[data-testid="ide-perm-trigger"]').text()).toContain('标准')
    await w.find('[data-testid="ide-perm-trigger"]').trigger('click')
    for (const key of ['readonly', 'plan', 'default', 'acceptEdits', 'dontAsk', 'auto', 'bypassPermissions']) {
      expect(w.find(`[data-testid="ide-perm-${key}"]`).exists()).toBe(true)
    }
    await w.find('[data-testid="ide-perm-bypassPermissions"]').trigger('click')
    expect(w.find('[data-testid="ide-perm-trigger"]').text()).toContain('绕过')
    expect(localStorage.getItem('ide-permission-mode:s1')).toBe('bypassPermissions')
  })
})

describe('R3 ask_user 问卷卡', () => {
  it('display_metadata 带问卷→渲染步骤/选项/recommended/提交门槛', async () => {
    const { default: IdeAskCard } = await import('../components/IdeAskCard.vue')
    const chat = chatState
    chat.activeSession = {
      messages: [
        { role: 'assistant', content: '', display_metadata: { ask: { steps: [
          { question: '部署到哪？', options: [{ label: 'staging', recommended: true }, { label: 'prod' }] },
          { question: '何时？', options: [{ label: '现在' }, { label: '今晚' }], multi: true },
        ] } } },
      ],
    }
    const w = mount(IdeAskCard)
    expect(w.find('[data-testid="ide-ask-q-0"]').text()).toBe('部署到哪？')
    expect(w.find('[data-testid="ide-ask-submit"]').attributes('disabled')).toBeDefined()
    await w.find('[data-testid="ide-ask-opt-0-0"]').trigger('click')
    await w.find('[data-testid="ide-ask-opt-1-1"]').trigger('click')
    expect(w.find('[data-testid="ide-ask-submit"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-testid="ide-ask-opt-0-0"]').classes()).toContain('is-selected')
    expect(w.find('[data-testid="ide-ask-opt-0-0"]').classes()).toContain('is-recommended')
    chat.activeSession = null
  })
})

describe('R4 mention 结果 chip', () => {
  it('outcome 环渲染 chip；trouble reason 标红', async () => {
    const projection = await import('../../zcode/store/zcode-projection')
    const st = (projection as unknown as { default: never })
    void st
    // store 是 composable——直接驱动 handler 路径
    const { handleZcodeEvent, useZcodeProjection } = projection
    handleZcodeEvent({ type: 'mention.outcome', workspaceId: '/w', target: 'zcode', reason: 'runtime_offline', detail: '引擎没起', at: 1 } as never)
    handleZcodeEvent({ type: 'mention.outcome', workspaceId: '/w', target: 'core', reason: 'queued', at: 2 } as never)
    const state = useZcodeProjection().state
    expect(state.mentionOutcomes).toHaveLength(2)
    const { default: IdeMentionChip } = await import('../components/IdeMentionChip.vue')
    const w = mount(IdeMentionChip)
    expect(w.find('[data-testid="ide-mention-chip-runtime_offline"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-mention-chip-runtime_offline"]').classes()).toContain('is-trouble')
    expect(w.text()).toContain('引擎离线未跑')
    expect(w.find('[data-testid="ide-mention-chip-queued"]').classes()).not.toContain('is-trouble')
    state.mentionOutcomes = []
  })
})

describe('R5 执行日志区', () => {
  it('每 run 一行（文件±/耗时/费用）+历史折叠切换', async () => {
    vi.resetModules()
    vi.doMock('@/stores/hermes/chat', () => ({
      useChatStore: () => ({ activeSessionId: 's1', activeSession: null }),
    }))
    vi.doMock('../api/runs', () => ({
      ideRunsApi: { changes: vi.fn(async () => [
        { run_id: 'run-2', change_id: 'c2', files_changed: 2, additions: 30, deletions: 3, started_at: 10, finished_at: 12, model: 'glm-5.3', input_tokens: 100, output_tokens: 50, cache_read_tokens: 0, cache_write_tokens: 0 },
        { run_id: 'run-1', change_id: 'c1', files_changed: 1, additions: 5, deletions: 0, started_at: 0, finished_at: 2, model: 'glm-5.3', input_tokens: 10, output_tokens: 5, cache_read_tokens: 0, cache_write_tokens: 0 },
      ]) },
    }))
    const { default: IdeRunLogPanel } = await import('../components/IdeRunLogPanel.vue')
    const w = mount(IdeRunLogPanel)
    await new Promise((r) => setTimeout(r, 10))
    await w.vm.$nextTick()
    expect(w.find('[data-testid="ide-runlog-panel"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-runlog-run-2"]').exists()).toBe(true)
    expect(w.text()).toContain('2 文件 +30 −3')
    expect(w.text()).toContain('2s')
    await w.find('[data-testid="ide-runlog-toggle"]').trigger('click')
    expect(w.find('[data-testid="ide-runlog-run-1"]').exists()).toBe(true)
  })
})
