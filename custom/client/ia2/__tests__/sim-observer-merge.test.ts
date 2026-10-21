// 推演并入轮守门（2026-10-21 挂账实施）：
//   ① workspace store 双源合并：日常 + sim observer 任务/板，sim 带 source/runId；
//   ② observer 失败 fail-soft（日常面不受影响，sim 源清空）；
//   ③ 日常阶段进度排除 sim 卡（呈现并入、进度口径不变）。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const hostTask = { id: 't_daily', title: '日常卡', assignee: 'me', status: 'running', priority: 2, created_at: 1792000000, session_id: null, workspace_path: null, tenant: null }
const simTask = { id: 't_sim', title: '推演卡', assignee: 'fanfan', status: 'todo', priority: 3, created_at: 1792000100, session_id: null, workspace_path: null, tenant: null }

const { fetchKanbanOverview } = vi.hoisted(() => ({ fetchKanbanOverview: vi.fn() }))
vi.mock('@/custom/cockpit/adapters/teams-adapter', () => ({ fetchKanbanOverview }))
const { fetchSimObserverOverview } = vi.hoisted(() => ({ fetchSimObserverOverview: vi.fn() }))
vi.mock('../api/sim-observer', () => ({ fetchSimObserverOverview }))
vi.mock('@/api/hermes/kanban', () => ({ listBoards: vi.fn(), listTasks: vi.fn() }))
vi.mock('@/custom/cockpit/store/cockpit-kv', () => ({
  loadUserTodos: () => [],
  saveUserTodos: () => {},
}))
vi.mock('@/custom/cockpit/adapters/fleet-adapter', () => ({ connectOverviewStream: () => ({ close: () => {} }) }))

import { useWorkspaceStore } from '../store/workspace'
import { useDailyStageProgress } from '../composables/useDailyStageProgress'

function hostOverview() {
  const raw = { ...hostTask }
  return {
    boards: [{ slug: 'default', name: 'default', total: 1, archived: false }],
    // teams-adapter 契约：tasks=已映射 CockpitTask，rawTasks=原始行
    tasks: [{
      id: 't_daily', title: '日常卡', priority: 'P1', status: 'running', assignee: 'me',
      workspace: '', tenant: null, boardSlug: 'default', createdAt: 1792000000000, sessionId: null,
    }],
    rawTasks: [{ board: 'default', task: raw }],
  }
}

function simOverview(available = true) {
  if (!available) return { available: false, reason: '未找到推演根' }
  return {
    available: true,
    runId: 'run22',
    posture: 'standard',
    startedAt: 1792547790000,
    rooms: [{ key: 'room_analysis', roomId: '!roomA:matrix.test' }],
    boards: [{ slug: 'fanfan-pm-plan', name: 'fanfan-pm-plan', total: 1, archived: false }],
    tasks: [{ board: 'fanfan-pm-plan', task: { ...simTask } }],
    fetchedAt: Date.now(),
  }
}

describe('workspace 双源合并', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fetchKanbanOverview.mockReset().mockResolvedValue(hostOverview())
    fetchSimObserverOverview.mockReset().mockResolvedValue(simOverview())
  })

  it('日常与推演任务同面并入：sim 卡带 source/runId，板带 source=sim', async () => {
    const ws = useWorkspaceStore()
    await ws.refreshAllBoards(true)
    expect(ws.tasks.map(t => t.id).sort()).toEqual(['t_daily', 't_sim'])
    const sim = ws.tasks.find(t => t.id === 't_sim')!
    expect(sim.source).toBe('sim')
    expect(sim.runId).toBe('run22')
    expect(sim.boardSlug).toBe('fanfan-pm-plan')
    expect(ws.tasks.find(t => t.id === 't_daily')!.source).toBeUndefined()
    expect(ws.isSimTask('t_sim')).toBe(true)
    expect(ws.isSimTask('t_daily')).toBe(false)
    expect(ws.boards.find(b => b.slug === 'fanfan-pm-plan')?.source).toBe('sim')
    expect(ws.boards.find(b => b.slug === 'default')?.source).toBe('daily')
    expect(ws.simRunId).toBe('run22')
    expect(ws.simRoomIds.has('!roomA:matrix.test')).toBe(true)
    // raw 面同样带标记（看板卡徽标消费）
    expect(ws.rawTasks.find(e => e.task.id === 't_sim')?.task.source).toBe('sim')
  })

  it('observer 失败 fail-soft：日常面完整保留，sim 源清空且不抛错', async () => {
    fetchSimObserverOverview.mockRejectedValue(new Error('observer down'))
    const ws = useWorkspaceStore()
    await expect(ws.refreshAllBoards(true)).resolves.toBe(true)
    expect(ws.tasks.map(t => t.id)).toEqual(['t_daily'])
    expect(ws.simObserver.available).toBe(false)
    expect(ws.boards.map(b => b.slug)).toEqual(['default'])
  })

  it('available:false 同样落空态（reason 不上屏由调用方处理）', async () => {
    fetchSimObserverOverview.mockResolvedValue(simOverview(false))
    const ws = useWorkspaceStore()
    await ws.refreshAllBoards(true)
    expect(ws.tasks.map(t => t.id)).toEqual(['t_daily'])
    expect(ws.simObserver.available).toBe(false)
  })

  it('日常阶段进度排除 sim 卡：done 不因推演卡虚增（composable 层过滤）', async () => {
    const { defineComponent } = await import('vue')
    const ws = useWorkspaceStore()
    // 双源置数：1 张日常 done + 1 张 sim done（若不过滤会虚增到 2）
    ws.tasks = [
      { id: 'd1', title: 'd', priority: 'P3', status: 'done', assignee: 'me', workspace: '', tenant: null, boardSlug: 'default', createdAt: 1 },
      { id: 's1', title: 's', priority: 'P3', status: 'done', assignee: 'fanfan', workspace: '', tenant: null, boardSlug: 'x', createdAt: 2, source: 'sim', runId: 'run22' },
    ] as never
    const Probe = defineComponent({
      setup() { return { progress: useDailyStageProgress() } },
      template: '<div />',
    })
    const w = mount(Probe)
    expect(w.vm.progress.stageCount(6)).toBe(1)
    expect(w.vm.progress.tasks.value.length).toBe(1)
  })
})
