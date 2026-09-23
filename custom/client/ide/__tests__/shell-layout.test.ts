// overlay/custom/client/ide/__tests__/shell-layout.test.ts
// 壳层布局守门：侧栏/会话列默认可见（防 computed 误删类回归——vue build 无
// vue-tsc，模板引用 undefined 变量只会静默隐藏）。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push: vi.fn() }), createRouter: () => ({ push: vi.fn() }), createWebHistory: () => ({}), createWebHashHistory: () => ({}) }))
const { chatSendMessage } = vi.hoisted(() => ({ chatSendMessage: vi.fn(async () => {}) }))

vi.mock('../store/ide', async () => {
  const actual = await vi.importActual<any>('../store/ide')
  return actual
})
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({
    sessions: [], activeSessionId: null, sessionsLoaded: true,
    sessionProfileFilter: null, loadSessions: vi.fn(async () => {}),
    isRunActive: false, abortState: null,
    getSubagentStream: vi.fn(() => null),
    sendMessage: chatSendMessage,
  }),
}))
vi.mock('@/custom/cockpit/store/cockpit', () => ({
  useCockpitStore: () => ({ openRunTrace: vi.fn() }),
}))
// aipaydev 缺口 5：IdeShell 新增 kanban store 依赖（简报抽屉任务源）+ 简报面板子组件桩
vi.mock('@/stores/hermes/kanban', () => ({
  useKanbanStore: () => ({ tasks: [] }),
}))
vi.mock('@/api/hermes/kanban', () => ({
  listBoards: vi.fn(async () => []),
  listTasks: vi.fn(async () => []),
}))
vi.mock('../components/TaskBriefingPanel.vue', () => ({ default: { name: 'TaskBriefingPanel', template: '<aside class="brief-stub" />' } }))
vi.mock('../api/git', () => ({
  ideGitApi: { status: vi.fn(async () => null), log: vi.fn(async () => ({ commits: [] })) },
}))
vi.mock('../views/IdeTaskSidebar.vue', () => ({ default: { name: 'IdeTaskSidebar', template: '<aside class="ide-taskbar" />' } }))
vi.mock('../views/IdeChatPane.vue', () => ({ default: { name: 'IdeChatPane', template: '<div class="ide-chat-stub" />' } }))
vi.mock('../views/IdeSidePane.vue', () => ({ default: { name: 'IdeSidePane', template: '<aside class="ide-sidepane" />' } }))
vi.mock('../views/IdeStatusBar.vue', () => ({ default: { name: 'IdeStatusBar', template: '<div />' } }))
vi.mock('../components/IdeCommandPalette.vue', () => ({ default: { name: 'IdeCommandPalette', template: '<div />' } }))
vi.mock('../components/IdeTaskContextBar.vue', () => ({ default: { name: 'IdeTaskContextBar', template: '<div class="ide-taskctx-stub" />' } }))
vi.mock('@/custom/cockpit/components/CockpitRunTraceModal.vue', () => ({ default: { name: 'CockpitRunTraceModal', template: '<div />' } }))
// v12.1 全局顶区（页头+注意力+切换器）单测外置（ia-shell/global-top 守门），
// 此间桩化隔离其探测/武装重图依赖
vi.mock('@/custom/ia2/components/IaGlobalTop.vue', () => ({ default: { name: 'IaGlobalTop', template: '<div class="ia-gtop-stub" />' } }))

import IdeShell from '../views/IdeShell.vue'
import { useIdeStore } from '../store/ide'

