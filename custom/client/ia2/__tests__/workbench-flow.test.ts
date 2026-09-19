// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/workbench-flow.test.ts
// v12 工作台守门（2026-09-19 统一视图 Task 4）：左栏工作流导航（面板纯交互）
// + WorkbenchView 装配（行构建钩子/默认选择/路由跳转/挂接徽章）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// ── store 桩 ──
const roomStubs = vi.hoisted(() => {
  const rooms = [
    { roomId: '!r1:host', name: '应急指挥中心' },
    { roomId: '!r2:host', name: 'swarmstudio-发布' },
  ]
  const state = {
    sortedRooms: rooms,
    getRoomUnreadCount: (r: { roomId: string }) => (r.roomId === '!r1:host' ? 2 : 0),
    createRoom: vi.fn(async () => { state.sortedRooms = [...rooms, { roomId: '!new:host', name: '新房间' }] }),
  }
  return { state, useMatrixRoomStore: () => state }
})
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({ useMatrixRoomStore: roomStubs.useMatrixRoomStore }))

const chatStubs = vi.hoisted(() => {
  const state = {
    sessions: [
      { id: 'sess-1', title: 'agent 会话 A', updatedAt: 1700 },
      { id: 'sess-2', title: 'agent 会话 B', updatedAt: 3000 },
    ],
    unreadMessages: new Map([['sess-1', { count: 4, lastPreview: '', lastRole: '', lastTs: 0 }]]),
  }
  return { state, useChatStore: () => state }
})
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: chatStubs.useChatStore }))

const kanbanStubs = vi.hoisted(() => {
  const state = {
    tasks: [
      { id: 't-402', tenant: '群:话题:@u:!r1:sess-1:matrix', session_id: null },
      { id: 't-407', tenant: null, session_id: 'sess-2' },
    ],
  }
  return { state, useKanbanStore: () => state }
})
vi.mock('@/stores/hermes/kanban', () => ({ useKanbanStore: kanbanStubs.useKanbanStore }))

const workspaceStubs = vi.hoisted(() => ({ state: { tasks: [] }, useWorkspaceStore: () => workspaceStubs.state }))
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: workspaceStubs.useWorkspaceStore }))

const loopStubs = vi.hoisted(() => {
  const state = {
    loops: [{
      id: 'lp-1', name: 'release-pipeline', goal: '', stopCondition: '', pattern: 'daily-triage',
      schedule: { mode: 'manual' }, stage: 'validation', status: 'awaiting-review',
      autonomyLevel: 'L2', stateAdapter: 'local',
      createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-19T14:00:00Z',
      lastTickAt: null, nextTickAt: null,
      stats: { totalIterations: 3, tasksDiscovered: 4, tasksCompleted: 2, tasksBlocked: 0, totalCost: 0, currentIteration: 3 },
    }],
  }
  return { state, useLoopStore: () => state }
})
vi.mock('@/custom/loop/store/loop', () => ({ useLoopStore: loopStubs.useLoopStore }))

const registryStubs = vi.hoisted(() => {
  const state = {
    duties: { '!r2:host': { assigneeKind: 'account', assigneeId: '@tl:host', roomName: '值班室', updatedBy: '', updatedAt: '' } },
    accounts: [{ userId: '@tl:host', displayName: 'TL', agentTeams: [{ slug: 'swarm', name: 'swarm', profiles: ['p'] }], isLeader: true, declared: true as const }],
  }
  return { state, useTeamRegistryStore: () => state }
})
vi.mock('@/custom/matrix-teams/stores/team-registry', () => ({ useTeamRegistryStore: registryStubs.useTeamRegistryStore }))

import FlowNavPanel from '../components/flow/FlowNavPanel.vue'
import WorkbenchView from '../views/WorkbenchView.vue'
import { useFlowStore } from '../store/flow'
import type { FlowLoopRow, FlowSessionRow } from '../adapters/flow'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

const SESSIONS: FlowSessionRow[] = [
  { kind: 'room', id: '!r1', name: '应急指挥中心', unread: 2, taskIds: ['t-402'], teamTag: '[已移除]', dutyName: null, lastActivityAt: 200 },
  { kind: 'chat', id: 'c1', name: 'researcher', unread: 0, taskIds: [], teamTag: '', dutyName: null, lastActivityAt: 100 },
]
const LOOPS: FlowLoopRow[] = [
  { kind: 'loop', id: 'lp-1', name: 'release-pipeline', stageIndex: 3, stageTotal: 5, stageTone: 'run', progressPct: 70, statusKey: 'awaitingYou', awaitingYou: true, blocked: false, updatedAt: 1 },
]

