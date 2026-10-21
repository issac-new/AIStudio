// IDE 看板任务总览守门：跨板聚合、活跃过滤、board 计数、错误不伪造空成功。
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/api/client', () => ({ request }))

import { useIdeKanbanOverview } from '../composables/useIdeKanbanOverview'

describe('useIdeKanbanOverview', () => {
  beforeEach(() => {
    request.mockReset()
  })

  it('一次请求聚合全实例看板任务，活跃卡排除 done/archived', async () => {
    request.mockResolvedValue({
      boards: [{ slug: 'fanfan-pm-plan' }, { slug: 'qi-test-pay' }],
      tasks: [
        { board: 'fanfan-pm-plan', task: { id: 't1', title: '系分', status: 'todo', priority: 3 } },
        { board: 'qi-test-pay', task: { id: 't2', title: '测试', status: 'done', priority: 1 } },
        { board: 'qi-test-pay', task: { id: 't3', title: '旧卡', status: 'archived', priority: 1 } },
      ],
    })
    const overview = useIdeKanbanOverview()
    await overview.refresh(true)
    expect(request).toHaveBeenCalledWith('/api/hermes/kanban/overview')
    expect(overview.boards.value.map(board => board.slug)).toEqual(['fanfan-pm-plan', 'qi-test-pay'])
    expect(overview.entries.value.map(entry => entry.task.id)).toEqual(['t1', 't2', 't3'])
    expect(overview.activeEntries.value.map(entry => entry.task.id)).toEqual(['t1'])
    expect(overview.boardCounts.value.get('qi-test-pay')).toBe(2)
  })

  it('错误如实暴露，不返回伪造空成功', async () => {
    request.mockRejectedValue(new Error('overview down'))
    const overview = useIdeKanbanOverview()
    await expect(overview.refresh(true)).rejects.toThrow('overview down')
    expect(overview.error.value).toBe('overview down')
    expect(overview.entries.value).toEqual([])
  })
})
