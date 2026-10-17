// @vitest-environment jsdom
// D13 六阶段工作页单测：路由可达+阶段页渲染+工具卡直达+状态推导。
// 层级批第二阶段（2026-10-17）：阶段页工作台化——②④⑤⑥各内嵌一块高频件，
// run 口径与四个面板签同源（useRunContext 记忆回落）。
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
// ③组织视图按需挂载（内容减负批）：用桩替代整块治理数据面，断言挂载/卸载时机。
vi.mock('../views/gov/GovOrgKnowledgeView.vue', () => ({ default: { name: 'GovOrgKnowledgeViewStub', template: '<div data-testid="ia-tasks-panel-gov-org" />' } }))

import { authFetch } from '../../ide/utils/auth-fetch'
import StageShell from '../views/stage/StageShell.vue'

const mockedFetch = vi.mocked(authFetch)

// run 记忆与 Mock 调用历史跨用例隔离：jsdom localStorage 同文件内持久，不清会串味
// （前一条用例成功读取写入 ia2.lastRun，后一条内嵌面板挂载即自动取数）；
// vi.clearAllMocks 清调用记录（实现保留，D14 等用例靠 mockResolvedValue 续命）
beforeEach(() => { localStorage.clear(); vi.clearAllMocks() })

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
  it('③分析设计组织视图按需展开；④开发交接说明折叠', async () => {
    const { w: w3 } = await mountStage(3)
    expect(w3.find('[data-testid="stg-embed-3"]').exists()).toBe(true)
    // 默认不挂载：整块治理数据面不占首屏、不发请求
    expect(w3.find('[data-testid="ia-tasks-panel-gov-org"]').exists()).toBe(false)
    const toggle = w3.find('[data-testid="stg-embed-3-toggle"]')
    expect(toggle.exists()).toBe(true)
    await toggle.trigger('click')
    await flushPromises()
    expect(w3.find('[data-testid="ia-tasks-panel-gov-org"]').exists()).toBe(true)
    expect(toggle.text()).toContain('收起')
    await toggle.trigger('click')
    expect(w3.find('[data-testid="ia-tasks-panel-gov-org"]').exists()).toBe(false)
    w3.unmount()
    const { w: w4 } = await mountStage(4)
    expect(w4.find('[data-testid="stg-embed-4"]').exists()).toBe(true)
    expect(w4.find('[data-testid="stg-embed-4b"]').exists()).toBe(true)
    expect(w4.find('[data-testid="gk-section"]').exists()).toBe(true)
    const details = w4.find('[data-testid="stg-handoff-details"]')
    expect(details.exists()).toBe(true)
    expect((details.element as HTMLDetailsElement).open).toBe(false)
    expect(w4.find('[data-testid="hds-section"]').exists()).toBe(true)
    // 容量灯二态之一或都不渲染（无端点时）——只断言不炸
    w4.unmount()
  })
})

describe('层级批第二阶段：阶段页工作台化（高频件内嵌，零新端点）', () => {
  it('②需求内嵌运行态势条（无 run= 时如实待命，不自建输入）', async () => {
    const { w } = await mountStage(2)
    expect(w.find('[data-testid="stg-embed-2b"]').exists()).toBe(true)
    expect(w.find('[data-testid="cpb-strip"]').exists()).toBe(true)
    expect(w.find('[data-testid="cpb-empty"]').text()).toContain('值班台待命')
    w.unmount()
  })

  it('④开发内嵌证据反查（锚检索+台账，挂载不自动取数）', async () => {
    const { w } = await mountStage(4)
    expect(w.find('[data-testid="stg-embed-4c"]').exists()).toBe(true)
    expect(w.find('[data-testid="ev-panel"]').exists()).toBe(true)
    expect(w.find('[data-testid="ev-anchor-input"]').exists()).toBe(true)
    w.unmount()
  })

  it('⑤验收内嵌交付健康（分支+14 件交付物）', async () => {
    const { w } = await mountStage(5)
    expect(w.find('[data-testid="stg-embed-5b"]').exists()).toBe(true)
    expect(w.find('[data-testid="dlv-panel"]').exists()).toBe(true)
    w.unmount()
  })

  it('⑥治理内嵌问题清单对账（处置率+逐条状态）', async () => {
    const { w } = await mountStage(6)
    expect(w.find('[data-testid="stg-embed-6b"]').exists()).toBe(true)
    expect(w.find('[data-testid="gis-panel"]').exists()).toBe(true)
    w.unmount()
  })

  it('run 记忆回落：无 ?run= 时阶段页按 ia2.lastRun 读进度', async () => {
    localStorage.setItem('ia2.lastRun', 'mem-run')
    const { w } = await mountStage(2)
    await flushPromises()
    expect(mockedFetch).toHaveBeenCalledWith('/api/hermes/sim/run-state?run=mem-run')
    w.unmount()
  })

  it('query.run 优先于记忆：带 ?run= 时不读记忆值', async () => {
    localStorage.setItem('ia2.lastRun', 'mem-run')
    const { w } = await mountStage(2, '/x?run=q-run')
    await flushPromises()
    expect(mockedFetch).toHaveBeenCalledWith('/api/hermes/sim/run-state?run=q-run')
    expect(mockedFetch).not.toHaveBeenCalledWith('/api/hermes/sim/run-state?run=mem-run')
    w.unmount()
  })
})
