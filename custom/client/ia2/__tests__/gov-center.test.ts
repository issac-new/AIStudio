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

import GovCenterView from '../views/gov/GovCenterView.vue'
import ClearancePanel from '../views/gov/ClearancePanel.vue'
import { fetchClearanceLedger, resolveClearance, waiveClearance } from '../api/gatekeeper'

const mockedLedger = vi.mocked(fetchClearanceLedger)
const mockedResolve = vi.mocked(resolveClearance)
const mockedWaive = vi.mocked(waiveClearance)

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
  it('七签页签渲染；默认签=关卡与流程；五签占位注明将迁入组件（含密钥台账增件）', async () => {
    const w = await mountAt('/app/gov')
    const keys = ['process', 'orgAssets', 'clearance', 'issues', 'audit', 'docs', 'metrics']
    for (const k of keys) expect(w.find(`[data-testid="ia-gov-tab-${k}"]`).exists()).toBe(true)
    expect(w.find('[data-testid="ia-gov-tab-process"]').attributes('aria-selected')).toBe('true')
    expect(w.find('[data-testid="ia-gov-panel-process"]').text()).toContain('签 1·关卡与流程')
    expect(w.find('[data-testid="ia-gov-panel-orgAssets"]').text()).toContain('密钥最小台账')
    expect(w.find('[data-testid="ia-gov-panel-metrics"]').text()).toContain('容量成本')
    expect(w.find('[data-testid="ia-gov-panel-metrics"]').text()).toContain('会话健康')
    w.unmount()
  })

  it('签 3 清偿门实装（占位签无实际面板，此签有）；签序号不错位', async () => {
    const w = await mountAt('/app/gov/clearance')
    await flushPromises()
    expect(w.find('[data-testid="ia-gov-panel-clearance"]').find('[data-testid="clr-panel"]').exists()).toBe(true)
    expect(w.find('[data-testid="ia-gov-panel-process"]').text()).toContain('签 1·')
    expect(w.find('[data-testid="ia-gov-panel-metrics"]').text()).toContain('签 7·')
    w.unmount()
  })
})

describe('ClearancePanel — C2 清偿门签（R6）', () => {
  beforeEach(() => { vi.clearAllMocks() })

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