describe('IdeShell 布局守门', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  function mountShell() {
    return mount(IdeShell, { global: { stubs: { Teleport: true } } })
  }

  it('默认态：侧栏与会话列均可见（v-show 绑定的 computed 必须有定义）', async () => {
    const w = mountShell()
    await flushPromises()
    expect(w.find('.ide-shell__sidebar').isVisible()).toBe(true)
    expect(w.find('.ide-taskbar').exists()).toBe(true)
    expect(w.find('.ide-shell__chat').isVisible()).toBe(true)
  })

  it('折叠侧栏后把手出现可展开；chat 最大化时侧栏隐藏、还原后恢复', async () => {
    const w = mountShell()
    const ide = useIdeStore()
    await flushPromises()
    ide.toggleFold('sidebar')
    await w.vm.$nextTick()
    expect(w.find('[data-testid="ide-fold-sidebar"]').exists()).toBe(true)
    expect(w.find('.ide-shell__sidebar').classes()).toContain('is-folded')
    ide.toggleFold('sidebar')
    await w.vm.$nextTick()
    expect(w.find('.ide-taskbar').isVisible()).toBe(true)

    ide.toggleMax('chat')
    await w.vm.$nextTick()
    expect(ide.layout.chat.maximized).toBe(true)
    // 用内联 style 断言（v-show 直写；isVisible 对恢复帧有时序抖动）
    expect(w.find('.ide-shell__sidebar').attributes('style')).toContain('display: none')
    ide.toggleMax('chat')
    await w.vm.$nextTick()
    await w.vm.$nextTick()
    expect(w.find('.ide-shell__sidebar').attributes('style') || '').not.toContain('display: none')
  })

  it('侧栏/会话列顶部控制条（v12.4 IaColumnControls）；chat 折叠态容器收缩为把手条', async () => {
    const w = mountShell()
    const ide = useIdeStore()
    await w.vm.$nextTick()
    // v12.4：栏控迁各栏顶部控制条右上角（旧竖排 pane-tools testid 退役）
    expect(w.find('[data-testid="ide-col-sidebar-fold"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-col-sidebar-max"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-col-chat-fold"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-col-chat-max"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-col-chat-popout"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-fold-sidebar-btn"]').exists()).toBe(false)
    expect(w.find('[data-testid="ide-max-sidebar-btn"]').exists()).toBe(false)
    expect(w.find('.ide-shell__pane-tools').exists()).toBe(false)
    // 控制条折叠/最大化动作直通 ide store
    await w.find('[data-testid="ide-col-chat-fold"]').trigger('click')
    await w.vm.$nextTick()
    expect(w.find('.ide-shell__chat').classes()).toContain('is-folded')
    ide.toggleFold('chat')
    await w.vm.$nextTick()
    await w.find('[data-testid="ide-col-chat-max"]').trigger('click')
    await w.vm.$nextTick()
    expect(ide.layout.chat.maximized).toBe(true)
    ide.toggleMax('chat')
  })

  it('v12.6 维度条（工作空间行）退役：壳不再渲染 ide-dims', async () => {
    const w = mountShell()
    await flushPromises()
    expect(w.find('[data-testid="ide-dims"]').exists()).toBe(false)
  })

  it('v12.6 三栏默认显示：无持久偏好时 sidepane 默认开（files 页签）', () => {
    const ide = useIdeStore()
    expect(ide.sidePane.open).toBe(true)
    expect(ide.sidePane.tab).toBe('files')
  })

  it('v12.6 侧板收起态右缘导轨可重开（footer 功能行退役后的入口）', async () => {
    const w = mountShell()
    const ide = useIdeStore()
    await flushPromises()
    ide.sidePane.open = true
    await w.vm.$nextTick()
    expect(w.find('[data-testid="ide-sidepane-rail"]').exists()).toBe(false)
    ide.sidePane.open = false
    await w.vm.$nextTick()
    expect(w.find('[data-testid="ide-sidepane-rail"]').exists()).toBe(true)
    await w.find('[data-testid="ide-sidepane-open"]').trigger('click')
    expect(ide.sidePane.open).toBe(true)
  })

  it('工作区列已退役：shell 不再渲染 __workspace', async () => {
    const w = mountShell()
    await flushPromises()
    expect(w.find('.ide-shell__workspace').exists()).toBe(false)
  })

  it('顶区对齐沟通协作：IaGlobalTop 常驻、自有 IdeTopBar 已退役', async () => {
    const w = mountShell()
    await flushPromises()
    expect(w.find('.ia-gtop-stub').exists()).toBe(true)
    expect(w.find('.ide-topbar').exists()).toBe(false)
  })

  it('三栏宽度拖拽：分割条拖拽实写 ncwk.cols 共享源且 store 联动（侧名错配防回归）', async () => {
    // 防回归锚点：onIdeDrag 曾把组件栏位 id（sidebar/sidepane）直接传给
    // updateColWidth（只认 left/right），多余键在 writeColWidths 摘键时被静默
    // 丢弃——事件全通、localStorage 有写入、宽度却永远不变。
    const w = mountShell()
    const ide = useIdeStore()
    await flushPromises()
    // 空 localStorage → 共享源默认 left 280 / right 480，挂载回填进 store
    expect(ide.layout.sidebarWidth).toBe(280)
    expect(ide.sidePane.width).toBe(480)
    // 左分割条：右拖 +40 → left 280→320
    await w.find('[data-testid="ide-split-l"]').trigger('mousedown', { clientX: 300 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 340 }))
    window.dispatchEvent(new MouseEvent('mouseup'))
    let cols = JSON.parse(localStorage.getItem('ncwk.cols') || '{}')
    expect(cols.left).toBe(320)
    expect(ide.layout.sidebarWidth).toBe(320)
    // 右分割条：左拖 -40 → right 480→520（sidepane 映射 right，反向）
    await w.find('[data-testid="ide-split-r"]').trigger('mousedown', { clientX: 800 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 760 }))
    window.dispatchEvent(new MouseEvent('mouseup'))
    cols = JSON.parse(localStorage.getItem('ncwk.cols') || '{}')
    expect(cols.right).toBe(520)
    expect(ide.sidePane.width).toBe(520)
    w.unmount()
  })

  it('aipaydev 缺口 5：简报 aux 回传经 buildAuxMessage 组装进 chat.sendMessage', async () => {
    const w = mountShell()
    await flushPromises()
    expect(chatSendMessage).not.toHaveBeenCalled()
    const { buildAuxMessage } = await import('@/custom/ide/components/briefing-types')
    // 无任务上下文时用通用前缀；纯空白拒发
    expect(buildAuxMessage(null, '  ')).toBe('')
    expect(buildAuxMessage(null, '查一下退款')).toBe('【任务简报】 查一下退款')
    expect(buildAuxMessage({ id: 'T-9', title: 't', status: 'todo' }, '查一下退款')).toBe('【任务简报·T-9】 查一下退款')
    w.unmount()
  })
})
