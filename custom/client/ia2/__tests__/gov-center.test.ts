// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/gov-center.test.ts
// C1 治理中心壳+C2 清偿门签单测（R6/R8——设计正本 §二 治理关注面）：
//   1) 七签路由可达+默认签=关卡与流程；占位签注明将迁入组件
//   2) ClearancePanel：台账全量表三态徽+放行灯红绿+按目标审批
//      （resolve 挂 PR 锚/waive 强制理由客户端镜像）+动作留痕反馈+503 如实
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router, type RouteRecordRaw } from 'vue-router'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }),
  createI18n: () => ({ global: { t: (k: string) => k, locale: 'zh' } }),
}))
vi.mock('../api/gatekeeper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/gatekeeper')>()
  return { ...actual, fetchClearanceLedger: vi.fn(), resolveClearance: vi.fn(), waiveClearance: vi.fn() }
})
vi.mock('../api/gov', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/gov')>()
  return {
    ...actual,
    fetchGateRepairs: vi.fn(),
    transitionGateRepair: vi.fn(),
    fetchKeyLedger: vi.fn(),
    putKeyLedger: vi.fn(),
  }
})

import GovCenterView from '../views/gov/GovCenterView.vue'
import ClearancePanel from '../views/gov/ClearancePanel.vue'
import { fetchClearanceLedger, resolveClearance, waiveClearance } from '../api/gatekeeper'
import { fetchGateRepairs, transitionGateRepair, fetchKeyLedger, putKeyLedger } from '../api/gov'
import GateRepairsPanel from '../views/gov/GateRepairsPanel.vue'
import KeyLedgerSection from '../views/gov/KeyLedgerSection.vue'

const mockedLedger = vi.mocked(fetchClearanceLedger)
const mockedResolve = vi.mocked(resolveClearance)
const mockedWaive = vi.mocked(waiveClearance)
const mockedGateRepairs = vi.mocked(fetchGateRepairs)
const mockedTransition = vi.mocked(transitionGateRepair)
const mockedFetchKeys = vi.mocked(fetchKeyLedger)
const mockedPutKeyLedger = vi.mocked(putKeyLedger)

const LEDGER = {
  rows: [
    { id: 'e1', type: 'nudge', defect: 'PR-3', detail: '', status: 'open', state: 'open' as const },
    { id: 'e2', type: 'gw-dispatch-bypass', defect: 'PR-3', detail: '', status: 'open', state: 'open' as const },
    { id: 'e3', type: 'auto-approve', defect: 'PR-2', detail: '', status: 'open', state: 'open' as const },
    { id: 'e4', type: 'driver-merge', defect: 'PR-4', detail: '', status: 'open', state: 'resolved' as const },
  ],
  open: 3, resolved: 1, waived: 0, pass: false,
}

function makeRouter(initial = '/app/gov'): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/gov', name: 'ia2.governance', component: GovCenterView },
      { path: '/app/gov/org-assets', name: 'ia2.govOrgAssets', component: GovCenterView },
      { path: '/app/gov/clearance', name: 'ia2.govClearance', component: GovCenterView },
      { path: '/app/gov/issues', name: 'ia2.govIssues', component: GovCenterView },
      { path: '/app/gov/audit', name: 'ia2.govAudit', component: GovCenterView },
      { path: '/app/gov/docs', name: 'ia2.govDocs', component: GovCenterView },
      { path: '/app/gov/metrics', name: 'ia2.govMetrics', component: GovCenterView },
    ] as RouteRecordRaw[],
  })
}

async function mountAt(path: string) {
  const router = makeRouter(path)
  await router.push(path)
  await router.isReady()
  return mount(GovCenterView, { global: { plugins: [router] } })
}

