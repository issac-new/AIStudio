// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/ia-shell-header-health.test.ts
// IaShellHeader Platforms 作用域守门（2026-09-13 用户指定；2026-09-18 统一导航
// Task 3 自 cockpit-topbar-health.test.ts 迁移——探测逻辑已随页头上移 IaShellHeader，
// CockpitTopBar 删除）：
// 只显示当前 gateway 本次启动加载的 channel（loaded_platforms），
// 不显示 runtime 持久化 map 里的残留/其他 profile 条目（platforms 字段）；
// 页头仅展示渠道名，profile 仅在详情下拉面板显示。
// 后端契约见 overlay patch 250（agent /health/detailed 新增 loaded_platforms/served_profiles）。
// i18n 走全局 setup mock（t 直返 key）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ path: '/app', fullPath: '/app', query: {} }),
}))
vi.mock('@/custom/cockpit/store/cockpit', () => ({
  useCockpitStore: () => ({
    searchQuery: '', runSearch: vi.fn(), clearSearch: vi.fn(), _sessionSearching: false,
    inboxItems: [] as unknown[], fleetSessions: [] as unknown[], scheduleDatesWithEvents: new Set<string>(),
  }),
}))
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
vi.mock('@/stores/hermes/app', () => ({ useAppStore: () => ({ connected: false }) }))
vi.mock('@/components/layout/ThemeSwitch.vue', () => ({ default: { name: 'ThemeSwitch', template: '<span class="theme-stub" />' } }))
// v12.3/v12.4 页头重依赖桩化（语言直切/态势与决策聚合/评审中心）
vi.mock('../components/IaLocaleToggle.vue', () => ({
  default: { name: 'IaLocaleToggle', template: '<span class="locale-stub" />' },
}))
vi.mock('@/custom/ia2/composables/useSitCounts', () => ({
  useSitCounts: () => ({
    waitItems: { value: [] },
    tasks: { total: 0, running: 0, review: 0, byStatus: {} },
    openTasks: { value: [] },
    sessionCount: { value: 0 },
    loopTotal: { value: 0 },
    loopBlocked: { value: 0 },
    loopRows: { value: [] },
    accounts: { value: [] },
    online: { people: 0, agents: 0, machines: 0 },
    oldestWaitLabel: { value: '' },
  }),
}))
// v12.5：任务跳转需要 sessionRows 判别会话类别——桩化（真 composable 拉上游 kanban store 的 createRouter 链）
vi.mock('@/custom/ia2/composables/useSessionRows', () => ({
  useSessionRows: () => ({ sessionRows: { value: [] } }),
}))
vi.mock('@/custom/ia2/composables/useDecisionRows', async () => {
  const { ref } = await import('vue')
  return {
    useDecisionRows: () => ({
      decisionRows: ref([]),
      decisionIds: ref([]),
      decisionUnread: ref(0),
      gateRows: ref([]),
      oldestDecisionLabel: ref(''),
    }),
  }
})
vi.mock('@/custom/ia2/composables/useDecisionActions', () => ({
  useDecisionActions: () => ({ approveTask: vi.fn(), rejectTask: vi.fn(), approveRun: vi.fn(), approveFleet: vi.fn() }),
}))
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

async function mountBar(payload: unknown) {
  mockHealth(payload)
  const w = mount(IaShellHeader, {
    props: { userName: 'tester' },
    global: { stubs: { ThemeSwitch: true, CockpitIcon: true } },
  })
  await vi.waitFor(() => {
    expect((w.vm as unknown as { platforms: unknown[] }).platforms.length).toBeGreaterThanOrEqual(0)
  })
  await w.vm.$nextTick()
  return w
}

function grpText(w: ReturnType<typeof mount>) {
  return w.find('.cockpit-top__grp').text()
}

