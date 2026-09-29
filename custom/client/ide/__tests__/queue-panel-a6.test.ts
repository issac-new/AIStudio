// A6 守门：IdeQueuePanel steer 真通道 + GOAL-05 自治队列区。
// @vitest-environment jsdom
// 契约：steer 按钮只在「id 在服务端权威队列 且 运行中」显示；点击调
// insertQueuedMessage(sid, id)。自治队列区读 GET /queue/:ws 渲染 origin·state；
// 让位/恢复 POST 对应端点并回显计数；端点失败如实显错。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const insertMock = vi.fn()
const chatState: Record<string, unknown> = {
  activeSessionId: 's1',
  activeSession: null,
  isLoading: true,
  queuedUserMessages: new Map<string, Array<{ id: string; content: string }>>(),
  insertQueuedMessage: insertMock,
}
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => chatState }))

const ideState = { workspace: '/w' as string | null }
vi.mock('../store/ide', () => ({ useIdeStore: () => ideState }))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import IdeQueuePanel from '../components/IdeQueuePanel.vue'

describe('A6 IdeQueuePanel steer + 自治队列', () => {
  beforeEach(() => {
    insertMock.mockClear()
    fetchMock.mockReset()
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ ok: true, queue: [] }) }))
    chatState.activeSession = null
    chatState.isLoading = true
    chatState.queuedUserMessages = new Map()
    ideState.workspace = '/w'
  })

  it('权威队列行显示转向按钮并调 insertQueuedMessage；非权威行无按钮（不假按钮）', async () => {
    chatState.activeSession = { messages: [
      { id: 'q1', role: 'user', content: '权威队列消息', queued: true },
      { id: 'q2', role: 'user', content: '仅 transcript 标志', queued: true },
    ] }
    chatState.queuedUserMessages = new Map([['s1', [{ id: 'q1', content: '权威队列消息' }]]])
    const w = mount(IdeQueuePanel)
    expect(w.find('[data-testid="ide-queue-q1"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-queue-steer-q1"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-queue-steer-q2"]').exists()).toBe(false)
    await w.find('[data-testid="ide-queue-steer-q1"]').trigger('click')
    expect(insertMock).toHaveBeenCalledWith('s1', 'q1')
  })

  it('非运行中不显示转向按钮', async () => {
    chatState.isLoading = false
    chatState.queuedUserMessages = new Map([['s1', [{ id: 'q1', content: 'x' }]]])
    const w = mount(IdeQueuePanel)
    expect(w.find('[data-testid="ide-queue-steer-q1"]').exists()).toBe(false)
  })

  it('自治队列：拉取渲染 origin·state；让位 POST 并回显计数', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url)
      if (u.endsWith('/yield') || u.endsWith('/drain')) {
        return { ok: true, json: async () => ({ ok: true, yielded: 2, restored: 2 }) }
      }
      return { ok: true, json: async () => ({ ok: true, queue: [{ itemId: 'a1', origin: 'autonomy', text: '自主优化日志', state: 'pending' }] }) }
    })
    const w = mount(IdeQueuePanel)
    await new Promise((r) => setTimeout(r, 30))
    expect(w.find('[data-testid="ide-queue-autonomy"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-queue-auto-a1"]').text()).toContain('autonomy·pending')
    await w.find('[data-testid="ide-queue-yield"]').trigger('click')
    await new Promise((r) => setTimeout(r, 30))
    const posts = fetchMock.mock.calls.filter((c) => String(c[0]) === '/api/zcode-engine/queue/yield')
    expect(posts.length).toBe(1)
    expect(JSON.parse(String(posts[0][1]?.body))).toEqual({ workspacePath: '/w' })
    expect(w.find('[data-testid="ide-queue-note"]').text()).toContain('已让位 2 项')
  })

  it('自治队列让位失败：如实显错不冒充成功', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/zcode-engine/queue/') && !String(url).endsWith('/yield')) {
        return { ok: true, json: async () => ({ ok: true, queue: [{ itemId: 'a1', origin: 'autonomy', text: 'x', state: 'pending' }] }) }
      }
      return { ok: false, status: 500, json: async () => ({ ok: false, detail: 'boom' }) }
    })
    const w = mount(IdeQueuePanel)
    await new Promise((r) => setTimeout(r, 30))
    await w.find('[data-testid="ide-queue-yield"]').trigger('click')
    await new Promise((r) => setTimeout(r, 30))
    expect(w.find('[data-testid="ide-queue-note"]').text()).toContain('boom')
  })

  it('workspace 为空：自治队列区不渲染', async () => {
    ideState.workspace = null
    chatState.queuedUserMessages = new Map([['s1', [{ id: 'q1', content: 'x' }]]])
    const w = mount(IdeQueuePanel)
    await new Promise((r) => setTimeout(r, 30))
    expect(w.find('[data-testid="ide-queue-autonomy"]').exists()).toBe(false)
    expect(w.find('[data-testid="ide-queue-panel"]').exists()).toBe(true) // 消息队列仍在
  })
})