describe('GovCenterView — C1 治理中心壳（R8）', () => {
  it('七签页签渲染；默认签=关卡与流程；六签实装（问题单对账留占位注卡级数据面）', { timeout: 20000 }, async () => {
    const w = await mountAt('/app/gov')
    const keys = ['process', 'orgAssets', 'clearance', 'issues', 'audit', 'docs', 'metrics']
    for (const k of keys) expect(w.find(`[data-testid="ia-gov-tab-${k}"]`).exists()).toBe(true)
    expect(w.find('[data-testid="ia-gov-tab-process"]').attributes('aria-selected')).toBe('true')
    // 六签实装：实际数据面在渲染位
    const live: Record<string, string> = {
      process: '[data-testid="grp-panel"]',
      orgAssets: '[data-testid="kls-section"]',
      clearance: '[data-testid="clr-panel"]',
      audit: '[data-testid="ia-gov-panel-audit"] .gov-center__panel-title',
      docs: '[data-testid="ia-gov-panel-docs"] .gov-center__panel-title',
      metrics: '[data-testid="ia-gov-panel-metrics"] .gov-center__panel-title',
    }
    for (const [k, sel] of Object.entries(live)) {
      expect(w.find(sel).exists(), `实装面 ${k}`).toBe(true)
    }
    // 迁入组件真的挂载（审计/文档/体检三签内含既有组件根元素）
    expect(w.find('[data-testid="ia-gov-panel-audit"]').text().length).toBeGreaterThan(20)
    expect(w.find('[data-testid="ia-gov-panel-issues"]').text()).toContain('卡级数据面')
    expect(w.find('[data-testid="ia-gov-panel-metrics"]').text()).toContain('容量阈值灯')
    w.unmount()
  })

  it('签序号不错位（问题单对账=签 4 占位、度量体检=签 7）', { timeout: 20000 }, async () => {
    const w = await mountAt('/app/gov')
    expect(w.find('[data-testid="ia-gov-panel-issues"]').text()).toContain('签 4·')
    expect(w.find('[data-testid="ia-gov-panel-metrics"]').text()).toContain('签 7·')
    w.unmount()
  })
})

describe('ClearancePanel — C2 清偿门签（R6）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGateRepairs.mockResolvedValue({
      count: 2, open: 1,
      records: [
        { id: 'gr-1', gate: 'G2', state: 'fail_registered', ts: '2026-10-15T12:00:00Z', fail_evidence: '设计面缺项 D-1', missing: ['D-1'], history: [] },
        { id: 'gr-2', gate: 'G5', state: 'pass', ts: '2026-10-15T20:00:00Z', fail_evidence: '', missing: [], history: [] },
      ],
    })
    mockedTransition.mockResolvedValue({} as never)
    mockedFetchKeys.mockResolvedValue({ entries: [{ name: 'matrix-admin', owner: '运维', last_rotated: '2026-10-14', note: '泄漏轮换' }] })
    mockedPutKeyLedger.mockResolvedValue({ entries: [] })
  })

  it('台账全量表+放行灯红（未清拒开新轮）+按目标分组；resolve 空锚禁用', { timeout: 20000 }, async () => {
    mockedLedger.mockResolvedValue(LEDGER)
    const w = mount(ClearancePanel)
    await flushPromises()
    const lamp = w.find('[data-testid="clr-lamp"]')
    expect(lamp.classes()).toContain('clr__lamp--red')
    expect(lamp.text()).toContain('3 笔未清·拒开新轮')
    expect(w.find('[data-testid="clr-target-PR-3"]').text()).toContain('2 笔未清')
    expect(w.find('[data-testid="clr-target-PR-2"]').exists()).toBe(true)
    expect(w.find('[data-testid="clr-resolve-PR-3"]').attributes('disabled')).toBeDefined()
    expect(w.findAll('.clr__state').length).toBeGreaterThanOrEqual(4)
    w.unmount()
  })

  it('resolve 带锚启用并发起（留痕反馈）；waive 理由镜像；503 如实', { timeout: 20000 }, async () => {
    mockedLedger.mockResolvedValue(LEDGER)
    mockedResolve.mockResolvedValue({ ...LEDGER, open: 0, pass: true })
    const w = mount(ClearancePanel)
    await flushPromises()
    await w.find('[data-testid="clr-resolve-pr-PR-3"]').setValue('PR-3')
    await w.find('[data-testid="clr-resolve-PR-3"]').trigger('click')
    await flushPromises()
    expect(mockedResolve).toHaveBeenCalledWith('PR-3', 'PR-3')
    expect(w.find('[data-testid="clr-action-msg"]').text()).toContain('已登记根治 PR-3')
    expect(w.find('[data-testid="clr-lamp"]').classes()).toContain('clr__lamp--green')
    await w.find('[data-testid="clr-waive-reason-PR-2"]').setValue('用户裁定豁免')
    expect(w.find('[data-testid="clr-waive-PR-2"]').attributes('disabled')).toBeUndefined()
    w.unmount()
    mockedLedger.mockRejectedValue(new Error('/api/hermes/orgloop/ledger → 503'))
    const w2 = mount(ClearancePanel)
    await flushPromises()
    expect(w2.find('[data-testid="clr-error"]').text()).toContain('503')
    w2.unmount()
  })
})

