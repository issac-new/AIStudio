// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/collab-scene.test.ts
// 协作场景守门（2026-09-18 统一导航重构 Task 3）：旧 AI协作中心（CockpitView
// 三栏）迁入 /app/collab。断言：
//   三栏（看板/协作图+时序流/工作区）渲染；CockpitTopBar 与 LoopModal 已拆
//   （页头/弹窗上移 IaShell）；isCollabEmbedRoute 纯函数词表；右栏 router-view
//   vs cockpit 工作区切换；场景内 slim 工具条（日程 + Run Observatory）；
//   看板 enter-center 跳 ia2.tasks；场景自身不再 bootstrap（壳级已武装）。
// cockpit 子组件全部桩化（真实组件拖 kanban/matrix 重依赖）；vue-router 桩化，
// routeState.name 响应式驱动嵌入判定。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// ── 响应式路由/导航桩（route.name 变化须驱动场景 computed 重算，故用 reactive）──
const { routeState, pushMock } = await vi.hoisted(async () => {
  const { reactive } = await import('vue')
  const state = reactive({ name: 'ia2.collab' as string | null })
  return { routeState: state, pushMock: vi.fn() }
})
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
  useRoute: () => routeState,
}))

// ── cockpit store 桩（场景读态 + 动作；bootstrap 必须不被场景调用）──
const cockpitStubs = vi.hoisted(() => ({
  state: {
    collapsed: { left: false, mid: false, right: false },
    maximized: { left: false, mid: false, right: false },
    midTopCollapsed: false,
    midBottomCollapsed: false,
    workspaceMode: 'work',
    archivedMode: false,
    historyOpen: false,
    templateManagerOpen: false,
    titleDetailOpen: false,
    titleDetailTitle: '任务标题',
    titleDetailText: '',
    kanbanDetailOpen: false,
    kanbanDetailTask: null,
    detailExpanded: false,
    swarmKanbanVisible: false,
    toggleCollapsed: vi.fn(),
    toggleMaximized: vi.fn(),
    toggleMidTop: vi.fn(),
    toggleMidBottom: vi.fn(),
    closeHistory: vi.fn(),
    closeTemplateManager: vi.fn(),
    closeTitleDetail: vi.fn(),
    closeKanbanDetail: vi.fn(),
    submitWorkItem: vi.fn(),
    openRunTraceGlobal: vi.fn(),
    bootstrap: vi.fn(),
  },
}))
vi.mock('@/custom/cockpit/store/cockpit', () => ({
  useCockpitStore: () => cockpitStubs.state,
}))

// ── workspace store 桩（日程弹窗开关在壳级，场景只发 openSchedule）──
const workspaceStubs = vi.hoisted(() => ({
  state: { scheduleOpen: false, openSchedule: vi.fn() },
}))
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: () => workspaceStubs.state }))

// ── cockpit 子组件桩（装配断言不拉真实组件链；工厂经 vi.hoisted 提升）──
const { stub } = vi.hoisted(() => ({
  stub: (name: string, cls: string) => ({
    default: { name, template: `<div class="${cls}" />` },
  }),
}))
vi.mock('@/custom/cockpit/components/CockpitAttention.vue', () => stub('CockpitAttention', 'attention-stub'))
vi.mock('@/custom/cockpit/components/CockpitKanban.vue', () => ({
  default: {
    name: 'CockpitKanban',
    emits: ['enter-center', 'maximize', 'fold'],
    template: '<div class="kanban-stub"><button type="button" data-testid="kanban-enter" @click="$emit(\'enter-center\')" /></div>',
  },
}))
vi.mock('@/custom/cockpit/components/CockpitColumnRail.vue', () => stub('CockpitColumnRail', 'rail-stub'))
vi.mock('@/custom/cockpit/components/CockpitCollabMap.vue', () => stub('CockpitCollabMap', 'collabmap-stub'))
vi.mock('@/custom/cockpit/components/CockpitTimeline.vue', () => stub('CockpitTimeline', 'timeline-stub'))
vi.mock('@/custom/cockpit/components/CockpitWorkspace.vue', () => stub('CockpitWorkspace', 'workspace-stub'))
vi.mock('@/custom/cockpit/components/CockpitModeBar.vue', () => stub('CockpitModeBar', 'modebar-stub'))
vi.mock('@/custom/cockpit/components/CockpitCollabBar.vue', () => stub('CockpitCollabBar', 'collabbar-stub'))
vi.mock('@/custom/cockpit/components/CockpitTerminalPane.vue', () => stub('CockpitTerminalPane', 'terminal-stub'))
vi.mock('@/custom/cockpit/components/CockpitFilePanel.vue', () => stub('CockpitFilePanel', 'filepanel-stub'))
vi.mock('@/custom/cockpit/components/CockpitHistoryModal.vue', () => stub('CockpitHistoryModal', 'history-stub'))
vi.mock('@/custom/cockpit/components/CockpitTemplateManager.vue', () => stub('CockpitTemplateManager', 'templates-stub'))
vi.mock('@/custom/cockpit/components/CockpitFleetGrid.vue', () => stub('CockpitFleetGrid', 'fleet-stub'))
vi.mock('@/custom/kanban/views/SwarmKanbanView.vue', () => stub('SwarmKanbanView', 'swarm-stub'))