describe('FlowNavPanel — 左栏工作流导航（纯交互）', () => {
  function mountPanel(props: { sessions?: FlowSessionRow[]; loops?: FlowLoopRow[]; selection?: { kind: string; id: string } | null } = {}) {
    return mount(FlowNavPanel, {
      props: {
        sessions: props.sessions ?? SESSIONS,
        loops: props.loops ?? LOOPS,
        selection: props.selection ?? null,
      },
    })
  }

  it('分组渲染会话行（未读红点/📋挂接徽章/团队标签）与循环卡（进度%/阶段分段/状态）', () => {
    const w = mountPanel()
    const room = w.find('[data-testid="flow-session-!r1"]')
    expect(room.text()).toContain('应急指挥中心')
    expect(room.find('.flow-nav__unr').text()).toBe('2')
    expect(room.text()).toContain('📋1')
    expect(room.text()).toContain('[已移除]')
    const loop = w.find('[data-testid="flow-loop-lp-1"]')
    expect(loop.text()).toContain('release-pipeline')
    expect(loop.text()).toContain('70%')
    expect(loop.text()).toContain('ia2.loop.status.awaitingYou')
    // 阶段分段：3 done + 1 run + 1 todo
    const segs = loop.findAll('.flow-nav__seg')
    expect(segs).toHaveLength(5)
    expect(segs[0].classes()).toContain('flow-nav__seg--done')
    expect(segs[3].classes()).toContain('flow-nav__seg--run')
    expect(segs[4].classes()).toContain('flow-nav__seg--todo')
  })

  it('过滤 chips 与搜索框联动（会话/循环互斥、任务号匹配）', async () => {
    const w = mountPanel()
    await w.find('[data-testid="flow-filter-loop"]').trigger('click')
    expect(w.find('[data-testid="flow-session-!r1"]').exists()).toBe(false)
    expect(w.find('[data-testid="flow-loop-lp-1"]').exists()).toBe(true)
    await w.find('[data-testid="flow-filter-session"]').trigger('click')
    expect(w.find('[data-testid="flow-loop-lp-1"]').exists()).toBe(false)
    await w.find('[data-testid="flow-filter-all"]').trigger('click')
    await w.find('[data-testid="flow-search"]').setValue('t-402')
    expect(w.find('[data-testid="flow-session-!r1"]').exists()).toBe(true)
    expect(w.find('[data-testid="flow-session-c1"]').exists()).toBe(false)
  })

  it('行点击 emit select；空态渲染', async () => {
    const w = mountPanel()
    await w.find('[data-testid="flow-session-!r1"]').trigger('click')
    expect(w.emitted('select')![0][0]).toEqual({ kind: 'room', id: '!r1' })
    await w.find('[data-testid="flow-loop-lp-1"]').trigger('click')
    expect(w.emitted('select')![1][0]).toEqual({ kind: 'loop', id: 'lp-1' })
    const empty = mountPanel({ sessions: [], loops: [] })
    expect(empty.find('[data-testid="flow-empty"]').exists()).toBe(true)
  })

  it('栏底动作：内联新建（输入+确认 emit create-room）、＋新循环、⚙管理', async () => {
    const w = mountPanel()
    await w.find('[data-testid="flow-new-session"]').trigger('click')
    await w.find('[data-testid="flow-create-input"]').setValue('新房间')
    await w.find('[data-testid="flow-create-ok"]').trigger('click')
    expect(w.emitted('create-room')![0][0]).toBe('新房间')
    await w.find('[data-testid="flow-new-loop"]').trigger('click')
    expect(w.emitted('new-loop')).toHaveLength(1)
    await w.find('[data-testid="flow-gov"]').trigger('click')
    expect(w.emitted('open-gov')).toHaveLength(1)
  })
})

describe('WorkbenchView — 装配（行构建/默认选择/路由跳转）', () => {
  function makeRouter(): Router {
    return createRouter({
      history: createMemoryHistory(),
      routes: [{
        path: '/app',
        children: [
          { path: '', name: 'ia2.collab', component: WorkbenchView },
          { path: 's/chat/:sessionId', name: 'ia2.collabSession', component: WorkbenchView },
          { path: 's/room/:roomId', name: 'ia2.commsRoom', component: WorkbenchView },
          { path: 'l/:loopId', name: 'ia2.loopCanvas', component: WorkbenchView },
          { path: 'eng', name: 'ia2.eng', component: { template: '<div class="eng-stub" />' } },
        ],
        component: { template: '<router-view />' },
      }],
    })
  }

  async function mountAt(path: string) {
    const router = makeRouter()
    router.push(path)
    await router.isReady()
    const wrapper = mount(WorkbenchView, { global: { plugins: [router] } })
    await flushPromises()
    return { wrapper, router }
  }

  it('默认选择=最近活动会话（房间 rank 领先）→ flow store 同步；挂接/未读/duty 团队徽章', async () => {
    const { wrapper } = await mountAt('/app')
    const flow = useFlowStore()
    // 房间 rank = now - i*1000（now ≈ Date.now() ≫ 会话 updatedAt 3000），首房间居首
    expect(flow.selected).toEqual({ kind: 'room', id: '!r1:host' })
    // 挂接徽章：!r1 关联 t-402（tenant 六段式 roomId 段）
    const row = wrapper.find('[data-testid="flow-session-!r1:host"]')
    expect(row.text()).toContain('📋1')
    expect(row.find('.flow-nav__unr').text()).toBe('2')
    // duty 团队标签：!r2 的值守 TL(@tl:host) → 其 agentTeam slug swarm
    expect(wrapper.find('[data-testid="flow-session-!r2:host"]').text()).toContain('swarm')
  })

  it('点击会话/循环行 → 路由子路径；中栏画布按选择分派', async () => {
    const { wrapper, router } = await mountAt('/app')
    await wrapper.find('[data-testid="flow-session-!r2:host"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.commsRoom')
    expect(router.currentRoute.value.params.roomId).toBe('!r2:host')
    await wrapper.find('[data-testid="flow-session-sess-1"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.collabSession')
    expect(router.currentRoute.value.params.sessionId).toBe('sess-1')
    await wrapper.find('[data-testid="flow-loop-lp-1"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.loopCanvas')
    expect(wrapper.find('[data-testid="wb-canvas-loop"]').exists()).toBe(true)
  })

  it('＋新循环 → /app/eng；⚙管理 → flow.govOpen', async () => {
    const { wrapper, router } = await mountAt('/app')
    await wrapper.find('[data-testid="flow-new-loop"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.eng')
    const { wrapper: w2 } = await mountAt('/app')
    await w2.find('[data-testid="flow-gov"]').trigger('click')
    expect(useFlowStore().govOpen).toBe(true)
  })
})
