// @vitest-environment jsdom
// D18 旅程首页单测：两区十卡（A 区搭建五步+B 区交付五阶段）+状态推导
// （done/active/pending/untracked）+无轮引导态+直达路由+卡点提示条。
// 单一事实源=stage-meta.ts（SETUP_STEPS/STAGE_META），与 StageShell 同源。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router, type RouteRecordRaw } from 'vue-router'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }), createI18n: () => ({ global: { t: (k: string) => k, locale: 'zh' } }) }))
vi.mock('../../ide/utils/auth-fetch', () => ({ authFetch: vi.fn() }))

import { authFetch } from '../../ide/utils/auth-fetch'
import JourneyView from '../views/journey/JourneyView.vue'

const mockedFetch = vi.mocked(authFetch)

function makeRouter(initial: string): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app', name: 'ia2.journey', component: JourneyView },
      { path: '/app/stage/setup', name: 'ia2.stage1', component: { template: '<div />' } },
      { path: '/app/stage/reqs', name: 'ia2.stage2', component: { template: '<div />' } },
      { path: '/app/stage/design', name: 'ia2.stage3', component: { template: '<div />' } },
      { path: '/app/stage/build', name: 'ia2.stage4', component: { template: '<div />' } },
      { path: '/app/stage/accept', name: 'ia2.stage5', component: { template: '<div />' } },
      { path: '/app/stage/govern', name: 'ia2.stage6', component: { template: '<div />' } },
      { path: '/app/accounts', name: 'ia2.accounts', component: { template: '<div />' } },
      { path: '/app/teams', name: 'ia2.teams', component: { template: '<div />' } },
      { path: '/app/sim/ops', name: 'ia2.simOps', component: { template: '<div />' } },
      { path: '/app/gov/org-assets', name: 'ia2.govOrgAssets', component: { template: '<div />' } },
      { path: '/hermes/agents', name: 'hermes.agentManager', component: { template: '<div />' } },
      { path: '/app/sim', name: 'ia2.sim', component: { template: '<div />' } },
    ] as RouteRecordRaw[],
  })
}

async function mountAt(path: string) {
  const router = makeRouter(path)
  await router.push(path)
  await router.isReady()
  const w = mount(JourneyView, { global: { plugins: [router] } })
  await flushPromises()
  return { w, router }
}

describe('JourneyView — D18 旅程式旅程首页', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('两区十卡渲染（A 区搭建五步+B 区交付五阶段）+无轮引导态', async () => {
    const { w } = await mountAt('/app')
    // A 区五步：组织→账号→团队协调→环境资产→智能体
    const steps = w.findAll('[data-testid^="jrn-step-"]').filter(x => /jrn-step-\d+$/.test(x.attributes('data-testid') ?? ''))
    expect(steps).toHaveLength(5)
    expect(w.find('[data-testid="jrn-step-1"]').text()).toContain('建立组织')
    expect(w.find('[data-testid="jrn-step-3"]').text()).toContain('建立团队与协调关系')
    expect(w.find('[data-testid="jrn-step-5"]').text()).toContain('准备智能体')
    // B 区五阶段：与顶栏②-⑥同构（需求→分析设计→开发→验收→治理）
    expect(w.findAll('[data-testid^="jrn-stage-"]')).toHaveLength(5)
    expect(w.find('[data-testid="jrn-stage-2"]').text()).toContain('需求')
    expect(w.find('[data-testid="jrn-stage-6"]').text()).toContain('治理')
    // 无轮引导态：主按钮去建立组织，次按钮直接看交付流程
    expect(w.find('[data-testid="jrn-guide"]').exists()).toBe(true)
    await w.find('[data-testid="jrn-start"]').trigger('click')
    await flushPromises()
    w.unmount()
  })

  it('卡片点击直达真实路由（团队管理/治理阶段），搭建步带来路阶段①', async () => {
    const { w, router } = await mountAt('/app')
    await w.find('[data-testid="jrn-step-3"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.teams')
    // 减负批：A 区步骤统一带 from=1，落点页顶栏高亮按搭建语境（团队/账号/环境跨阶段复用）
    expect(router.currentRoute.value.query.from).toBe('1')
    await w.find('[data-testid="jrn-stage-6"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.stage6')
    w.unmount()
  })

  it('带 run 状态推导：搭建步按键完成、无键步骤如实不跟踪、阶段推导+卡点条', async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        run: 'r', posture: 'standard',
        gates: { g1_frozen: 't' },
        steps: { smoke_done: '1', appinit_done: '1', people_done: '1' },
        ledger: { open: 2 },
      }),
    } as never)
    const { w } = await mountAt('/app?run=r')
    await flushPromises()
    // A 区：步 1（appinit_done/people_done）与步 4（smoke_done）完成；步 3/5 无键=不跟踪
    expect(w.find('[data-testid="jrn-step-state-1"]').text()).toContain('完成')
    expect(w.find('[data-testid="jrn-step-state-4"]').text()).toContain('完成')
    expect(w.find('[data-testid="jrn-step-state-3"]').text()).toContain('轮次内不跟踪')
    expect(w.find('[data-testid="jrn-step-state-5"]').text()).toContain('轮次内不跟踪')
    // B 区：②需求完成（g1_frozen）；③分析设计=首个未完成=进行中；⑥治理未开始
    expect(w.find('[data-testid="jrn-state-2"]').text()).toContain('完成')
    expect(w.find('[data-testid="jrn-state-3"]').text()).toContain('进行中')
    expect(w.find('[data-testid="jrn-state-6"]').text()).toContain('未开始')
    // 卡点提示条：第一道未过阶段+遗留项清算提示
    const bn = w.find('[data-testid="jrn-bottleneck"]')
    expect(bn.exists()).toBe(true)
    expect(bn.text()).toContain('分析设计')
    expect(bn.text()).toContain('2 笔遗留项未清算')
    expect(mockedFetch).toHaveBeenCalledWith('/api/hermes/sim/run-state?run=r')
    w.unmount()
  })

  it('端点不可达如实报错', async () => {
    mockedFetch.mockRejectedValue(new Error('503'))
    const { w } = await mountAt('/app?run=bad')
    await flushPromises()
    expect(w.find('[data-testid="jrn-error"]').text()).toContain('503')
    w.unmount()
  })
})
