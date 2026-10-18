// 输入框模型按钮守门（修复：解禁+独立目录+双路径 pick）。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('naive-ui', () => ({
  useMessage: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
  useDialog: () => ({ warning: vi.fn() }),
}))
const switchSessionModel = vi.fn(async () => true)
const switchModel = vi.fn(async () => true)
const setSessionReasoningEffort = vi.fn(async () => undefined)
const { newChat, sendMessage } = vi.hoisted(() => ({ newChat: vi.fn(), sendMessage: vi.fn() }))
const state = { activeSessionId: null as string | null, activeSession: null as Record<string, unknown> | null }
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({
    get activeSessionId() { return state.activeSessionId },
    get activeSession() { return state.activeSession },
    subagentStreams: new Map(),
    sessions: [],
    newChat,
    switchSessionModel,
    setSessionReasoningEffort,
    sendMessage,
  }),
}))
vi.mock('@/stores/hermes/profiles', () => ({ useProfilesStore: () => ({ fetchProfiles: vi.fn(async () => {}), profiles: [] }) }))
vi.mock('@/stores/hermes/settings', () => ({ useSettingsStore: () => ({ fetchSettings: vi.fn(async () => {}), settings: {} }) }))
vi.mock('@/stores/hermes/app', () => ({
  useAppStore: () => ({
    modelGroups: [{ provider: 'hermes-p', models: [{ id: 'h-model' }] }],
    selectedModel: '',
    switchModel,
  }),
}))
vi.mock('../store/ide', () => ({ useIdeStore: () => ({ floats: {}, agentId: 'zcode' }), ideAgentToChatAgent: (agentId: string) => ({ id: agentId }) }))
const catalogMock = vi.fn()
vi.mock('../utils/engine-models', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/engine-models')>()
  return { ...actual, fetchEngineCatalog: () => catalogMock() }
})
vi.mock('@/api/hermes/model-context', () => ({ setModelContext: vi.fn(async () => undefined) }))
// Cua 完整回路：会话闸门 API 桩（真实行为由 api/cua + policy 专测覆盖）
vi.mock('../api/cua', () => ({
  ideCuaApi: {
    status: vi.fn(async () => ({ ok: true, available: true, seededAt: '0.6.4', note: '' })),
    session: vi.fn(async (sessionId: string) => ({ ok: true, sessionId, enabled: localStorage.getItem('ide-computer-use:' + sessionId) === 'on' })),
    setSession: vi.fn(async (sessionId: string, enabled: boolean) => ({ ok: true, sessionId, enabled })),
  },
}))
vi.mock('@/components/hermes/chat/ChatInput.vue', () => ({
  default: {
    name: 'ChatInputStub',
    props: ['modelDisabled', 'modelLabel', 'reasoningEffortDisabled'],
    emits: ['modelClick'],
    template: `<div>
      <button data-testid="stub-model-btn" :disabled="modelDisabled" @click="$emit('modelClick')">{{ modelLabel }}</button>
      <slot />
    </div>`,
  },
}))

// 健康挂载（IdeChatPane 防漂移 ?. 挂载走通后）下 ready=true 会渲染重型子树，
// 单测聚焦输入框模型按钮，其余子组件一律桩化（vi.mock 静态声明，不可循环）。
vi.mock('@/components/hermes/chat/MessageList.vue', () => ({ default: { name: 'MessageListStub', template: '<div />' } }))
vi.mock('../components/IdeTurnRail.vue', () => ({ default: { name: 'IdeTurnRail', template: '<div />' } }))
vi.mock('../components/IdeHandoffCard.vue', () => ({ default: { name: 'IdeHandoffCard', template: '<div />' } }))
vi.mock('../components/IdeRecoveryDialog.vue', () => ({ default: { name: 'IdeRecoveryDialog', template: '<div />' } }))
vi.mock('../components/IdePermissionSwitcher.vue', () => ({ default: { name: 'IdePermissionSwitcherStub', template: '<div data-testid="ide-perm-trigger" />' } }))
// ZCode 对齐批：管理模型入口打开的引擎目录对话框（重件桩化；保存回调由本文件断言调用面）
vi.mock('../components/IdeEngineModelsDialog.vue', () => ({
  default: { name: 'IdeEngineModelsDialogStub', emits: ['close', 'saved'], template: '<div data-testid="ide-engine-models-dialog-stub"><button data-testid="stub-dialog-saved" @click="$emit(\'saved\')" /></div>' },
}))
vi.mock('../components/IdeAskCard.vue', () => ({ default: { name: 'IdeAskCard', template: '<div />' } }))
vi.mock('../components/IdeMentionChip.vue', () => ({ default: { name: 'IdeMentionChip', template: '<div />' } }))
vi.mock('../components/IdeRunLogPanel.vue', () => ({ default: { name: 'IdeRunLogPanel', template: '<div />' } }))
vi.mock('../components/IdeQueuePanel.vue', () => ({ default: { name: 'IdeQueuePanel', template: '<div />' } }))
vi.mock('../components/IdeRecapCard.vue', () => ({ default: { name: 'IdeRecapCard', template: '<div />' } }))
vi.mock('../components/IdeTaskGroupsPanel.vue', () => ({ default: { name: 'IdeTaskGroupsPanel', template: '<div />' } }))
import IdeChatPane from '../views/IdeChatPane.vue'

