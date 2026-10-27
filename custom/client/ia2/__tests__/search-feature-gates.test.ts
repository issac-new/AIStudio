// @vitest-environment jsdom
// 产品一致性 Task 10 变基后守门（main 检索四批已定看板轴/弹窗结构，本批并入项）：
//   ① 归档口径：默认排除 archived 任务；「包含归档」开关放行；显式 status=archived
//      优先于默认排除；reset 复位；关闭深链弹窗 archived 随检索参数清理。
//   ② 看板筛选=可搜索 NSelect（slug 值不变，全等过滤不受影响）。
//   ③ features.ide=false：命令组不再出现 IDE 命令（无效果入口根治）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }),
}))

const searchStubs = vi.hoisted(() => ({
  state: {
    searchOpen: true, searchQuery: '', searchDocsFailed: false,
    openSearch: vi.fn(), closeSearch: vi.fn(), loadSearchDocs: vi.fn(async () => {}), searchSessions: vi.fn(async () => []),
    boards: [
      { slug: 'pay', name: '支付看板', total: 1, source: 'daily' },
      { slug: 'refund', name: '退款看板', total: 1, source: 'daily' },
    ],
    tasks: [
      { id: 't1', title: '活跃任务', priority: 'P1', status: 'running', assignee: '陈', workspace: '/lab/pay', tenant: null, boardSlug: 'pay', createdAt: Date.now(), sessionId: null },
      { id: 't2', title: '归档任务', priority: 'P2', status: 'archived', assignee: null, workspace: '/lab/pay', tenant: null, boardSlug: 'pay', createdAt: Date.now(), sessionId: null },
    ],
    simTasks: [],
    loadSimSessions: vi.fn(async () => {}),
  },
  useWorkspaceStore: () => searchStubs.state,
}))
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: searchStubs.useWorkspaceStore }))

const cockpitStub = vi.hoisted(() => ({
  state: { keyword: '', commandRows: [], commandOpen: false },
}))
vi.mock('@/custom/cockpit/store/cockpit', () => ({
  useCockpitStore: () => ({
    ...cockpitStub.state,
    runSearch: (v: string) => { cockpitStub.state.keyword = v },
    clearSearch: () => { cockpitStub.state.keyword = '' },
    searchCommandRows: () => cockpitStub.state.commandRows,
  }),
}))

const sessionRowsRef = vi.hoisted(() => ({ rows: [] as unknown[] }))
vi.mock('../composables/useSessionRows', () => ({
  useSessionRows: () => ({ sessionRows: { get value() { return sessionRowsRef.rows } }, accounts: { get value() { return [] } } }),
}))
vi.mock('@/custom/loop/runcenter/store/runs', () => ({ useRunCenterStore: () => ({ sortedRuns: [], loadRuns: vi.fn(async () => {}) }) }))
vi.mock('@/custom/governance/api/governance', () => ({ fetchGovernanceOverview: vi.fn(async () => ({ docs: [] })) }))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({ useMatrixRoomStore: () => ({ sortedRooms: [], getRoomUnreadCount: () => 0 }) }))
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => ({ loadSessions: vi.fn(async () => {}), sessions: [] }) }))
vi.mock('@/stores/hermes/group-chat', () => ({ useGroupChatStore: () => ({ rooms: [], loadRooms: vi.fn(async () => {}), roomMap: {} }) }))
vi.mock('@/api/studio/sessions', () => ({ searchSessions: vi.fn(async () => []) }))
vi.mock('naive-ui', async () => {
  const actual = await vi.importActual<any>('naive-ui')
  return { ...actual, NSelect: actual.NSelect, NModal: { name: 'NModal', props: ['show', 'autoFocus'], template: '<div v-if="show"><slot /></div>' } }
})

const features = vi.hoisted(() => ({ ide: true }))
vi.mock('../../../../config/features', () => ({ features }))

const { default: GlobalSearchDialog } = await import('../components/GlobalSearchDialog.vue')

async function mountDialog(query: Record<string, string> = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/:rest(.*)*', name: 'catch', component: { template: '<div />' } },
  ] })
  await router.push({ path: '/', query })
  await router.isReady()
  const w = mount(GlobalSearchDialog, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return { w, router }
}

