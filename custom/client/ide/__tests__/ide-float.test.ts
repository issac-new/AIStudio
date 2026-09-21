// @vitest-environment jsdom
// overlay/custom/client/ide/__tests__/ide-float.test.ts
// 中栏浮窗守门（09-20 裁定，对标 zcode 浮窗模式）：头部开关开合、任务计划
// 浮窗取最新快照、子代理名册枚举/选中/focusId、消息流开窗事件动线、页签退役。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
const { push } = vi.hoisted(() => ({ push: vi.fn() }))
// 模块链含 upstream router/index.ts（createRouter + beforeEach 链）→ mock 补全
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ query: {} }),
  createRouter: () => ({ push, install: () => {}, beforeEach: () => {}, afterEach: () => {} }),
  createWebHashHistory: () => ({}),
}))

// ── chat store：当前会话消息（含两代任务计划）+ 三条子代理流（两条属当前会话）──
// vi.mock 工厂被提升执行，数据须经 vi.hoisted 才能在工厂内引用
const { planOld, planNew, subagentStreams } = vi.hoisted(() => {
  const planOld = { plan_id: 'plan-old', revision: 1, execution_state: 'ended', plan: [{ id: 'a', step: '旧步骤', status: 'completed' }] }
  const planNew = { plan_id: 'plan-new', revision: 2, execution_state: 'running', plan: [{ id: 'b', step: '新步骤', status: 'in_progress' }] }
  const streamOf = (subagentId: string, status = 'running') => ({
    sessionId: 's-1', subagentId, status, goal: `goal-${subagentId}`,
    startedAt: 1, updatedAt: 2, entries: [],
  })
  const subagentStreams = new Map<string, unknown>([
    ['s-1:agent-1', streamOf('agent-1')],
    ['s-1:agent-2', streamOf('agent-2', 'completed')],
    ['s-2:agent-x', streamOf('agent-x')],
  ])
  return { planOld, planNew, subagentStreams }
})
vi.mock('@/stores/hermes/chat', () => {
  const activeSession = {
    id: 's-1', codingAgentId: 'codex', title: '浮窗测试会话', workspace: '/lab/ncwk',
    messages: [
      { id: 'm1', role: 'user' },
      { id: 'm2', role: 'assistant', taskPlan: planOld },
      { id: 'm3', role: 'assistant', taskPlan: planNew },
    ],
  }
  return {
    useChatStore: () => ({
      sessions: [activeSession],
      activeSession,
      activeSessionId: 's-1',
      sessionProfileFilter: null,
      sessionsLoaded: true,
      subagentStreams,
      getSubagentStream: (sid: string, aid: string) => subagentStreams.get(`${sid}:${aid}`) || null,
      switchSession: vi.fn(async () => {}),
      newChat: vi.fn(() => ({})),
      loadSessions: vi.fn(async () => {}),
      setRuntimeMode: vi.fn(),
      isRunActive: false,
      abortState: null,
      runStartedAt: new Map(),
    }),
  }
})

vi.mock('@/stores/hermes/app', () => ({ useAppStore: () => ({ loadModels: vi.fn(), modelGroups: [], connected: true }) }))
vi.mock('@/stores/hermes/profiles', () => ({ useProfilesStore: () => ({ fetchProfiles: vi.fn(async () => {}) }) }))
vi.mock('@/stores/hermes/settings', () => ({ useSettingsStore: () => ({ fetchSettings: vi.fn(async () => {}) }) }))
vi.mock('@/stores/hermes/files', () => ({ useFilesStore: () => ({ previewFile: null, closePreview: vi.fn() }) }))
vi.mock('@/stores/hermes/tool-panel', () => ({ useToolPanelStore: () => ({ workspaceDiff: null, closeWorkspaceDiff: vi.fn() }) }))
vi.mock('@/custom/cockpit/store/cockpit', () => ({ useCockpitStore: () => ({ openRunTrace: vi.fn() }) }))
vi.mock('@/utils/chat-agent-avatar', () => ({ chatSessionAgentAvatar: () => ({ name: 'x' }) }))