describe('IdeChatPane 输入框模型按钮（修复守门）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    catalogMock.mockReset()
    switchSessionModel.mockClear()
    switchModel.mockClear()
    newChat.mockClear()
    setSessionReasoningEffort.mockClear()
    state.activeSessionId = null
    state.activeSession = null
  })

  it('不再写死禁用：目录就绪即可点；点击开独立目录浮层（分组显示人类可读名）', async () => {
    catalogMock.mockResolvedValue({
      independent: true,
      groups: [{ provider: 'bigmodel', label: 'BigModel - Coding Plan', models: [{ id: 'glm-5.3' }] }],
      defaultModel: { provider: 'bigmodel', model: 'glm-5.3' },
    })
    const w = mount(IdeChatPane, { global: { stubs: { transition: false } } } as never)
    await flushPromises()
    // 新会话默认模型来自 ZCode 目录，不再继承 Hermes 的 selectedModel（aim）。
    expect(newChat).toHaveBeenCalledWith(expect.objectContaining({ model: 'glm-5.3', provider: 'bigmodel' }))
    const btn = w.find('[data-testid="stub-model-btn"]')
    expect(btn.attributes('disabled')).toBeUndefined()
    await btn.trigger('click')
    expect(w.find('[data-testid="ide-input-model-picker"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-input-model-bigmodel-glm-5.3"]').exists()).toBe(true)
    expect(w.find('.ide-chat__model-group-title').text()).toBe('BigModel - Coding Plan')
  })

  it('无会话 pick=新会话默认模型（switchModel）；有会话 pick=会话粘性（switchSessionModel）', async () => {
    catalogMock.mockResolvedValue({
      independent: true,
      groups: [{ provider: 'bigmodel', models: [{ id: 'glm-5.3' }] }],
    })
    const w = mount(IdeChatPane, { global: { stubs: { transition: false } } } as never)
    await flushPromises()
    await w.find('[data-testid="stub-model-btn"]').trigger('click')
    await w.find('[data-testid="ide-input-model-bigmodel-glm-5.3"]').trigger('click')
    expect(switchModel).toHaveBeenCalledWith('glm-5.3', 'bigmodel')
    expect(switchSessionModel).not.toHaveBeenCalled()

    state.activeSessionId = 's1'
    state.activeSession = { id: 's1', model: '' }
    await w.find('[data-testid="stub-model-btn"]').trigger('click')
    await w.find('[data-testid="ide-input-model-bigmodel-glm-5.3"]').trigger('click')
    expect(switchSessionModel).toHaveBeenCalledWith('glm-5.3', 'bigmodel', 's1')
  })

  it('存量 global 会话切换被拒→兜底设默认模型；scoped 会话直接切', async () => {
    catalogMock.mockResolvedValue({
      independent: true,
      groups: [{ provider: 'bigmodel', models: [{ id: 'glm-5.3' }] }],
    })
    state.activeSessionId = 's9'
    state.activeSession = { id: 's9', codingAgentMode: 'global', model: 'qwen3.7-max' }
    switchSessionModel.mockResolvedValueOnce(false)
    const w = mount(IdeChatPane, { global: { stubs: { transition: false } } } as never)
    await flushPromises()
    await w.find('[data-testid="stub-model-btn"]').trigger('click')
    await w.find('[data-testid="ide-input-model-bigmodel-glm-5.3"]').trigger('click')
    expect(switchModel).toHaveBeenCalledWith('glm-5.3', 'bigmodel')
    state.activeSession = { id: 's10', codingAgentMode: 'scoped', model: '' }
    switchSessionModel.mockResolvedValueOnce(true)
    await w.find('[data-testid="stub-model-btn"]').trigger('click')
    await w.find('[data-testid="ide-input-model-bigmodel-glm-5.3"]').trigger('click')
    expect(switchSessionModel).toHaveBeenCalledWith('glm-5.3', 'bigmodel', 's9')
  })

  it('目录全空才禁（回落也空）', async () => {
    catalogMock.mockResolvedValue({ independent: false, groups: [] })
    const w = mount(IdeChatPane, { global: { stubs: { transition: false } } } as never, )
    await flushPromises()
    // 回落 hermes modelGroups（mock 里有一组）→ 仍可用
    expect(w.find('[data-testid="stub-model-btn"]').attributes('disabled')).toBeUndefined()
  })

  it('Ycode 对象目录按模型 id 判失效；横幅按钮就地开选择器（2026-10-18 回归）', async () => {
    catalogMock.mockResolvedValue({
      independent: true,
      groups: [{ provider: 'builtin:bigmodel', label: 'BigModel', models: [{ id: 'GLM-5.3-Flash' }] }],
    })
    state.activeSessionId = 's1'
    state.activeSession = { id: 's1', model: 'GLM-5.3-Flash', codingAgentMode: 'scoped' }
    let w = mount(IdeChatPane, { global: { stubs: { transition: false } } } as never)
    await flushPromises()
    expect(w.find('[data-testid="ide-model-invalid"]').exists()).toBe(false)

    state.activeSession = { id: 's1', model: 'aim', codingAgentMode: 'scoped' }
    w = mount(IdeChatPane, { global: { stubs: { transition: false } } } as never)
    await flushPromises()
    expect(w.find('[data-testid="ide-model-invalid"]').exists()).toBe(true)
    const reselect = w.findAll('button.ide-chat__model-invalid-btn').find(b => b.text() === '重选模型')
    expect(reselect).toBeTruthy()
    await reselect!.trigger('click')
    expect(w.find('[data-testid="ide-input-model-picker"]').exists()).toBe(true)
  })

  it('思考档=ZCode 目录档位（非 Hermes）：展示/选档写会话；模型无档位不渲染', async () => {
    catalogMock.mockResolvedValue({
      independent: true,
      groups: [{ provider: 'bigmodel', label: 'BigModel', models: [
        { id: 'glm-5.3', reasoningLevels: ['low', 'high', 'max'] },
        { id: 'plain-model' },
      ] }],
      defaultModel: { provider: 'bigmodel', model: 'glm-5.3' },
    })
    state.activeSessionId = 's1'
    state.activeSession = { id: 's1', model: 'glm-5.3', provider: 'bigmodel', codingAgentMode: 'scoped', reasoningEffort: '' }
    let w = mount(IdeChatPane, { global: { stubs: { transition: false } } } as never)
    await flushPromises()
    // ChatInput 内置 Hermes 推理强度被禁用（prop 下发）
    expect(w.findComponent({ name: 'ChatInputStub' }).props('reasoningEffortDisabled')).toBe(true)
    const btn = w.find('[data-testid="ide-effort-btn"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('思考')
    await btn.trigger('click')
    const options = w.findAll('[data-testid="ide-effort-menu"] .ide-chat__effort-option')
    expect(options.map(o => o.text())).toEqual(['默认', '低', '高', '最高'])
    await options[2].trigger('click')
    expect(setSessionReasoningEffort).toHaveBeenCalledWith('s1', 'high')
    expect(w.find('[data-testid="ide-effort-menu"]').exists()).toBe(false)

    // 模型无档位 → 控件不渲染（不落 Hermes 默认档）
    state.activeSession = { id: 's1', model: 'plain-model', provider: 'bigmodel', codingAgentMode: 'scoped', reasoningEffort: '' }
    w = mount(IdeChatPane, { global: { stubs: { transition: false } } } as never)
    await flushPromises()
    expect(w.find('[data-testid="ide-effort"]').exists()).toBe(false)
  })

  it('composer 设置菜单（zcode 对照）：模式七档/模型入口/思考档/工具调用齐备可操作', async () => {
    catalogMock.mockResolvedValue({
      independent: true,
      groups: [{ provider: 'bigmodel', label: 'BigModel', models: [{ id: 'glm-5.3', reasoningLevels: ['low', 'high'] }] }],
      defaultModel: { provider: 'bigmodel', model: 'glm-5.3' },
    })
    state.activeSessionId = 's2'
    state.activeSession = { id: 's2', model: 'glm-5.3', provider: 'bigmodel', codingAgentMode: 'scoped', reasoningEffort: '' }
    const w = mount(IdeChatPane, { global: { stubs: { transition: false } } } as never)
    await flushPromises()
    await w.find('[data-testid="ide-composer-settings-btn"]').trigger('click')
    // 模式=ZCode 四档形态（2026-10-18 锚定校正）：Plan 勾选 + build/guarded/yolo 三单选；
    // 选档写 zcode 形态键并派生七档写旧键（服务端穿线词表零改动）
    const chips = w.findAll('[data-testid^="ide-settings-mode-"]')
    expect(chips.map(c => c.text())).toEqual(['💡 计划', '改动前询问', '自主模式', '完全访问'])
    await chips[2].trigger('click')
    expect(JSON.parse(localStorage.getItem('ide-zcode-mode:s2') || 'null')).toEqual({ mode: 'guarded', planEnabled: false })
    expect(localStorage.getItem('ide-permission-mode:s2')).toBe('dontAsk')
    await chips[0].trigger('click')
    expect(localStorage.getItem('ide-permission-mode:s2')).toBe('plan')
    // 工具调用行存在（先于模型行断言——点模型行会收起菜单）
    expect(w.find('[data-testid="ide-settings-tooltrace"]').exists()).toBe(true)
    // 模型：行点击打开 Ycode 模型选择器
    expect(w.find('[data-testid="ide-input-model-picker"]').exists()).toBe(false)
    await w.find('[data-testid="ide-settings-model-row"]').trigger('click')
    expect(w.find('[data-testid="ide-input-model-picker"]').exists()).toBe(true)
  })
})

