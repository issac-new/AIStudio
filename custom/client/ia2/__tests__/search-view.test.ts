// @vitest-environment jsdom
// 全站检索页守门（2026-10-18 左侧栏批）：
//   1) 五类对象分组（会话/任务/运行/文档/人员）；
//   2) 关键词过滤 + 类型页签收敛；
//   3) 工作区过滤同时作用于会话（经挂接任务反查）与任务；
//   4) 行点击直达对象（任务→看板预选）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router, type RouteRecordRaw } from 'vue-router'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }),
}))

const rows = vi.hoisted(() => ({
  sessionRows: [
    { kind: 'room', id: '!a:matrix', name: '支付讨论群', unread: 2, taskIds: ['t1'], teamTag: 'pay', dutyName: null, lastActivityAt: Date.now() },
    { kind: 'chat', id: 'c1', name: 'researcher', unread: 0, taskIds: [], teamTag: '', dutyName: null, lastActivityAt: Date.now() },
  ],
  accounts: [
    { userId: '@alice:matrix', displayName: 'Alice', isLeader: true, agentTeams: [] },
  ],
  tasks: [
    { id: 't1', title: '收银台 BFF 重构', priority: 'P1', status: 'running', assignee: '陈', workspace: '/lab/pay', tenant: null, boardSlug: 'pay', createdAt: Date.now(), sessionId: '!a:matrix' },
    { id: 't2', title: '退款对账', priority: 'P0', status: 'blocked', assignee: '林', workspace: '/lab/refund', tenant: null, boardSlug: 'pay', createdAt: Date.now(), sessionId: null },
  ],
  runs: [
    { runId: 'run21', status: 'running', stage: 'develop', iteration: 3, lastActivityAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ],
  docs: [
    { kind: 'rfd', title: 'RFD-001 结算需求', path: 'docs/rfd-001.md', gate: 'G1', group: 'gate', exists: true, commit: 'abc', committedAt: new Date().toISOString(), lines: 20 },
  ],
}))

vi.mock('../composables/useSessionRows', () => ({
  useSessionRows: () => ({ sessionRows: { value: rows.sessionRows }, accounts: { value: rows.accounts } }),
}))
vi.mock('../store/workspace', () => ({
  useWorkspaceStore: () => ({ tasks: rows.tasks, rawTasks: [] }),
}))
vi.mock('@/custom/loop/runcenter/store/runs', () => ({
  useRunCenterStore: () => ({ sortedRuns: rows.runs }),
}))
vi.mock('@/custom/governance/api/governance', () => ({
  fetchGovernanceOverview: vi.fn(async () => ({ ok: true, docs: rows.docs })),
}))

vi.mock('@/custom/kanban/components/KanbanTaskDrawer.vue', () => ({
  default: {
    props: ['show', 'taskId'],
    template: '<div data-testid="task-drawer-stub" :data-task="taskId" />',
  },
}))

import SearchView from '../views/SearchView.vue'

function makeRouter(initial = '/app/search'): Router {
  const routes: RouteRecordRaw[] = [
    { path: '/app/search', name: 'ia2.search', component: SearchView },
    { path: '/app/board', name: 'ia2.board', component: { template: '<div />' } },
    { path: '/app/sim', name: 'ia2.sim', component: { template: '<div />' } },
    { path: '/app/s/room/:roomId', name: 'ia2.commsRoom', component: { template: '<div />' } },
    { path: '/app/s/chat/:sessionId', name: 'ia2.collabSession', component: { template: '<div />' } },
    { path: '/app/stage/setup', name: 'ia2.stage1', component: { template: '<div />' } },
    { path: '/app/stage/govern', name: 'ia2.stage6', component: { template: '<div />' } },
  ]
  return createRouter({ history: createMemoryHistory(), routes })
}

async function mountSearch(initial = '/app/search') {
  const router = makeRouter(initial)
  await router.push(initial)
  await router.isReady()
  const w = mount(SearchView, { global: { plugins: [router] } })
  await flushPromises()
  return { w, router }
}

beforeEach(() => { localStorage.clear() })

describe('SearchView — 全站检索', () => {
  it('默认全部：五类对象分组齐，计数=7', async () => {
    const { w } = await mountSearch()
    for (const key of ['sessions', 'tasks', 'runs', 'docs', 'people']) {
      expect(w.find(`[data-testid="search-group-${key}"]`).exists(), key).toBe(true)
    }
    expect(w.find('[data-testid="search-count"]').text()).toBe('7')
    w.unmount()
  })

  it('类型页签收敛：只看任务', async () => {
    const { w } = await mountSearch()
    await w.find('[data-testid="search-type-tasks"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="search-group-tasks"]').exists()).toBe(true)
    expect(w.find('[data-testid="search-group-sessions"]').exists()).toBe(false)
    expect(w.find('[data-testid="search-count"]').text()).toBe('2')
    w.unmount()
  })

  it('工作区过滤同时作用于任务与会话（会话经挂接任务反查）', async () => {
    const { w } = await mountSearch()
    await w.find('[data-testid="search-filter-workspace"]').setValue('/lab/pay')
    await flushPromises()
    expect(w.find('[data-testid="search-row-t:t1"]').exists()).toBe(true)
    expect(w.find('[data-testid="search-row-t:t2"]').exists()).toBe(false)
    expect(w.find('[data-testid="search-row-s:room:!a:matrix"]').exists()).toBe(true)
    expect(w.find('[data-testid="search-row-s:chat:c1"]').exists()).toBe(false)
    w.unmount()
  })

  it('关键词 + 人员类型：Alice 命中', async () => {
    const { w } = await mountSearch('/app/search?q=Alice&type=people')
    expect(w.find('[data-testid="search-row-p:@alice:matrix"]').exists()).toBe(true)
    w.unmount()
  })

  it('任务行点击就地打开抽屉（不再跳看板）', async () => {
    const { w } = await mountSearch()
    await w.find('[data-testid="search-row-t:t1"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="task-drawer-stub"]').attributes('data-task')).toBe('t1')
    w.unmount()
  })
})
