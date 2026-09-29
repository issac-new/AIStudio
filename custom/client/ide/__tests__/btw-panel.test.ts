// B2 守门：/btw 侧问（旁路会话真实链）。
// @vitest-environment jsdom
// 契约：askBtw 顺序=newChat（首次）→switch(btw)→send→switch(回主会话)；
// refreshBtw 投影 user/assistant 成交换对；旁注文本=域模块 mergeBtwNote；
// 失败写 error 且尽力切回主会话。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
// 浮窗挂载需 pinia 替身（面板仅读 activeSessionId/title；store 逻辑直测在上组）
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({ activeSessionId: 's1', activeSession: { title: '主任务' } }),
}))
vi.mock('../store/ide', () => ({ useIdeStore: () => ({ workspace: '/w', agentId: 'zcode' }) }))
vi.mock('@/api/studio/sessions', () => ({ fetchSessionMessagesPage: vi.fn(async () => ({ messages: [] })) }))

import { askBtw, refreshBtw, btwNoteText, btwSessionOf, btwStateView, __resetBtwForTest, type BtwDeps } from '../store/btw'

function mkDeps(over: Partial<BtwDeps> = {}): BtwDeps & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    newChat: vi.fn(async () => { calls.push('newChat'); stateProbe.active = 'btw-new' }),
    switchSession: vi.fn(async (id: string) => { calls.push(`switch:${id}`); stateProbe.active = id }),
    sendMessage: vi.fn(async () => { calls.push(`send:${stateProbe.active}`) }),
    fetchMessages: vi.fn(async () => [
      { role: 'user', content: '边界条件？', createdAt: 1 },
      { role: 'assistant', content: '空数组已守', createdAt: 2 },
    ]),
    activeSessionId: () => stateProbe.active,
    mainTitle: () => '主任务',
    ...over,
  }
}
const stateProbe = reactive({ active: 'main-1' as string | null })

describe('B2 btw store（旁路会话真链）', () => {
  beforeEach(() => {
    __resetBtwForTest()
    stateProbe.active = 'main-1'
  })

  it('首次提问：建侧问会话→切换→发送→切回主会话（顺序钉死）', async () => {
    const deps = mkDeps()
    const ok = await askBtw(deps, '边界条件？', { agent: 'zcode' })
    expect(ok).toBe(true)
    expect(deps.calls).toEqual(['newChat', 'switch:btw-new', 'send:btw-new', 'switch:main-1'])
    expect(btwSessionOf('main-1')).toBe('btw-new')
    // exchanges 投影：一问一答
    expect(btwStateView.exchanges).toHaveLength(1)
    expect(btwStateView.exchanges[0]?.answer).toBe('空数组已守')
  })

  it('再次提问复用既有侧问会话（不重复建）', async () => {
    const deps = mkDeps()
    await askBtw(deps, '第一问', {})
    await askBtw(deps, '第二问', {})
    expect(deps.calls.filter((c) => c === 'newChat')).toHaveLength(1)
    expect(deps.calls.slice(-3)).toEqual(['switch:btw-new', 'send:btw-new', 'switch:main-1'])
  })

  it('发送失败：error 可见且切回主会话', async () => {
    const deps = mkDeps({ sendMessage: vi.fn(async () => { throw new Error('run 启动失败') }) })
    const ok = await askBtw(deps, 'q', {})
    expect(ok).toBe(false)
    expect(btwStateView.error).toContain('run 启动失败')
    expect(stateProbe.active).toBe('main-1')
  })

  it('旁注文本=mergeBtwNote（未答返回 null）', () => {
    expect(btwNoteText({ exchangeId: 'x', question: 'q', answer: 'a', at: 1, merged: false })).toContain('[btw 旁注]')
    expect(btwNoteText({ exchangeId: 'x', question: 'q', answer: null, at: 1, merged: false })).toBeNull()
    expect(btwNoteText({ exchangeId: 'x', question: 'q', answer: 'a', at: 1, merged: true })).toBeNull()
  })

  it('refreshBtw 无绑定会话清空 exchanges', async () => {
    const deps = mkDeps()
    await refreshBtw(deps, 'no-binding')
    expect(btwStateView.exchanges).toEqual([])
  })
})

describe('B2 侧问浮窗', () => {
  it('waiting/answered 双态渲染 + 复制旁注按钮只在已答出现', async () => {
    const { default: IdeBtwPanel } = await import('../components/IdeBtwPanel.vue')
    btwStateView.exchanges = [
      { exchangeId: 'e1', question: '已答问题', answer: '答案', at: 1, merged: false },
      { exchangeId: 'e2', question: '待答问题', answer: null, at: 2, merged: false },
    ]
    const w = mount(IdeBtwPanel)
    expect(w.find('[data-testid="ide-btw-x-e1"]').text()).toContain('答案')
    expect(w.find('[data-testid="ide-btw-copy-e1"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-btw-x-e2"]').text()).toContain('等待回答')
    expect(w.find('[data-testid="ide-btw-copy-e2"]').exists()).toBe(false)
  })
})