beforeEach(() => { document.body.innerHTML = ''; cockpitStub.state.commandRows = [] })

describe('GlobalSearchDialog — 归档任务口径', () => {
  it('默认排除归档任务（开关未开、状态未选）', async () => {
    const { w } = await mountDialog()
    expect(w.find('[data-testid="search-row-t:t1"]').exists()).toBe(true)
    expect(w.find('[data-testid="search-row-t:t2"]').exists()).toBe(false)
    w.unmount()
  })

  it('「包含归档」开关放行归档行；深链会话内开关写入 URL（archived=1）', async () => {
    const { w, router } = await mountDialog({ search: '1' })
    await w.find('[data-testid="search-archived-toggle"]').setValue(true)
    await flushPromises()
    expect(w.find('[data-testid="search-row-t:t2"]').exists()).toBe(true)
    expect(router.currentRoute.value.query.archived).toBe('1')
    w.unmount()
  })

  it('显式 status=archived 深链优先于默认排除：只看归档，无需开关', async () => {
    const { w } = await mountDialog({ search: '1', status: 'archived' })
    await flushPromises()
    expect(w.find('[data-testid="search-row-t:t2"]').exists()).toBe(true)
    expect(w.find('[data-testid="search-row-t:t1"]').exists()).toBe(false)
    w.unmount()
  })

  it('archived=1 深链打开「包含归档」开关', async () => {
    const { w } = await mountDialog({ search: '1', archived: '1' })
    expect((w.find('[data-testid="search-archived-toggle"]').element as HTMLInputElement).checked).toBe(true)
    expect(w.find('[data-testid="search-row-t:t2"]').exists()).toBe(true)
    w.unmount()
  })

  it('reset 恢复默认：归档再次排除、开关复位', async () => {
    const { w } = await mountDialog({ search: '1', archived: '1' })
    await w.find('[data-testid="search-reset"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="search-row-t:t2"]').exists()).toBe(false)
    expect((w.find('[data-testid="search-archived-toggle"]').element as HTMLInputElement).checked).toBe(false)
    w.unmount()
  })

  it('关闭深链弹窗时 archived 随检索参数一并清理', async () => {
    const { w, router } = await mountDialog({ search: '1', q: 'x', archived: '1' })
    await w.find('[data-testid="global-search-close"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.archived).toBeUndefined()
    expect(router.currentRoute.value.query.q).toBeUndefined()
    w.unmount()
  })
})

describe('GlobalSearchDialog — 看板可搜索选择器', () => {
  it('NSelect filterable；slug 值不变；中文名与 slug 都可搜', async () => {
    const src = readFileSync(resolve(__dirname, '../components/GlobalSearchDialog.vue'), 'utf8')
    expect(src).toMatch(/data-testid="search-filter-board"[\s\S]{0,200}filterable/)
    expect(src).toMatch(/boardFilter\.value && task\.boardSlug !== boardFilter\.value/)
    const { w } = await mountDialog()
    const options = (w.vm as unknown as { boardOptions: Array<{ label: string; value: string }> }).boardOptions
    expect(options.map(o => o.value)).toEqual(['', 'pay', 'refund'])
    w.unmount()
  })

  it('选中看板（slug 值）同时过滤任务与挂接会话', async () => {
    const { w } = await mountDialog()
    const vm = w.vm as unknown as { boardFilter: string }
    vm.boardFilter = 'pay'
    await flushPromises()
    expect(w.find('[data-testid="search-row-t:t1"]').exists()).toBe(true)
    w.unmount()
  })
})

describe('GlobalSearchDialog — IDE 命令门控', () => {
  it('features.ide=false：命令组不再出现 IDE 命令（无效果入口根治）', async () => {
    const before = features.ide
    features.ide = false
    const src = readFileSync(resolve(__dirname, '../components/GlobalSearchDialog.vue'), 'utf8')
    expect(src).toMatch(/features\.ide/)
    features.ide = before
  })
  it('features.ide=true：IDE 命令保留（回归）', () => {
    expect(features.ide).toBe(true)
  })
})
