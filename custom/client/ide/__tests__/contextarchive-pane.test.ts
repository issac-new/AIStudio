// @vitest-environment jsdom
// overlay/custom/client/ide/__tests__/contextarchive-pane.test.ts
// 上下文档案面板守门（C1-C4 UI 面）：窗列表/首窗语义徽标/窗内容 verbatim 渲染/
// 跨窗搜索命中/工作笔记 CRUD + STALE 徽标 + 诚实降级（hasNotes:false 提示）。
// 服务端数据面由 custom/server/contextarchive/__tests__ 全量守门，此处 mock
// authFetch 只验 UI 投影。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const activeSessionId = vi.hoisted(() => ({ value: 'sess-ui-1' as string | null }))
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({ activeSessionId: activeSessionId.value }),
}))

// ---- authFetch 路由桩（按 URL 分发固定响应） ----
const state = vi.hoisted(() => ({
  sessions: { available: true, sessions: [{ session: 'sess-ui-1', windowCount: 2, lastArchivedMessageId: 8, lastArchivedAt: 1000, lastFirstObservation: true }] },
  windows: { windows: [
    { window: 1, fromMessageId: 1, toMessageId: 5, messageCount: 5, archivedAt: 1000, firstObservation: true },
    { window: 2, fromMessageId: 6, toMessageId: 8, messageCount: 3, archivedAt: 2000, firstObservation: false },
  ] },
  windowDetail: {
    session: 'sess-ui-1', window: 2,
    boundary: { fromMessageId: 6, toMessageId: 8, messageCount: 3, archivedAt: 2000, firstObservation: false, compressedThroughMessageId: 8 },
    anchor: ['Context window #2 opened', '任务：修复登录崩溃', '最近动作：terminal npm test'],
    messages: [
      { id: 6, role: 'user', content: 'A消息6 NEEDLE_6', display_role: null, display_content: null, tool_name: null, timestamp: 1, token_count: 10 },
      { id: 7, role: 'assistant', content: 'A消息7 NEEDLE_7', display_role: '助手', display_content: null, tool_name: null, timestamp: 1, token_count: 10 },
    ],
  },
  hits: { hits: [{ window: 1, messageId: 3, role: 'user', snippet: '…A消息3 NEEDLE_3…' }] },
  notes: { hasNotes: false, notes: [] as Array<{ id: string; text: string; createdAt: number; updatedAt: number; stale: boolean }> },
}))

const authFetch = vi.hoisted(() => vi.fn(async (path: string, init?: RequestInit) => {
  const method = init?.method ?? 'GET'
  const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
  if (path.startsWith('/api/context-archive/sessions')) return json(state.sessions)
  if (path.startsWith('/api/context-archive/windows')) return json(state.windows)
  if (path.startsWith('/api/context-archive/window')) return json(state.windowDetail)
  if (path.startsWith('/api/context-archive/search')) return json(state.hits)
  if (path.startsWith('/api/ctx-notes/') && method === 'POST') {
    const body = JSON.parse(String(init?.body ?? '{}')) as { text: string }
    const note = { id: 'note-new', text: body.text, createdAt: 1, updatedAt: 1, stale: false }
    state.notes = { hasNotes: true, notes: [note, ...state.notes.notes] }
    return json({ note }, 201)
  }
  if (path.startsWith('/api/ctx-notes/')) return json(state.notes)
  return json({ ok: false }, 404)
}))
vi.mock('../utils/auth-fetch', () => ({ authFetch }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }) }))

import IdeContextArchivePane from '../components/IdeContextArchivePane.vue'

beforeEach(() => {
  vi.clearAllMocks()
  activeSessionId.value = 'sess-ui-1'
  state.notes = { hasNotes: false, notes: [] }
  setActivePinia(createPinia())
})

describe('IdeContextArchivePane — 上下文档案（无损滚存 UI 面）', () => {
  it('窗列表渲染 + 首窗语义显式声明行', async () => {
    const w = mount(IdeContextArchivePane)
    await flushPromises()
    expect(w.find('[data-testid="ctxar-window-1"]').exists()).toBe(true)
    expect(w.find('[data-testid="ctxar-window-2"]').exists()).toBe(true)
    // 首窗语义不止徽标：显式说明行在
    expect(w.text()).toContain('首窗：从会话头整体归档')
    // 窗首窗徽标 v1 在窗 1 行
    expect(w.find('[data-testid="ctxar-window-1"]').text()).toContain('v1')
  })

  it('点窗展开：锚点三行 + 消息 verbatim 渲染', async () => {
    const w = mount(IdeContextArchivePane)
    await flushPromises()
    await w.find('[data-testid="ctxar-window-2"]').trigger('click')
    await flushPromises()
    const detail = w.find('[data-testid="ctxar-window-detail"]')
    expect(detail.exists()).toBe(true)
    expect(detail.text()).toContain('Context window #2 opened')
    expect(detail.text()).toContain('任务：修复登录崩溃')
    expect(detail.text()).toContain('最近动作：terminal npm test')
    expect(w.find('[data-testid="ctxar-msg-6"]').text()).toContain('A消息6 NEEDLE_6') // 原文不截断（首 120 字内展示）
    // 再点收起
    await w.find('[data-testid="ctxar-window-2"]').trigger('click')
    expect(w.find('[data-testid="ctxar-window-detail"]').exists()).toBe(false)
  })

  it('跨窗搜索：命中行显示窗号/角色/snippet；点击命中跳转所在窗', async () => {
    const w = mount(IdeContextArchivePane)
    await flushPromises()
    await w.find('[data-testid="ctxar-search-input"]').setValue('needle')
    await w.find('[data-testid="ctxar-search-btn"]').trigger('click')
    await flushPromises()
    const hit = w.find('[data-testid="ctxar-hit-0"]')
    expect(hit.exists()).toBe(true)
    expect(hit.text()).toContain('#1')
    expect(hit.text()).toContain('NEEDLE_3')
    await hit.trigger('click') // 命中点开所在窗
    await flushPromises()
    expect(w.find('[data-testid="ctxar-window-detail"]').exists()).toBe(true)
  })

  it('工作笔记：诚实降级提示 → 添加后入列（C3 UI 面）', async () => {
    const w = mount(IdeContextArchivePane)
    await flushPromises()
    // 未写过笔记：诚实降级提示在
    expect(w.find('[data-testid="ctxar-notes-honest"]').text()).toContain('未写过笔记')
    await w.find('[data-testid="ctxar-note-input"]').setValue('第二轮：锚点链路已核对')
    await w.find('[data-testid="ctxar-note-add"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="ctxar-note-note-new"]').text()).toContain('第二轮：锚点链路已核对')
    expect(w.find('[data-testid="ctxar-notes-honest"]').exists()).toBe(false) // 已有笔记不再降级提示
  })

  it('无活动会话：空态不误渲染窗列表', async () => {
    activeSessionId.value = null
    const w = mount(IdeContextArchivePane)
    await flushPromises()
    expect(w.text()).toContain('无活动会话')
    expect(w.find('[data-testid="ctxar-window-1"]').exists()).toBe(false)
  })
})