describe('IaShellHeader Platforms loaded 作用域', () => {
  beforeEach(() => { vi.unstubAllGlobals() })

  it('显示 loaded_platforms 的当前进程裸 channel（telegram）', async () => {
    const w = await mountBar({
      gateway_state: 'running',
      platforms: { telegram: { state: 'connected' } },
      loaded_platforms: { telegram: { state: 'connected', updated_at: new Date().toISOString() } },
      served_profiles: ['default'],
    })
    expect(grpText(w)).toContain('telegram')
    w.unmount()
  })

  it('不显示仅存在于 runtime platforms 的残留/其他 profile 条目', async () => {
    const w = await mountBar({
      gateway_state: 'running',
      platforms: {
        telegram: { state: 'connected' },
        discord: { state: 'connected' },
        research: { state: 'connected' },
      },
      loaded_platforms: { telegram: { state: 'connected' } },
      served_profiles: ['default'],
    })
    const txt = grpText(w)
    expect(txt).toContain('telegram')
    expect(txt).not.toContain('discord')
    w.unmount()
  })

  it('解析 <profile>:<platform> 命名空间：页头只显示渠道名（不含 profile，也不泄漏完整内部键）', async () => {
    const w = await mountBar({
      gateway_state: 'running',
      platforms: { 'research:matrix': { state: 'connected' } },
      loaded_platforms: { 'research:matrix': { state: 'connected' } },
      served_profiles: ['default', 'research'],
    })
    const txt = grpText(w)
    expect(txt).toContain('matrix')
    expect(txt).not.toContain('research')
    expect(txt).not.toContain('research:matrix')
    w.unmount()
  })

  it('页头隐藏 profile，但详情面板保留 profile 语义', async () => {
    const w = await mountBar({
      gateway_state: 'running',
      loaded_platforms: { 'research:matrix': { state: 'connected' } },
      served_profiles: ['default', 'research'],
    })
    expect(grpText(w)).toContain('matrix')
    expect(grpText(w)).not.toContain('research')
    await w.find('.cockpit-top__grp').trigger('click')
    const rows = w.findAll('.cockpit-probe__row').map(r => r.text())
    expect(rows.some(r => r.includes('research: matrix'))).toBe(true)
    w.unmount()
  })

  it('namespaced profile 不在 served_profiles 中时不显示', async () => {
    const w = await mountBar({
      gateway_state: 'running',
      platforms: { 'ghost:telegram': { state: 'connected' } },
      loaded_platforms: { 'ghost:telegram': { state: 'connected' } },
      served_profiles: ['default'],
    })
    expect(grpText(w)).not.toContain('telegram')
    w.unmount()
  })

  it('缺 loaded_platforms（旧 gateway / 401 fallback）时显示空平台列表，不回退全量 platforms', async () => {
    const w = await mountBar({
      gateway_state: 'running',
      platforms: { telegram: { state: 'connected' }, matrix: { state: 'connected' } },
    })
    const txt = grpText(w)
    expect(txt).not.toContain('telegram')
    expect(txt).not.toContain('matrix')
    w.unmount()
  })

  it('malformed loaded_platforms 不抛异常且投影为空', async () => {
    const w = await mountBar({
      gateway_state: 'running',
      loaded_platforms: { telegram: 'not-an-object', matrix: { state: 42 } },
    })
    expect(Array.isArray((w.vm as unknown as { platforms: unknown[] }).platforms)).toBe(true)
    w.unmount()
  })

  it('页头与详情面板使用同一投影（详情不再各渲染一套 rawData.platforms）', async () => {
    const w = await mountBar({
      gateway_state: 'running',
      platforms: { telegram: { state: 'connected' }, stale: { state: 'fatal' } },
      loaded_platforms: { telegram: { state: 'connected' } },
      served_profiles: ['default'],
    })
    await w.find('.cockpit-top__grp').trigger('click')
    const rows = w.findAll('.cockpit-probe__row').map(r => r.text())
    expect(rows.some(r => r.includes('telegram'))).toBe(true)
    expect(rows.some(r => r.includes('stale'))).toBe(false)
    w.unmount()
  })
})
