// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/ia-shell-header.test.ts
// 驾驶舱统一壳页头守门（2026-09-18 统一导航重构 Task 2）：
// IaShellHeader = CockpitTopBar 裁剪迁移——品牌（连接点 + ia2.brand）/全局搜索/
// Gateway 探测组（倒计时+详情面板）/主题/通知/日程/用户；
// v12.2（2026-09-20）：固定最右 IaViewSwitcher 二视图切换器（⇄IDE 跳转按钮退役）。
// v12.3（2026-09-20 用户裁定）页头四改：① IaLocaleToggle ZH/EN 直切（LanguageSwitch
// 下拉退役）；② 恢复 📅 日程按钮（当日徽章）；③ 通知改下拉双页签（NotifyDropdownPanel，
// 铃铛徽章 = useDecisionRows 待决策未读数）；④ 六态势 chips 迁入（SitlineBar）。
// 重依赖桩化：composables（态势/决策聚合拉 chat/matrix/team 上游链）、IaWindowControls
// （栏控依赖 ide store）、IaLocaleToggle（upstream switchLocale）；NotifyDropdownPanel
// 用真组件——铃铛开合即本文件守门。fetch mock 写法参照 cockpit-topbar-health.test.ts；
// i18n 走全局 setup mock（t 直返 key）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const pushMock = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
  useRoute: () => ({ path: '/app', fullPath: '/app', query: {} }),
}))

// cockpit store 桩：可变状态（日程徽章用例逐例覆写 scheduleDatesWithEvents）
const cockpitStubs = vi.hoisted(() => {
  const state = {
    searchQuery: '', runSearch: vi.fn(), clearSearch: vi.fn(), _sessionSearching: false,
    inboxItems: [] as unknown[], fleetSessions: [] as unknown[],
    scheduleDatesWithEvents: new Set<string>(),
  }
  return { state, useCockpitStore: () => state }
})
vi.mock('@/custom/cockpit/store/cockpit', () => ({ useCockpitStore: cockpitStubs.useCockpitStore }))
// workspace store 桩：真 store 会拉上游 router 链（登录守卫），此间只验页头
const workspaceStubs = vi.hoisted(() => {
  const state = {
    tasks: [] as Array<{ id: string; title: string; status: string; assignee: string | null; createdAt: number }>,
    scheduleOpen: false,
  }
  return {
    state,
    useWorkspaceStore: () => ({
      get tasks() { return state.tasks },
      get scheduleOpen() { return state.scheduleOpen },
      openSchedule() { state.scheduleOpen = true },
      closeSchedule() { state.scheduleOpen = false },
    }),
  }
})
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: workspaceStubs.useWorkspaceStore }))
vi.mock('@/stores/hermes/app', () => ({ useAppStore: () => ({ connected: true }) }))
vi.mock('@/components/layout/ThemeSwitch.vue', () => ({ default: { name: 'ThemeSwitch', template: '<span class="theme-stub" />' } }))
vi.mock('../components/IaLocaleToggle.vue', () => ({
  default: { name: 'IaLocaleToggle', template: '<span class="locale-stub" data-testid="ia-locale-toggle" />' },
}))
// 栏控簇依赖 ide store + wm/popout，此间桩化（自身守门在 unified-nav-guard）
vi.mock('../components/IaWindowControls.vue', () => ({
  default: { name: 'IaWindowControls', template: '<div class="wm-stub" data-testid="ia-window-controls" />' },
}))

// v12.3 页头四改的重数据面桩化：态势/会话/决策聚合 + 决策动作
vi.mock('@/custom/ia2/composables/useSitCounts', () => ({
  useSitCounts: () => ({
    waitItems: { value: [] },
    tasks: { total: 0, running: 0, review: 0 },
    sessionCount: { value: 0 },
    loopTotal: { value: 0 },
    loopBlocked: { value: 0 },
    loopRows: { value: [] },
    accounts: { value: [] },
    online: { people: 0, agents: 0, machines: 0 },
    oldestWaitLabel: { value: '' },
  }),
}))
vi.mock('@/custom/ia2/composables/useSessionRows', () => ({
  useSessionRows: () => ({ sessionRows: { value: [] } }),
}))
vi.mock('@/custom/ia2/composables/useDecisionRows', async () => {
  const { ref } = await import('vue')
  return {
    useDecisionRows: () => ({
      decisionRows: ref([]),
      decisionIds: ref([]),
      decisionUnread: ref(3),
      gateRows: ref([]),
    }),
  }
})
vi.mock('@/custom/ia2/composables/useDecisionActions', () => ({
  useDecisionActions: () => ({ approveTask: vi.fn(), rejectTask: vi.fn(), approveRun: vi.fn(), approveFleet: vi.fn() }),
}))
// NotifyDropdownPanel 直接引用评审中心（sendVerdict）；徽章/行数据经 useDecisionRows 桩
vi.mock('@/custom/matrix-teams/stores/review-center', () => ({
  useReviewCenterStore: () => ({ pendingReviews: [], sendVerdict: vi.fn() }),
}))

