// @vitest-environment jsdom
// D13 六阶段工作页单测：路由可达+阶段页渲染+工具卡直达+状态推导。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router, type RouteRecordRaw } from 'vue-router'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }), createI18n: () => ({ global: { t: (k: string) => k, locale: 'zh' } }) }))
vi.mock('../../ide/utils/auth-fetch', () => ({ authFetch: vi.fn() }))
vi.mock('../../api/gov', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/gov')>()
  return { ...actual, fetchKeyLedger: vi.fn().mockResolvedValue({ entries: [] }), putKeyLedger: vi.fn().mockResolvedValue({ entries: [] }), fetchClearanceLedger: vi.fn().mockResolvedValue({ rows: [], open: 0, resolved: 0, waived: 0, pass: true }), resolveClearance: vi.fn(), waiveClearance: vi.fn(), groupClearanceTargets: () => [] }
})
vi.mock('../../api/gatekeeper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/gatekeeper')>()
  return { ...actual, fetchClearanceLedger: vi.fn().mockResolvedValue({ rows: [], open: 0, resolved: 0, waived: 0, pass: true }), resolveClearance: vi.fn(), waiveClearance: vi.fn(), groupClearanceTargets: () => [] }
})
vi.mock('../../kanban/handoff', () => ({ HANDOFF_TYPES: [], HANDOFF_STATES: [], HANDOFF_TYPE_LABEL: {}, HANDOFF_STATE_LABEL: {} }))
vi.mock('../../components/TabIntroBanner.vue', () => ({ default: { template: '<div class="intro-stub" />' } }))

import { authFetch } from '../../ide/utils/auth-fetch'
import StageShell from '../views/stage/StageShell.vue'

const mockedFetch = vi.mocked(authFetch)

function makeRouter(path: string, stage: number): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path, component: StageShell, props: { stage } },
      // 工具卡落点（减负批：断言来源阶段随行）
      { path: '/app/gov/docs', name: 'ia2.govDocs', component: { template: '<div />' } },
    ] as RouteRecordRaw[],
  })
}

async function mountStage(stage: number, path = `/x`) {
  const router = makeRouter(path, stage)
  await router.push(path)
  await router.isReady()
  const w = mount(StageShell, { props: { stage }, global: { plugins: [router] } })
  await flushPromises()
  return { w, router }
}

describe('StageShell — D13 时序六阶段工作页', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('①搭建：标题+导语+五步骤清单（组织/账号/团队/环境资产/智能体）', async () => {
    const { w } = await mountStage(1)
    expect(w.find('[data-testid="stg-page-1"]').exists()).toBe(true)
    expect(w.text()).toContain('搭建：建立组织、账号与资产')
    // D18：三工具卡→五步骤有序清单，每步带进入按钮
    const steps = w.findAll('.stg__step')
    expect(steps).toHaveLength(5)
    expect(w.find('[data-testid="stg-step-org"]').exists()).toBe(true)
    expect(w.find('[data-testid="stg-step-accounts"]').exists()).toBe(true)
    expect(w.find('[data-testid="stg-step-teams"]').exists()).toBe(true)
    expect(w.find('[data-testid="stg-step-env"]').exists()).toBe(true)
    expect(w.find('[data-testid="stg-step-agents"]').exists()).toBe(true)
    for (const key of ['org', 'accounts', 'teams', 'env', 'agents']) {
      expect(w.find(`[data-testid="stg-step-go-${key}"]`).exists(), `步骤 ${key} 进入按钮`).toBe(true)
    }
    // 无键步骤如实显示「轮次内不跟踪」，不假装完成
    expect(w.find('[data-testid="stg-step-state-teams"]').text()).toContain('轮次内不跟踪')
    expect(w.find('[data-testid="stg-step-state-agents"]').text()).toContain('轮次内不跟踪')
    // 密钥台账内嵌保留（D14）
    expect(w.find('[data-testid="stg-embed-1"]').exists()).toBe(true)
    w.unmount()
  })

  it('④开发：四工具卡（审批待办/看板/IDE 工作区/证据库）', async () => {
    const { w } = await mountStage(4)
    expect(w.text()).toContain('开发：编码、测试与日常协调')
    const labels = w.findAll('.stg__tool-label').map(x => x.text())
    for (const t of ['审批待办', '工作台看板', 'IDE 工作区', '证据库']) expect(labels).toContain(t)
    // D18：testid 拼稳定 key 不拼 label
    expect(w.find('[data-testid="stg-tool-ide"]').exists()).toBe(true)
    w.unmount()
  })

  it('工具卡携带来源阶段：②需求的文档评审落治理页时 from=2', async () => {
    const { w, router } = await mountStage(2)
    await w.find('[data-testid="stg-tool-docReview"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.govDocs')
    expect(router.currentRoute.value.query.from).toBe('2')
    w.unmount()
  })

  it('带 run 状态：完成阶段✓、首个未完成=当前（②在 smoke 后=当前）', async () => {
    const { w } = await mountStage(2, '/x?run=r')
    mockedFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ run: 'r', posture: 'standard', gates: {}, steps: { smoke_done: '1' }, ledger: { open: 0 } }),
    } as never)
    // 触发重载：run watch 已 immediate——手动再 load 一次（组件暴露无；重挂）
    w.unmount()
    const router = makeRouter('/x?run=r', 2)
    await router.push('/x?run=r')
    await router.isReady()
    const w2 = mount(StageShell, { props: { stage: 2 }, global: { plugins: [router] } })
    await flushPromises()
    await flushPromises()
    expect(w2.find('[data-testid="stg-state-2"]').text()).toContain('当前阶段')
    w2.unmount()
  })
})

describe('D14 阶段内嵌核心操作', () => {
  it('①搭台内嵌密钥台账操作区；⑥治理内嵌清偿门操作区', async () => {
    mockedFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ run: 'r', posture: 'standard', gates: {}, steps: {}, ledger: { open: 0 } }) } as never)
    const { w } = await mountStage(1)
    await flushPromises()
    expect(w.find('[data-testid="stg-embed-1"]').exists()).toBe(true)
    expect(w.find('[data-testid="kls-section"]').exists()).toBe(true)
    w.unmount()
    const { w: w6 } = await mountStage(6)
    expect(w6.find('[data-testid="stg-embed-6"]').exists()).toBe(true)
    expect(w6.find('[data-testid="clr-panel"]').exists()).toBe(true)
    w6.unmount()
    const { w: w2 } = await mountStage(2)
    expect(w2.find('[data-testid="grp-panel"]').exists()).toBe(true)
    w2.unmount()
    const { w: w5 } = await mountStage(5)
    expect(w5.find('[data-testid="trc-panel"]').exists()).toBe(true)
    w5.unmount()
  })
})

describe('D15 六阶段全内嵌', () => {
  it('③分析设计内嵌组织视图；④生产内嵌交接+容量灯', async () => {
    const { w: w3 } = await mountStage(3)
    expect(w3.find('[data-testid="stg-embed-3"]').exists()).toBe(true)
    expect(w3.text().length).toBeGreaterThan(50) // 组织视图渲染了内容
    w3.unmount()
    const { w: w4 } = await mountStage(4)
    expect(w4.find('[data-testid="stg-embed-4"]').exists()).toBe(true)
    expect(w4.find('[data-testid="stg-embed-4b"]').exists()).toBe(true)
    expect(w4.find('[data-testid="gk-section"]').exists()).toBe(true)
    expect(w4.find('[data-testid="hds-section"]').exists()).toBe(true)
    // 容量灯二态之一或都不渲染（无端点时）——只断言不炸
    w4.unmount()
  })
})
