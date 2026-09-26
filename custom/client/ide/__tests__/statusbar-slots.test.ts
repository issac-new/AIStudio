// 状态栏槽位定制守门（UI-8：默认全显/切换隐藏/排序持久化）。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('naive-ui', () => ({ useMessage: () => ({ warning: vi.fn(), success: vi.fn() }) }))
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({ activeSessionId: null, activeSession: null, subagentStreams: new Map() }),
}))
vi.mock('../store/ide', () => ({ useIdeStore: () => ({ workspace: '/w', agentId: 'zcode' }) }))
vi.mock('../composables/useSessionMetrics', () => ({
  useSessionMetrics: () => new Proxy({}, {
    get: (_t, key: string) => {
      if (key === 'lowContextToast' || key === 'cacheHit') return () => undefined
      if (key === 'contextText') return { value: '1/100' }
      if (key === 'tpsDisplay') return { value: '1.0' }
      return { value: 1 }
    },
  }) as never,
}))
vi.mock('../../zcode/store/zcode-projection', () => ({
  useZcodeProjection: () => ({ sessionCount: { value: 0 }, lastReasonText: { value: '' }, lastReasonIsTrouble: { value: false }, state: { conversationDeltaTotal: 0 } }),
}))
vi.mock('../../zcode/api/zcode-socket', () => ({ connectZcode: vi.fn(), subscribeZcodeWorkspace: vi.fn(() => () => undefined) }))
vi.mock('./IdeMetricsPopover.vue', () => ({ default: { template: '<div />' } }))

import IdeStatusBar from '../views/IdeStatusBar.vue'

describe('IdeStatusBar 槽位定制（UI-8）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('默认三槽全显；关 workspace 槽后隐藏并持久化', async () => {
    const w = mount(IdeStatusBar)
    await flushPromises()
    expect(w.text()).toContain('/w')
    await w.find('[data-testid="ide-status-slots-btn"]').trigger('click')
    const ws = w.find('[data-testid="ide-slot-workspace"]')
    expect(ws.exists()).toBe(true)
    await ws.setValue(false)
    expect(w.text()).not.toContain('/w')
    expect(JSON.parse(localStorage.getItem('ide_status_slots') ?? '[]')).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'workspace', on: false })]),
    )
  })

  it('排序：metrics 上移到首位（order 生效）', async () => {
    const w = mount(IdeStatusBar)
    await flushPromises()
    await w.find('[data-testid="ide-status-slots-btn"]').trigger('click')
    await w.find('[data-testid="ide-slot-metrics-up"]').trigger('click')
    await w.find('[data-testid="ide-slot-metrics-up"]').trigger('click')
    const cluster = w.find('[data-testid="ide-metrics-cluster"]')
    expect((cluster.element as HTMLElement).style.order).toBe('0')
    const ws = w.find('[data-testid="ide-slot-workspace"]').element.closest('.ide-statusbar__item') as HTMLElement
    expect(ws.style.order).not.toBe('0')
  })
})
