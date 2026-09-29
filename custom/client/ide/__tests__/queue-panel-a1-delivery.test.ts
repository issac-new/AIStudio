// A1 守门：IdeQueuePanel 投递双模式 + 投递状态时间线。
// @vitest-environment jsdom
// 契约：
// ① 模式切换调用 ide.setChatDeliveryMode（持久化归 ide store）；默认 queue。
// ② 注入模式 + 运行中：新入队消息自动 insertQueuedMessage（steer 真通道）；
//    切换模式之前已在队列的项不追打（排队语义入队的保持排队）。
// ③ 时间线：入队→队列消失→transcript 出现同 id 非 queued 消息 = 已投递行；
//    用户手动移除（transcript 无此 id）永不标已投递。
// ④ 注入相位徽标：queueInsertionStates 相位投影到对应行（服务端权威相位）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'

// 每例卸载：面板实例残留会让多个 watcher 共享同一 reactive mock（假重复转向）
enableAutoUnmount(afterEach)

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const insertMock = vi.fn()
const chatState = reactive({
  activeSessionId: 's1',
  activeSession: null as null | { messages: Array<{ id?: string; queued?: boolean; content?: string }> },
  isLoading: true,
  queuedUserMessages: new Map<string, Array<{ id: string; content: string }>>(),
  queueInsertionStates: new Map<string, { queueId?: string; phase?: string }>(),
  insertQueuedMessage: insertMock,
})
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => chatState }))

const setModeMock = vi.fn()
const ideState = reactive({
  workspace: '/w' as string | null,
  chatDeliveryMode: 'queue' as 'queue' | 'steer',
  setChatDeliveryMode: setModeMock,
})
vi.mock('../store/ide', () => ({ useIdeStore: () => ideState }))

vi.mock('../utils/auth-fetch', () => ({ authFetch: async () => ({ ok: true, json: async () => ({ ok: true, queue: [] }) }) }))

import IdeQueuePanel from '../components/IdeQueuePanel.vue'

async function flush(times = 3): Promise<void> {
  for (let i = 0; i < times; i++) await nextTick()
}

describe('A1 IdeQueuePanel 投递双模式 + 时间线', () => {
  beforeEach(() => {
    insertMock.mockReset()
    setModeMock.mockReset()
    chatState.activeSessionId = 's1'
    chatState.activeSession = null
    chatState.isLoading = true
    chatState.queuedUserMessages = new Map()
    chatState.queueInsertionStates = new Map()
    ideState.workspace = '/w'
    ideState.chatDeliveryMode = 'queue'
  })

  it('① 模式切换：默认排队高亮；点注入调 setChatDeliveryMode("steer")', async () => {
    const w = mount(IdeQueuePanel)
    const queueBtn = w.find('[data-testid="ide-delivery-mode-queue"]')
    const steerBtn = w.find('[data-testid="ide-delivery-mode-steer"]')
    expect(queueBtn.classes()).toContain('is-active')
    expect(steerBtn.classes()).not.toContain('is-active')
    await steerBtn.trigger('click')
    expect(setModeMock).toHaveBeenCalledWith('steer')
  })

  it('② 注入模式自动转向：新入队消息 steer；切换前已在队列的项不追打', async () => {
    chatState.queuedUserMessages = new Map([['s1', [{ id: 'old1', content: '旧项' }]]])
    ideState.chatDeliveryMode = 'queue'
    const w = mount(IdeQueuePanel)
    await flush()
    expect(insertMock).not.toHaveBeenCalled()

    // 切到注入：old1 已在队列 → 播种不追打
    ideState.chatDeliveryMode = 'steer'
    await flush()
    expect(insertMock).not.toHaveBeenCalled()

    // 新消息入队（运行中）→ 自动转向
    chatState.queuedUserMessages = new Map([['s1', [
      { id: 'old1', content: '旧项' },
      { id: 'new1', content: '新消息' },
    ]]])
    await flush()
    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(insertMock).toHaveBeenCalledWith('s1', 'new1')
    expect(w.find('[data-testid="ide-delivery-mode-steer"]').classes()).toContain('is-active')
    w.unmount()
  })

  it('②b 排队模式：新入队不自动转向（既有语义不变）', async () => {
    ideState.chatDeliveryMode = 'queue'
    mount(IdeQueuePanel)
    await flush()
    chatState.queuedUserMessages = new Map([['s1', [{ id: 'n1', content: 'x' }]]])
    await flush()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('③ 时间线：入队→消失→transcript 非 queued = 已投递；手动移除不误标', async () => {
    chatState.activeSession = { messages: [] }
    chatState.queuedUserMessages = new Map([['s1', [
      { id: 'q1', content: '会被投递' },
      { id: 'q2', content: '会被手动移除' },
    ]]])
    const w = mount(IdeQueuePanel)
    await flush()
    expect(w.find('[data-testid="ide-queue-q1"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-queue-delivered-q1"]').exists()).toBe(false)

    // q1 服务端投递（队列消失 + transcript 出现非 queued 同 id）；q2 仅从队列消失（用户移除）
    chatState.queuedUserMessages = new Map()
    chatState.activeSession.messages = [{ id: 'q1', queued: false, content: '会被投递' }]
    await flush()
    expect(w.find('[data-testid="ide-queue-delivered-q1"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-queue-delivered-q2"]').exists()).toBe(false)
    expect(w.find('[data-testid="ide-queue-q1"]').exists()).toBe(false)
    expect(w.text()).toContain('已投递 1')
  })

  it('④ 注入相位徽标：queueInsertionStates 投影到对应行', async () => {
    chatState.queuedUserMessages = new Map([['s1', [{ id: 'q1', content: '注入中的消息' }]]])
    chatState.queueInsertionStates = new Map([['s1', { queueId: 'q1', phase: 'waiting_for_tool_batch' }]])
    const w = mount(IdeQueuePanel)
    await flush()
    const badge = w.find('[data-testid="ide-queue-phase-q1"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('等待工具批次')
  })
})
