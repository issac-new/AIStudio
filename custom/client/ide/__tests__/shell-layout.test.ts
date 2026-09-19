// overlay/custom/client/ide/__tests__/shell-layout.test.ts
// 壳层布局守门：侧栏/会话列默认可见（防 computed 误删类回归——vue build 无
// vue-tsc，模板引用 undefined 变量只会静默隐藏）。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push: vi.fn() }), createRouter: () => ({ push: vi.fn() }), createWebHistory: () => ({}), createWebHashHistory: () => ({}) }))

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
  }),
}))
vi.mock('@/custom/cockpit/store/cockpit', () => ({
  useCockpitStore: () => ({ openRunTrace: vi.fn() }),
}))
vi.mock('../views/IdeTaskSidebar.vue', () => ({ default: { name: 'IdeTaskSidebar', template: '<aside class="ide-taskbar" />' } }))
vi.mock('../views/IdeChatPane.vue', () => ({ default: { name: 'IdeChatPane', template: '<div class="ide-chat-stub" />' } }))
vi.mock('../views/IdeSidePane.vue', () => ({ default: { name: 'IdeSidePane', template: '<aside class="ide-sidepane" />' } }))
vi.mock('../views/IdeTopBar.vue', () => ({ default: { name: 'IdeTopBar', template: '<div />' } }))
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

  it('侧栏有折叠/最大化按钮（pane-tools）；chat 折叠态容器收缩为把手条', async () => {
    const w = mountShell()
    const ide = useIdeStore()
    await w.vm.$nextTick()
    expect(w.find('[data-testid="ide-fold-sidebar-btn"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-max-sidebar-btn"]').exists()).toBe(true)
    ide.toggleFold('chat')
    await w.vm.$nextTick()
    expect(w.find('.ide-shell__chat').classes()).toContain('is-folded')
  })

  it('工作区列已退役：shell 不再渲染 __workspace', async () => {
    const w = mountShell()
    await flushPromises()
    expect(w.find('.ide-shell__workspace').exists()).toBe(false)
  })
})