// ── ZCode 输入框对齐批（2026-10-18）：composer 工具条五控件 + 模型面板入口 ──
describe('IdeChatPane composer 工具条（ZCode 对齐）', () => {
  const LEVELS_MODEL = [{ id: 'glm-5.3', reasoningLevels: ['low', 'high', 'max'] }]

  function barTestids(w: { element: HTMLElement }): string[] {
    const bar = w.element.querySelector('[data-testid="ide-composer-bar"]')
    expect(bar).toBeTruthy()
    return Array.from(bar!.querySelectorAll<HTMLElement>('[data-testid]')).map(el => el.dataset.testid as string)
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    catalogMock.mockReset()
    switchSessionModel.mockClear()
    switchModel.mockClear()
    newChat.mockClear()
    sendMessage.mockClear()
    state.activeSessionId = null
    state.activeSession = null
    localStorage.clear()
  })

  it('输入区下方一排五控件，顺序=ZCode（模式/电脑操作/上下文容量/模型选择/思考强度）', async () => {
    catalogMock.mockResolvedValue({
      independent: true,
      groups: [{ provider: 'bigmodel', models: LEVELS_MODEL }],
    })
    state.activeSessionId = 's1'
    state.activeSession = { id: 's1', model: 'glm-5.3', provider: 'bigmodel', codingAgentMode: 'scoped' }
    const w = mount(IdeChatPane, { global: { stubs: { transition: false } } } as never)
    await flushPromises()
    const ids = barTestids(w)
    const firstOf = (id: string) => ids.indexOf(id)
    expect(firstOf('ide-perm-trigger')).toBeGreaterThanOrEqual(0)
    expect(firstOf('ide-computer-use')).toBeGreaterThan(firstOf('ide-perm-trigger'))
    expect(firstOf('ide-context-bar')).toBeGreaterThan(firstOf('ide-computer-use'))
    expect(firstOf('ide-composer-model-btn')).toBeGreaterThan(firstOf('ide-context-bar'))
    expect(firstOf('ide-effort-btn')).toBeGreaterThan(firstOf('ide-composer-model-btn'))
    // 头部双入口退役：模型切换器不再渲染于头部
    expect(w.find('[data-testid="ide-model-switcher"]').exists()).toBe(false)
  })

  it('电脑操作开关：切换即发声明消息并按会话持久化', async () => {
    catalogMock.mockResolvedValue({ independent: true, groups: [{ provider: 'bigmodel', models: LEVELS_MODEL }] })
    state.activeSessionId = 's1'
    state.activeSession = { id: 's1', model: 'glm-5.3', provider: 'bigmodel', codingAgentMode: 'scoped' }
    const w = mount(IdeChatPane, { global: { stubs: { transition: false } } } as never)
    await flushPromises()
    const btn = w.find('[data-testid="ide-computer-use"]')
    expect(btn.classes()).not.toContain('is-on')
    await btn.trigger('click')
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(String(sendMessage.mock.calls[0][0])).toContain('[computer-use-policy] enabled=true')
    expect(w.find('[data-testid="ide-computer-use"]').classes()).toContain('is-on')
    expect(localStorage.getItem('ide-computer-use:s1')).toBe('on')
    await w.find('[data-testid="ide-computer-use"]').trigger('click')
    expect(String(sendMessage.mock.calls[1][0])).toContain('[computer-use-policy] enabled=false')
    expect(localStorage.getItem('ide-computer-use:s1')).toBe('off')
  })

  it('模型面板：Auto 路由入口 + 管理模型入口（打开引擎目录对话框，保存写穿重拉）', async () => {
    let calls = 0
    catalogMock.mockImplementation(async () => {
      calls += 1
      return { independent: true, groups: [{ provider: 'bigmodel', label: 'BigModel', models: [{ id: 'glm-5.3' }] }] }
    })
    const w = mount(IdeChatPane, { global: { stubs: { transition: false } } } as never)
    await flushPromises()
    await w.find('[data-testid="ide-composer-model-btn"]').trigger('click')
    const picker = w.find('[data-testid="ide-input-model-picker"]')
    expect(picker.exists()).toBe(true)
    expect(w.find('[data-testid="ide-input-model-auto"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-input-model-manage"]').exists()).toBe(true)
    await w.find('[data-testid="ide-input-model-manage"]').trigger('click')
    expect(w.find('[data-testid="ide-engine-models-dialog-stub"]').exists()).toBe(true)
    const before = calls
    await w.find('[data-testid="stub-dialog-saved"]').trigger('click')
    await flushPromises()
    expect(calls).toBeGreaterThan(before) // 保存回调写穿重拉目录
  })

  it('双源守门（自退役的 model-switcher-source 迁入）：独立目录优先，空/失败回落 Hermes', async () => {
    catalogMock.mockResolvedValue({
      independent: true,
      groups: [{ provider: 'bigmodel', models: [{ id: 'glm-5.3' }] }],
    })
    let w = mount(IdeChatPane, { global: { stubs: { transition: false } } } as never)
    await flushPromises()
    await w.find('[data-testid="ide-composer-model-btn"]').trigger('click')
    let text = w.find('[data-testid="ide-input-model-picker"]').text()
    expect(text).toContain('bigmodel')
    expect(text).not.toContain('hermes-p')

    catalogMock.mockResolvedValue({ independent: false, groups: [] })
    w = mount(IdeChatPane, { global: { stubs: { transition: false } } } as never)
    await flushPromises()
    await w.find('[data-testid="ide-composer-model-btn"]').trigger('click')
    text = w.find('[data-testid="ide-input-model-picker"]').text()
    expect(text).toContain('hermes-p')

    catalogMock.mockRejectedValue(new Error('503'))
    w = mount(IdeChatPane, { global: { stubs: { transition: false } } } as never)
    await flushPromises()
    await w.find('[data-testid="ide-composer-model-btn"]').trigger('click')
    expect(w.find('[data-testid="ide-input-model-picker"]').text()).toContain('hermes-p')
  })
})
