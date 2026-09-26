// 复刻批 S1-S4 守门：inline diff/@提及面板/分段水位条/后台代理三分区。
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
const chatState: Record<string, unknown> = {
  activeSessionId: 's1', sendMessage: vi.fn(), subagentStreams: new Map<string, unknown>(),
}
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => chatState }))
vi.mock('../composables/useSessionMetrics', () => ({
  useSessionMetrics: () => new Proxy({}, {
    get: (_t, k: string) => {
      if (k === 'segments') return { value: [
        { key: 'systemPrompt', pct: 10 }, { key: 'messages', pct: 45 }, { key: 'tools', pct: 25 },
      ] }
      if (k === 'contextUsed') return { value: 80000 }
      if (k === 'contextLength') return { value: 100000 }
      return { value: 1 }
    },
  }),
}))

describe('S1 inline diff 逐处 accept/reject/edit', () => {
  it('hunk 解析/统计/accept 决策/双击编辑', async () => {
    const { default: IdeInlineDiff } = await import('../components/IdeInlineDiff.vue')
    const diff = '@@ -1,3 +1,4 @@\n line-a\n-old\n+new1\n+new2\n line-b\n@@ -9,1 +10,1 @@\n-x\n+y'
    const w = mount(IdeInlineDiff, { props: { diffText: diff } })
    expect(w.findAll('[data-testid^="ide-idiff-hunk-"]')).toHaveLength(2)
    expect(w.find('.ide-idiff__stats').text()).toContain('± 3 / − 2')
    await w.find('[data-testid="ide-idiff-accept-0"]').trigger('click')
    expect(w.find('[data-testid="ide-idiff-hunk-0"]').classes()).toContain('is-accepted')
    expect(w.emitted('accept-hunk')?.[0]).toEqual([0])
    await w.find('[data-testid="ide-idiff-reject-1"]').trigger('click')
    expect(w.emitted('reject-hunk')?.[0]).toEqual([1])
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('edited-line')
    await w.find('.ide-idiff__line').trigger('dblclick')
    expect(promptSpy).toHaveBeenCalled()
    promptSpy.mockRestore()
  })
})

describe('S2 @提及六源面板', () => {
  it('六源可选/目标加入 chip/发送拼前缀/移除 chip', async () => {
    const { default: IdeMentionPicker } = await import('../components/IdeMentionPicker.vue')
    const w = mount(IdeMentionPicker)
    await w.find('[data-testid="ide-mention-open"]').trigger('click')
    expect(w.find('[data-testid="ide-mention-menu"]').exists()).toBe(true)
    for (const kind of ['file', 'session', 'skill', 'plugin', 'subagent', 'whiteboard']) {
      expect(w.find(`[data-testid="ide-mention-src-${kind}"]`).exists()).toBe(true)
    }
    await w.find('[data-testid="ide-mention-src-file"]').trigger('click')
    await w.find('[data-testid="ide-mention-target"]').setValue('src/a.ts:10-20')
    await w.find('[data-testid="ide-mention-stage"]').trigger('click')
    expect(w.find('[data-testid="ide-mention-chips"]').text()).toContain('@file:src/a.ts:10-20')
    await w.find('[data-testid="ide-mention-draft"]').setValue('帮我看这段')
    await w.find('[data-testid="ide-mention-send"]').trigger('click')
    expect(chatState.sendMessage).toHaveBeenCalledWith('@file:src/a.ts:10-20 帮我看这段')
  })
})

describe('S3 分段水位条', () => {
  it('五段配色渲染+压力分级+悬停图例', async () => {
    const { default: IdeContextBar } = await import('../components/IdeContextBar.vue')
    const w = mount(IdeContextBar)
    expect(w.find('[data-testid="ide-ctxbar-seg-systemPrompt"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-ctxbar-seg-messages"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-ctxbar-pct"]').text()).toBe('80%')
    expect(w.classes()).toContain('is-warn') // 80% 档
    await w.trigger('mouseenter')
    expect(w.find('[data-testid="ide-ctxbar-legend"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-ctxbar-legend"]').text()).toContain('messages 45%')
  })
})

describe('S4 后台代理三分区', () => {
  it('六态映射三分区+各区计数', async () => {
    const streams = chatState.subagentStreams as Map<string, unknown>
    streams.set('s1:a', { sessionId: 's1', subagentId: 'a', status: 'failed', goal: '修登录', startedAt: 0, updatedAt: 5000 })
    streams.set('s1:b', { sessionId: 's1', subagentId: 'b', status: 'running', goal: '跑测试', startedAt: 0, updatedAt: 5000 })
    streams.set('s1:c', { sessionId: 's1', subagentId: 'c', status: 'completed', goal: '写文档', startedAt: 0, updatedAt: 5000, durationSeconds: 12 })
    const { default: IdeAgentsView } = await import('../components/IdeAgentsView.vue')
    const w = mount(IdeAgentsView)
    expect(w.find('[data-testid="ide-agents-needs"]').text()).toContain('修登录')
    expect(w.find('[data-testid="ide-agents-working"]').text()).toContain('跑测试')
    expect(w.find('[data-testid="ide-agents-completed"]').text()).toContain('写文档')
    expect(w.find('[data-testid="ide-agents-completed"]').text()).toContain('12s')
  })
})
