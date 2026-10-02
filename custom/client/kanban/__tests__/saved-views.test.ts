// B12 守门：看板命名视图（multica save-view 吸收）。
// 契约：保存（重名覆盖）→ localStorage 持久；快照五元差异判定；删除；
// Toolbar 下拉应用视图 emit 五事件（板/状态/干系人/搜索/归档）。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

import {
  saveView, removeView, savedViewsState, snapshotEquals, __resetSavedViewsForTest,
} from '../saved-views'

const { NSelect, NButton, NTooltip } = await import('naive-ui').catch(() => ({ NSelect: {}, NButton: {}, NTooltip: {} }))

describe('B12 saved-views 域', () => {
  beforeEach(() => __resetSavedViewsForTest())

  it('保存→状态可见→重名覆盖（幂等 id）', () => {
    const snap = { board: 'aipay-rfd', status: 'review', assignee: null, search: '支付', includeArchived: false }
    const v1 = saveView('发布视角', snap)
    expect(v1?.id).toBe('v-发布视角')
    expect(savedViewsState().views).toHaveLength(1)
    saveView('发布视角', { ...snap, status: 'done' })
    expect(savedViewsState().views).toHaveLength(1)
    expect(savedViewsState().views[0]?.snapshot.status).toBe('done')
  })

  it('空名拒绝；删除生效；持久化往返', () => {
    expect(saveView('  ', { board: 'd', status: null, assignee: null, search: '', includeArchived: false })).toBeNull()
    const v = saveView('视角2', { board: 'd', status: null, assignee: null, search: '', includeArchived: false })
    removeView(v!.id)
    expect(savedViewsState().views).toHaveLength(0)
    saveView('视角3', { board: 'x', status: null, assignee: null, search: '', includeArchived: false })
    expect(JSON.parse(localStorage.getItem('sl:user:kanban.savedViews') ?? '[]')).toHaveLength(1)
  })

  it('快照差异判定五元全覆盖', () => {
    const a = { board: 'b', status: 'todo', assignee: 'u1', search: 'q', includeArchived: false }
    expect(snapshotEquals(a, { ...a })).toBe(true)
    expect(snapshotEquals(a, { ...a, board: 'c' })).toBe(false)
    expect(snapshotEquals(a, { ...a, status: null })).toBe(false)
    expect(snapshotEquals(a, { ...a, assignee: 'u2' })).toBe(false)
    expect(snapshotEquals(a, { ...a, search: '' })).toBe(false)
    expect(snapshotEquals(a, { ...a, includeArchived: true })).toBe(false)
  })
})

describe('B12 Toolbar 视图下拉', () => {
  beforeEach(() => __resetSavedViewsForTest())

  async function mountToolbar() {
    vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
    // Toolbar 内部 useKanbanStore（board 创建面）——替身避免 pinia 激活
    vi.mock('@/stores/hermes/kanban', () => ({
      useKanbanStore: () => ({ boards: [], createBoard: vi.fn(), archiveBoard: vi.fn() }),
    }))
    const { default: KanbanToolbar } = await import('../components/KanbanToolbar.vue')
    return mount(KanbanToolbar, {
      props: {
        boards: [{ slug: 'default', name: '默认' } as never],
        currentBoard: 'default',
        assignees: [],
        searchQuery: '支付',
        includeArchived: false,
        statusFilter: 'review',
      },
      global: { stubs: { NSelect: true, NButton: true, NTooltip: true, NDropdown: true } },
    })
  }

  it('保存当前（prompt 取名）→列表出现→应用 emit 五事件', async () => {
    const w = await mountToolbar()
    await w.find('[data-testid="kanban-views-toggle"]').trigger('click')
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('评审视角')
    await w.find('[data-testid="kanban-views-save"]').trigger('click')
    promptSpy.mockRestore()
    const row = w.find('[data-testid="kanban-view-v-评审视角"]')
    expect(row.exists()).toBe(true)
    await row.trigger('click')
    const events = w.emitted()
    expect(events.boardChange?.[0]).toEqual(['default'])
    expect(events.statusChange?.[0]).toEqual(['review'])
    expect(events.assigneeChange?.[0]).toEqual([''])
    expect(events.searchChange?.[0]).toEqual(['支付'])
    expect(events.includeArchivedChange?.[0]).toEqual([false])
  })

  it('删除视图行生效', async () => {
    saveView('待删', { board: 'default', status: null, assignee: null, search: '', includeArchived: false })
    const w = await mountToolbar()
    await w.find('[data-testid="kanban-views-toggle"]').trigger('click')
    await w.find('[data-testid="kanban-view-del-v-待删"]').trigger('click')
    expect(savedViewsState().views).toHaveLength(0)
    expect(w.find('[data-testid="kanban-view-v-待删"]').exists()).toBe(false)
  })
})