import IaShellHeader from '../components/IaShellHeader.vue'
import { setActivePinia, createPinia } from 'pinia'

// 页头真 store：flow/workspace/notify-read/platforms（pinia 激活即可，无外呼）
setActivePinia(createPinia())

function mockHealth(payload: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => payload })))
}

async function mountHeader() {
  mockHealth({ gateway_state: 'running', loaded_platforms: {} })
  const w = mount(IaShellHeader, {
    props: { userName: 'tester' },
    // RouterLink 桩：视图切换器双入口 router-link 不拉真路由器（保留插槽文案）
    global: { stubs: { CockpitIcon: true, RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
  })
  await w.vm.$nextTick()
  return w
}

function todayKey(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

describe('IaShellHeader — 统一壳页头', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    pushMock.mockClear()
    cockpitStubs.state.scheduleDatesWithEvents = new Set()
    cockpitStubs.state.inboxItems = []
  })

  it('品牌：连接点 + ia2.brand 文案（无 Swarm Studio 字样）；ZH/EN 直切在位（v12.3）', async () => {
    const w = await mountHeader()
    expect(w.text()).toContain('ia2.brand')
    expect(w.text()).not.toContain('Swarm Studio')
    expect(w.find('[data-testid="ia-locale-toggle"]').exists()).toBe(true)
    w.unmount()
  })

  it('v12.2 视图切换器固定最右（沟通协作 | IDE 工作台，⇄IDE 跳转按钮退役）', async () => {
    const w = await mountHeader()
    expect(w.find('[data-testid="ia-header-ide"]').exists()).toBe(false)
    const row = w.find('[data-testid="ia-viewswitch-row"]')
    expect(row.exists()).toBe(true)
    expect(row.find('[data-testid="ia-scene-collab"]').exists()).toBe(true)
    expect(row.find('[data-testid="ia-scene-ide"]').exists()).toBe(true)
    expect(row.text()).toContain('ia2.nav.collab')
    expect(row.text()).toContain('ia2.shell.gotoIde')
    w.unmount()
  })

  it('v12.3 通知下拉：铃铛徽章 = 待决策未读数；点击开下拉双页签，× 关闭', async () => {
    const w = await mountHeader()
    const btn = w.find('[data-testid="ia-header-notify"]')
    expect(btn.exists()).toBe(true)
    expect(w.find('[data-testid="ia-header-notify-badge"]').text()).toBe('3')
    expect(w.find('[data-testid="notify-dropdown"]').exists()).toBe(false)
    await btn.trigger('click')
    expect(w.find('[data-testid="notify-dropdown"]').exists()).toBe(true)
    expect(w.find('[data-testid="notify-tab-decisions"]').exists()).toBe(true)
    expect(w.find('[data-testid="notify-tab-messages"]').exists()).toBe(true)
    await w.find('[data-testid="notify-close"]').trigger('click')
    expect(w.find('[data-testid="notify-dropdown"]').exists()).toBe(false)
    w.unmount()
  })

  it('v12.3 日程按钮：当日有事件亮徽章，点击开日程模态（workspace.openSchedule）', async () => {
    cockpitStubs.state.scheduleDatesWithEvents = new Set([todayKey()])
    const w = await mountHeader()
    const btn = w.find('[data-testid="ia-header-schedule"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('ia2.header.scheduleToday')
    expect(workspaceStubs.state.scheduleOpen).toBe(false)
    await btn.trigger('click')
    expect(workspaceStubs.state.scheduleOpen).toBe(true)
    w.unmount()
  })

  it('用户按钮跳 hermes.settings（avatar = userName 首字符）', async () => {
    const w = await mountHeader()
    const btn = w.find('[data-testid="ia-header-user"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('tester')
    await btn.trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'hermes.settings' })
    w.unmount()
  })

  it('Gateway 探测区渲染（/agent-health/detailed → running 投影）', async () => {
    const w = await mountHeader()
    const grp = w.find('.cockpit-top__grp')
    expect(grp.exists()).toBe(true)
    expect(grp.text()).toContain('Gateway')
    await vi.waitFor(() => {
      expect(w.find('.cockpit-top__grp .cockpit-top__ustat.is-running').exists()).toBe(true)
    })
    w.unmount()
  })
})
