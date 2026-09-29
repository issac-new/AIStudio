// B1 守门：后台任务中心（三真实源聚合：全局子代理/自治队列/当前会话工作流）。
// @vitest-environment jsdom
// 契约：子代理跨会话全列（区别于 IdeAgentsView 会话内过滤）；队列/工作流按
// workspace+session 拉取；空态文案不假数据；端点失败显错误节；点击穿行动作真实
// （toggleFloat('agents') / setSidePaneTab('workflow')）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const chatState = reactive({
  activeSessionId: 's1',
  subagentStreams: new Map<string, unknown>(),
})
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => chatState }))

const ideState = reactive({
  workspace: '/w' as string | null,
  floats: { plan: false, agents: false },
  sidePane: { open: false, tab: 'files' as string },
  toggleFloat: vi.fn((k: string) => { ideState.floats[k as 'agents'] = !ideState.floats[k as 'agents'] }),
  setSidePaneTab: vi.fn((t: string) => { ideState.sidePane.tab = t }),
})
vi.mock('../store/ide', () => ({ useIdeStore: () => ideState }))

// useNowTick 真实实现是 interval 时钟——测试用固定值替身
vi.mock('@/custom/ia2/composables/useNowTick', () => ({ useNowTick: () => ({ value: 0 }) }))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import IdeBgTasksPanel from '../components/IdeBgTasksPanel.vue'

const NOW = Date.now()

describe('IdeBgTasksPanel（B1 后台任务中心）', () => {
  beforeEach(() => {
    chatState.activeSessionId = 's1'
    chatState.subagentStreams = new Map()
    ideState.workspace = '/w'
    ideState.floats.agents = false
    ideState.sidePane.tab = 'files'
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url)
      if (u.includes('/queue/')) return { ok: true, json: async () => ({ ok: true, queue: [{ itemId: 'q1', text: '自治巡检', origin: 'autonomy', state: 'pending' }] }) }
      if (u.includes('/workflow/runs')) return { ok: true, json: async () => ({ ok: true, runs: [{ runId: 'wf1', name: '发布流水线', status: 'running' }] }) }
      return { ok: false, status: 404, json: async () => ({}) }
    })
  })

  it('三源聚合渲染：跨会话子代理+自治队列+工作流运行', async () => {
    chatState.subagentStreams = new Map([
      ['s1:a1', { subagentId: 'a1', label: '写测试', status: 'running', updatedAt: NOW - 5000, sessionId: 's1' }],
      ['s2:a2', { subagentId: 'a2', label: '他会话代理', status: 'completed', updatedAt: NOW - 60000, sessionId: 's2' }],
    ])
    const w = mount(IdeBgTasksPanel)
    await new Promise((r) => setTimeout(r, 30))
    expect(w.find('[data-testid="ide-bgt-sub-s1:a1"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-bgt-sub-s2:a2"]').exists()).toBe(true) // 跨会话可见
    expect(w.find('[data-testid="ide-bgt-queue-q1"]').text()).toContain('自治巡检')
    expect(w.find('[data-testid="ide-bgt-wf-wf1"]').text()).toContain('发布流水线')
  })

  it('点击子代理行开 agents 浮窗；点击工作流行切 workflow 页签', async () => {
    chatState.subagentStreams = new Map([['s1:a1', { subagentId: 'a1', label: 'x', status: 'running', updatedAt: NOW, sessionId: 's1' }]])
    const w = mount(IdeBgTasksPanel)
    await new Promise((r) => setTimeout(r, 30))
    await w.find('[data-testid="ide-bgt-sub-s1:a1"]').trigger('click')
    expect(ideState.toggleFloat).toHaveBeenCalledWith('agents')
    await w.find('[data-testid="ide-bgt-wf-wf1"]').trigger('click')
    expect(ideState.setSidePaneTab).toHaveBeenCalledWith('workflow')
  })

  it('空态三文案；端点失败显错误节不崩', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 503, json: async () => ({}) }))
    const w = mount(IdeBgTasksPanel)
    await new Promise((r) => setTimeout(r, 30))
    expect(w.find('[data-testid="ide-bgt-subagents"]').text()).toContain('无后台子代理')
    expect(w.find('[data-testid="ide-bgt-queue-err"]').text()).toContain('503')
    expect(w.find('[data-testid="ide-bgt-wf-err"]').text()).toContain('503')
  })

  it('workspace 为空：队列/工作流区空态不发请求', async () => {
    ideState.workspace = null
    const w = mount(IdeBgTasksPanel)
    await new Promise((r) => setTimeout(r, 30))
    expect(w.find('[data-testid="ide-bgt-queue"]').text()).toContain('为空')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
