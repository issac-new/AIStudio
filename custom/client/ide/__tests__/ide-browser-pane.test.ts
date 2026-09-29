// Computer Use 接线守门：IDE 浏览器页签=真·内置浏览器（DesktopBrowserPanel），
// 不再嵌设置页；无桥环境如实空态；标注提交进活跃会话（ChatPanel 同链）。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('naive-ui', () => ({ useMessage: () => ({ warning: () => {}, error: () => {}, success: () => {}, info: () => {} }) }))

// 桥开关：默认 jsdom 无桥（desktopBridge 返回 undefined）
const bridgeState = { available: false }
vi.mock('@/utils/desktop-bridge', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/utils/desktop-bridge')>()
  return { ...orig, hasDesktopBrowserBridge: () => bridgeState.available }
})

const sendMessage = vi.fn()
const chatState = { activeSessionId: null as string | null, sendMessage }
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => chatState }))

// 真面板 mock：渲染受控标记 + submit 透传（组件 661 行有 ResizeObserver 等桌面态依赖，不适合 jsdom 全量挂载）
const panelSubmit = vi.fn()
vi.mock('@/components/hermes/chat/DesktopBrowserPanel.vue', () => ({
  default: {
    name: 'DesktopBrowserPanel',
    props: ['visible', 'submit'],
    mounted() { panelSubmit(this.submit) },
    template: '<div data-testid="desktop-browser-panel-stub">{{ visible ? "live" : "hidden" }}</div>',
  },
}))

const attachMock = { id: 'att-1', name: 'annotation.png' }
vi.mock('@/utils/browser-annotation-submit', () => ({
  createBrowserAnnotationAttachment: (payload: unknown) => ({ ...attachMock, payload }),
}))

import IdeBrowserPane from '../views/IdeBrowserPane.vue'

describe('IDE 浏览器页签（Computer Use 接线）', () => {
  beforeEach(() => {
    bridgeState.available = false
    sendMessage.mockReset()
    panelSubmit.mockReset()
    chatState.activeSessionId = null
  })

  it('无桥（浏览器 dev 环境）：如实空态，不嵌设置页冒充', () => {
    const w = mount(IdeBrowserPane)
    expect(w.find('[data-testid="ide-browser-unavailable"]').exists()).toBe(true)
    expect(w.find('[data-testid="desktop-browser-panel-stub"]').exists()).toBe(false)
    expect(w.text()).toContain('桌面应用')
  })

  it('有桥：渲染真·内置浏览器面板（visible+submit 透传）', async () => {
    bridgeState.available = true
    const w = mount(IdeBrowserPane)
    await new Promise((r) => setTimeout(r, 0))
    expect(w.find('[data-testid="desktop-browser-panel-stub"]').exists()).toBe(true)
    expect(panelSubmit).toHaveBeenCalledTimes(1)
    const submit = panelSubmit.mock.calls[0][0] as (p: unknown) => Promise<boolean>
    // 标注提交：无活跃会话 → 拒绝；有会话 → sendMessage 带附件
    expect(await submit({ marker: 1 })).toBe(false)
    expect(sendMessage).not.toHaveBeenCalled()
    chatState.activeSessionId = 's1'
    expect(await submit({ marker: 2 })).toBe(true)
    expect(sendMessage).toHaveBeenCalledWith('', [{ ...attachMock, payload: { marker: 2 } }])
  })
})
