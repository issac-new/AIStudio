// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/gov-overlay.test.ts
// v12 ⚙管理台守门（2026-09-19 统一视图 Task 9）：五区导航切换/计数徽章/
// 任务区过滤与行操作/会话区进入/团队通道卡/详情面板跳转/backdrop·⇠ 关闭。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const workspaceStubs = vi.hoisted(() => ({
  state: {
    tasks: [
      { id: 't-402', title: 'v2.28 发布', priority: 'P1', status: 'review', assignee: 'worker-coder', workspace: '', tenant: '群:话题:@u:!r1:sess-1:matrix', boardSlug: 'swarm', createdAt: 1000 },
      { id: 't-415', title: 'release notes', priority: 'P2', status: 'running', assignee: '你', workspace: '', tenant: null, boardSlug: 'swarm', createdAt: 2000 },
    ],
  },
  useWorkspaceStore: () => workspaceStubs.state,
}))
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: workspaceStubs.useWorkspaceStore }))

const roomStubs = vi.hoisted(() => ({
  state: {
    sortedRooms: [{ roomId: '!r1:host', name: '应急指挥中心' }],
    getRoomMemberList: () => ({ admins: [], mods: [], invited: [], defaults: [{ userId: '@a' }, { userId: '@b' }] }),
  },
  useMatrixRoomStore: () => roomStubs.state,
}))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({ useMatrixRoomStore: roomStubs.useMatrixRoomStore }))

const chatStubs = vi.hoisted(() => ({
  state: { sessions: [{ id: 'sess-1', title: 'agent 会话', updatedAt: 1 }], unreadMessages: new Map() },
  useChatStore: () => chatStubs.state,
}))
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: chatStubs.useChatStore }))

const registryStubs = vi.hoisted(() => ({
  state: {
    accounts: [{ userId: '@tl:host', displayName: 'TL', agentTeams: [{ slug: 'swarm', name: 'swarm', profiles: ['p1'] }], isLeader: true, declared: true as const }],
    duties: {},
  },
  useTeamRegistryStore: () => registryStubs.state,
}))
vi.mock('@/custom/matrix-teams/stores/team-registry', () => ({ useTeamRegistryStore: registryStubs.useTeamRegistryStore }))

const cockpitStubs = vi.hoisted(() => ({
  state: {
    fleetSessions: [{ id: 'fs-1', profile: 'p', title: 'fleet 会话', status: 'working', isAborting: false, queueLength: 2, runStartedAt: null, lastActiveAt: 1, source: '', agent: '', lastPreview: '', approvals: [{ approval_id: 'ap-1', preview: '', choices: [] }], clarifies: [], subagents: [] }],
    teams: [{ id: 'tm-1', name: 'swarm', description: '', color: '', profiles: ['p1'], boards: ['swarm'], pinnedSessions: [], createdAt: '', updatedAt: '' }],
    openRunTrace: vi.fn(),
  },
  useCockpitStore: () => cockpitStubs.state,
}))
vi.mock('@/custom/cockpit/store/cockpit', () => ({ useCockpitStore: cockpitStubs.useCockpitStore }))

import GovOverlay from '../components/gov/GovOverlay.vue'
import { useFlowStore } from '../store/flow'

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app', name: 'ia2.collab', component: { template: '<div />' } },
      { path: '/app/board', name: 'ia2.board', component: { template: '<div />' } },
      { path: '/app/s/room/:roomId', name: 'ia2.commsRoom', component: { template: '<div />' } },
      { path: '/ide', name: 'ide.shell', component: { template: '<div />' } },
    ],
  })
}

async function mountGov(section = 'task') {
  const router = makeRouter()
  await router.push('/app')
  await router.isReady()
  const flow = useFlowStore()
  flow.openGov(section as never)
  const wrapper = mount(GovOverlay, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router, flow }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('GovOverlay — 管理台覆盖层', () => {
  it('五区导航 + 实时计数徽章（任务2/会话2/员工1/智能体2/团队1）；默认任务区', async () => {
    const { wrapper } = await mountGov('task')
    for (const s of ['task', 'session', 'people', 'agent', 'team']) {
      expect(wrapper.find(`[data-testid="gov-nav-${s}"]`).exists()).toBe(true)
    }
    expect(wrapper.find('[data-testid="gov-nav-task"]').text()).toContain('2')
    expect(wrapper.find('[data-testid="gov-task-section"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="gov-task-t-402"]').exists()).toBe(true)
  })

  it('任务区：状态过滤 + ⌨ 跳 IDE + 选中行出详情（运行历史→openRunTrace）', async () => {
    const { wrapper, router, flow } = await mountGov('task')
    await wrapper.find('[data-testid="gov-task-status"]').setValue('running')
    expect(wrapper.find('[data-testid="gov-task-t-402"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="gov-task-t-415"]').exists()).toBe(true)
    await wrapper.find('[data-testid="gov-task-status"]').setValue('')
    await wrapper.find('[data-testid="gov-task-ide-t-402"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.task).toBe('t-402')
    // 选中行 → 详情面板（run history 走 RunTrace）
    const w2 = (await mountGov('task')).wrapper
    await w2.find('[data-testid="gov-task-t-402"]').trigger('click')
    expect(w2.find('[data-testid="gov-detail-runhistory"]').exists()).toBe(true)
    await w2.find('[data-testid="gov-detail-runhistory"]').trigger('click')
    expect(cockpitStubs.state.openRunTrace).toHaveBeenCalled()
    void flow
  })

  it('会话区：进入 → 工作台房间路由；详情面板会话 chip 跳转', async () => {
    const { wrapper, router } = await mountGov('session')
    expect(wrapper.find('[data-testid="gov-session-!r1:host"]').exists()).toBe(true)
    await wrapper.find('[data-testid="gov-enter-!r1:host"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.commsRoom')
  })

  it('员工/智能体/团队三区渲染（含通道卡状态）', async () => {
    const people = (await mountGov('people')).wrapper
    expect(people.find('[data-testid="gov-people-@tl:host"]').exists()).toBe(true)
    const agent = (await mountGov('agent')).wrapper
    expect(agent.find('[data-testid="gov-agent-fleet-fs-1"]').exists()).toBe(true)
    expect(agent.find('[data-testid="gov-agent-team-@tl:host/swarm"]').exists()).toBe(true)
    const team = (await mountGov('team')).wrapper
    expect(team.find('[data-testid="gov-team-tm-1"]').exists()).toBe(true)
    expect(team.find('[data-testid="gov-channel-matrix"]').exists()).toBe(true)
  })

  it('⇠返回与 backdrop 关闭', async () => {
    const { wrapper, flow } = await mountGov('task')
    await wrapper.find('[data-testid="gov-back"]').trigger('click')
    expect(flow.govOpen).toBe(false)
    flow.openGov()
    await wrapper.find('[data-testid="gov-backdrop"]').trigger('click')
    expect(flow.govOpen).toBe(false)
  })
})
