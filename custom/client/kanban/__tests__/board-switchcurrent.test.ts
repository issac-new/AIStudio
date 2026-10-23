// patch 682 守门：建板「创建后切换」开关必须有效（驾驶舱 P1 残项轮）。
// 契约：switchCurrent=false 不切 selectedBoard；true/缺省切到新板 slug（存量默认行为不变）。
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mockKanbanApi = vi.hoisted(() => ({
  listBoards: vi.fn(),
  createBoard: vi.fn(),
  archiveBoard: vi.fn(),
  getCapabilities: vi.fn(),
  listTasks: vi.fn(),
  getStats: vi.fn(),
  getAssignees: vi.fn(),
  createTask: vi.fn(),
  completeTasks: vi.fn(),
  blockTask: vi.fn(),
  unblockTasks: vi.fn(),
  assignTask: vi.fn(),
  addComment: vi.fn(),
  linkTasks: vi.fn(),
  unlinkTasks: vi.fn(),
  bulkUpdateTasks: vi.fn(),
  getTaskLog: vi.fn(),
  getDiagnostics: vi.fn(),
  reclaimTask: vi.fn(),
  reassignTask: vi.fn(),
  specifyTask: vi.fn(),
  dispatch: vi.fn(),
  openKanbanEventStream: vi.fn(),
  listProjects: vi.fn(),
}))

vi.mock('@/api/hermes/kanban', () => mockKanbanApi)

import { useKanbanStore } from '@/stores/hermes/kanban'

describe('建板 switchCurrent 开关（patch 682）', () => {
  // setSelectedBoard 经 resolveAvailableBoard 校验板在清单内——listBoards 须动态累积新板
  const knownBoards = new Map<string, { slug: string; name: string; total: number }>()

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    knownBoards.clear()
    knownBoards.set('default', { slug: 'default', name: 'default', total: 0 })
    knownBoards.set('board-x', { slug: 'board-x', name: 'board-x', total: 0 })
    mockKanbanApi.listBoards.mockImplementation(async () => [...knownBoards.values()])
    mockKanbanApi.createBoard.mockImplementation(async (d: { slug: string }) => {
      const b = { slug: d.slug, name: d.slug, total: 0 }
      knownBoards.set(d.slug, b)
      return b
    })
    mockKanbanApi.listTasks.mockResolvedValue([])
    mockKanbanApi.getStats.mockResolvedValue({})
    mockKanbanApi.getAssignees.mockResolvedValue([])
    mockKanbanApi.getCapabilities.mockResolvedValue({})
  })

  it('取消勾选（switchCurrent:false）不切换当前板', async () => {
    const store = useKanbanStore()
    await store.createBoard({ slug: 'board-x' }) // 先真切到 board-x
    expect(store.selectedBoard).toBe('board-x')

    await store.createBoard({ slug: 'board-new', switchCurrent: false })
    expect(store.selectedBoard).toBe('board-x') // 不被强切
    expect(mockKanbanApi.createBoard).toHaveBeenCalledWith(expect.objectContaining({ slug: 'board-new' }))
  })

  it('默认（缺省）与显式 true 仍切换到新板（存量行为不变）', async () => {
    const store = useKanbanStore()
    await store.createBoard({ slug: 'board-a' })
    expect(store.selectedBoard).toBe('board-a')

    await store.createBoard({ slug: 'board-b', switchCurrent: true })
    expect(store.selectedBoard).toBe('board-b')

    await store.createBoard({ slug: 'board-c' }) // 缺省=默认开
    expect(store.selectedBoard).toBe('board-c')
  })
})