describe('GateRepairsPanel — 签 1 闸修复单（C3 件一，R3）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGateRepairs.mockResolvedValue({
      count: 2, open: 1,
      records: [
        { id: 'gr-1', gate: 'G2', state: 'fail_registered', ts: '2026-10-15T12:00:00Z', fail_evidence: '设计面缺项 D-1', missing: ['D-1'], history: [] },
        { id: 'gr-2', gate: 'G5', state: 'pass', ts: '2026-10-15T20:00:00Z', fail_evidence: '', missing: [], history: [] },
      ],
    })
    mockedTransition.mockResolvedValue({} as never)
  })
  it('修复单渲染+合法迁移按钮（终态无钮）；豁免走 prompt 理由', async () => {
    vi.stubGlobal('prompt', () => '用户裁定豁免')
    const w = mount(GateRepairsPanel)
    await flushPromises()
    const rec = w.find('[data-testid="grp-rec-gr-1"]')
    expect(rec.exists()).toBe(true)
    expect(rec.text()).toContain('G2 架构评审')
    expect(w.find('[data-testid="grp-tr-gr-1-repair_dispatched"]').exists()).toBe(true)
    expect(w.find('[data-testid="grp-tr-gr-1-waived"]').exists()).toBe(true)
    expect(w.find('[data-testid="grp-empty"]').exists()).toBe(false)
    await w.find('[data-testid="grp-tr-gr-1-waived"]').trigger('click')
    await flushPromises()
    expect(mockedTransition).toHaveBeenCalledWith('gr-1', 'waived', '用户裁定豁免')
    w.unmount()
    vi.unstubAllGlobals()
  })

  it('终态（pass）无迁移按钮；端点失败如实', async () => {
    const w = mount(GateRepairsPanel)
    await flushPromises()
    expect(w.find('[data-testid="grp-rec-gr-2"]').text()).toContain('复审通过')
    expect(w.findAll('[data-testid^="grp-tr-gr-2-"]').length).toBe(0)
    w.unmount()
    mockedGateRepairs.mockRejectedValue(new Error('/api/hermes/orgloop/gate-repairs → 503'))
    const w2 = mount(GateRepairsPanel)
    await flushPromises()
    expect(w2.find('[data-testid="grp-error"]').text()).toContain('503')
    w2.unmount()
  })
})

describe('KeyLedgerSection — 密钥最小台账（C11，R13）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedFetchKeys.mockResolvedValue({ entries: [{ name: 'matrix-admin', owner: '运维', last_rotated: '2026-10-14', note: '泄漏轮换' }] })
    mockedPutKeyLedger.mockResolvedValue({ entries: [] })
  })
  it('台账表渲染+加行+保存整表；400（本体禁入）原文如实', async () => {
    const w = mount(KeyLedgerSection)
    await flushPromises()
    const nameInput = w.find('[data-testid="kls-name-0"]').element as HTMLInputElement
    expect(nameInput.value).toBe('matrix-admin')
    expect(w.find('[data-testid="kls-table"]').exists()).toBe(true)
    await w.find('[data-testid="kls-add"]').trigger('click')
    expect(w.findAll('tbody tr').length).toBe(2)
    await w.find('[data-testid="kls-save"]').trigger('click')
    await flushPromises()
    expect(mockedPutKeyLedger).toHaveBeenCalledTimes(1)
    expect(w.find('[data-testid="kls-saved"]').exists()).toBe(true)
    w.unmount()
    mockedPutKeyLedger.mockRejectedValue(new Error('PUT /api/hermes/orgloop/key-ledger → 400（{"error":"禁止字段 token（台账不含密钥本体，只存清单与轮换记录）"}）'))
    const w2 = mount(KeyLedgerSection)
    await flushPromises()
    await w2.find('[data-testid="kls-save"]').trigger('click')
    await flushPromises()
    expect(w2.find('[data-testid="kls-save-error"]').text()).toContain('密钥本体')
    w2.unmount()
  })
})