import CollabScene from '../views/scenes/CollabScene.vue'
import { isCollabEmbedRoute, COLLAB_EMBED_ROUTE_NAMES } from '../views/scenes/collab-embed-routes'

function mountScene() {
  return mount(CollabScene, { global: { stubs: { 'router-view': true } } })
}

describe('CollabScene — cockpit 三栏迁入 /app/collab', () => {
  beforeEach(() => {
    routeState.name = 'ia2.collab'
    pushMock.mockClear()
    workspaceStubs.state.openSchedule.mockClear()
    cockpitStubs.state.openRunTraceGlobal.mockClear()
    cockpitStubs.state.bootstrap.mockClear()
  })

  it('三栏渲染（左看板 / 中协作图+时序流 / 右工作区），注意力条保留', () => {
    const w = mountScene()
    expect(w.find('[data-testid="scene-collab"]').exists()).toBe(true)
    expect(w.find('.cockpit-col--left .kanban-stub').exists()).toBe(true)
    expect(w.find('.cockpit-col--mid .collabmap-stub').exists()).toBe(true)
    expect(w.find('.cockpit-col--mid .timeline-stub').exists()).toBe(true)
    expect(w.find('.cockpit-col--right .modebar-stub').exists()).toBe(true)
    expect(w.find('.attention-stub').exists()).toBe(true)
    w.unmount()
  })

  it('CockpitTopBar 与 LoopModal 已拆（页头/弹窗上移壳级）', () => {
    const w = mountScene()
    expect(w.find('.cockpit-top').exists()).toBe(false)
    expect(w.find('.loop-modal').exists()).toBe(false)
    w.unmount()
  })

  it('场景自身不 bootstrap（武装已上移 IaShell）', () => {
    const w = mountScene()
    expect(cockpitStubs.state.bootstrap).not.toHaveBeenCalled()
    w.unmount()
  })

  it('isCollabEmbedRoute：ia2.collab* 六名 + groupChat/workflow 保留集为 true', () => {
    expect(COLLAB_EMBED_ROUTE_NAMES.size).toBe(9)
    for (const name of [
      'ia2.collabChat', 'ia2.collabSession',
      'ia2.collabHistory', 'ia2.collabHistorySession',
      'ia2.collabGlobalAgent', 'ia2.collabGlobalAgentSession',
      'hermes.groupChat', 'hermes.groupChatRoom', 'hermes.workflow',
    ]) {
      expect(isCollabEmbedRoute(name), `${name} 应为嵌入路由`).toBe(true)
    }
  })

  it('isCollabEmbedRoute：其他场景/已迁走旧名为 false', () => {
    for (const name of ['ia2.collab', 'ia2.overview', 'ia2.tasks', 'ia2.comms', 'ia2.commsRoom']) {
      expect(isCollabEmbedRoute(name), `${name} 非嵌入路由`).toBe(false)
    }
    expect(isCollabEmbedRoute(null)).toBe(false)
    expect(isCollabEmbedRoute(undefined)).toBe(false)
  })

  it('嵌入子路由时右栏渲染 router-view 容器，否则渲染 cockpit 工作区', async () => {
    const w = mountScene()
    // ia2.collab（场景首页）→ cockpit 原生工作区（work 模式）
    expect(w.find('.cockpit-embed-view').exists()).toBe(false)
    expect(w.find('.cockpit-col--right .workspace-stub').exists()).toBe(true)
    // 嵌入 chat 页 → router-view 容器
    routeState.name = 'ia2.collabChat'
    await w.vm.$nextTick()
    expect(w.find('.cockpit-embed-view').exists()).toBe(true)
    expect(w.find('.cockpit-col--right .workspace-stub').exists()).toBe(false)
    w.unmount()
  })

  it('slim 工具条：日程 → workspace.openSchedule；Run Observatory → openRunTraceGlobal', async () => {
    const w = mountScene()
    const tools = w.find('[data-testid="collab-tools"]')
    expect(tools.exists()).toBe(true)
    await w.find('[data-testid="collab-schedule"]').trigger('click')
    expect(workspaceStubs.state.openSchedule).toHaveBeenCalledTimes(1)
    await w.find('[data-testid="collab-runtrace"]').trigger('click')
    expect(cockpitStubs.state.openRunTraceGlobal).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('看板 enter-center → 跳工作项场景（ia2.tasks）', async () => {
    const w = mountScene()
    await w.find('[data-testid="kanban-enter"]').trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'ia2.tasks' })
    w.unmount()
  })
})