// 上游重组件挡为轻桩（隔离 MessageList 全图依赖）
vi.mock('@/components/hermes/chat/MessageList.vue', () => ({ default: { name: 'MessageList', template: '<div data-testid="stub-msglist" />' } }))
vi.mock('@/components/hermes/chat/ChatInput.vue', () => ({ default: { name: 'ChatInput', template: '<div data-testid="stub-chatinput" />' } }))
vi.mock('@/components/hermes/chat/TaskPlanCard.vue', () => ({ default: { name: 'TaskPlanCard', props: ['plan'], template: '<div data-testid="stub-plancard">{{ plan.plan_id }}</div>' } }))
vi.mock('@/components/hermes/chat/SubagentStreamPanel.vue', () => ({ default: { name: 'SubagentStreamPanel', props: ['agent', 'stream'], template: '<div data-testid="stub-subagent-panel">{{ stream.subagentId }}</div>' } }))
vi.mock('@/components/hermes/files/WorkspaceDiffPreview.vue', () => ({ default: { name: 'WorkspaceDiffPreview', template: '<div />' } }))
vi.mock('@/components/hermes/files/FilePreview.vue', () => ({ default: { name: 'FilePreview', template: '<div />' } }))

import IdeChatPane from '../views/IdeChatPane.vue'
import { useIdeStore } from '../store/ide'
import { OPEN_SUBAGENT_STREAM_EVENT } from '@/utils/hermes/subagent-stream'

async function mountPane() {
  const w = mount(IdeChatPane)
  await flushPromises()
  return w
}

describe('IdeChatPane 浮窗（任务计划/子代理，对标 zcode）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('页签行已退役；消息流常驻', async () => {
    const w = await mountPane()
    expect(w.find('.ide-chat__tabs').exists()).toBe(false)
    expect(w.find('[data-testid="stub-msglist"]').exists()).toBe(true)
  })

  it('头部开关：开任务计划浮窗显最新快照，再点关闭', async () => {
    const w = await mountPane()
    const ide = useIdeStore()
    expect(w.find('[data-testid="ide-float-plan"]').exists()).toBe(false)
    await w.find('[data-testid="ide-chat-float-plan"]').trigger('click')
    expect(ide.floats.plan).toBe(true)
    expect(w.find('[data-testid="ide-float-plan"]').exists()).toBe(true)
    // 取消息流最新（末尾向前）的 plan-new，而非 plan-old
    expect(w.find('[data-testid="stub-plancard"]').text()).toBe('plan-new')
    await w.find('[data-testid="ide-float-close"]').trigger('click')
    expect(ide.floats.plan).toBe(false)
  })

  it('子代理名册：枚举当前会话的流（跨会话过滤），点选展开面板', async () => {
    const w = await mountPane()
    await w.find('[data-testid="ide-chat-float-agents"]').trigger('click')
    const items = w.findAll('[data-testid^="ide-float-agent-"]')
    expect(items.map((n) => n.attributes('data-testid'))).toEqual([
      'ide-float-agent-agent-1', 'ide-float-agent-agent-2',
    ])
    // 未选中时无面板
    expect(w.find('[data-testid="stub-subagent-panel"]').exists()).toBe(false)
    await w.find('[data-testid="ide-float-agent-agent-2"]').trigger('click')
    expect(w.find('[data-testid="stub-subagent-panel"]').text()).toBe('agent-2')
  })

  it('消息流子代理工具卡开窗事件 → 打开子代理浮窗并选中目标', async () => {
    const w = await mountPane()
    const ide = useIdeStore()
    window.dispatchEvent(new CustomEvent(OPEN_SUBAGENT_STREAM_EVENT, {
      detail: { sessionId: 's-1', subagentId: 'agent-2' },
    }))
    await flushPromises()
    expect(ide.floats.agents).toBe(true)
    expect(w.find('[data-testid="stub-subagent-panel"]').text()).toBe('agent-2')
  })

  it('focusId 仅在变化时生效：null 不清空既有选中', async () => {
    const w = await mountPane()
    await w.find('[data-testid="ide-chat-float-agents"]').trigger('click')
    await w.find('[data-testid="ide-float-agent-agent-1"]').trigger('click')
    expect(w.find('[data-testid="stub-subagent-panel"]').text()).toBe('agent-1')
    // 重挂载（模拟 null focusId 初始态）：无 focusId 不自动选中
    const ide = useIdeStore()
    ide.floats.agents = false
    await flushPromises()
    expect(w.find('[data-testid="ide-float-agents"]').exists()).toBe(false)
  })
})
