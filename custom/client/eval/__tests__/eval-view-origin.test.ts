// @vitest-environment jsdom
// EvalView origin 运行守门：显式选择才自动绑定来源证据；密封集禁用。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const routeQuery = vi.hoisted(() => ({ value: {} as Record<string, string> }))
const routerPush = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery.value }),
  useRouter: () => ({ push: routerPush }),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: { value: 'zh' } }) }))
vi.mock('@/api/client', () => ({ request: vi.fn(), getApiKey: () => '', getBaseUrlValue: () => '' }))
vi.mock('@/custom/ia2/components/TopicPageLayout.vue', () => ({
  default: { template: '<div><slot name="tabs" /><slot /></div>' },
}))
vi.mock('@/custom/eval/api', () => ({
  evalApi: {
    listSets: vi.fn(),
    listRuns: vi.fn(),
    launchRun: vi.fn(),
  },
}))

import EvalView from '@/custom/eval/views/EvalView.vue'
import { evalApi } from '@/custom/eval/api'

const openSet = {
  id: 'eset-open', name: '回归样本库', track: 'e2e', sealed: false,
  contentHash: 'a'.repeat(40), revision: 1, createdAt: 1, taskCount: 1, runCount: 0,
}
const sealedSet = { ...openSet, id: 'eset-sealed', name: '密封集', sealed: true }

function run(id: string) {
  return {
    id, setId: 'eset-open', target: {}, k: 1, status: 'done', createdAt: 2,
    aggregates: {
      taskCount: 1, passAt1: 1, passAtK: 1,
      byLayer: { result: 1, trajectory: 1, risk: 'none', efficiency: { avgTokens: null, avgCostUsd: null, avgSteps: null, avgDurationMs: null } },
      unknownRatio: 0, rubricDrilldownHint: false, riskVeto: false, statisticallyInsufficient: true, judgeOnline: true,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  routeQuery.value = {}
  vi.mocked(evalApi.listSets).mockResolvedValue({ sets: [openSet, sealedSet] } as never)
  vi.mocked(evalApi.listRuns).mockResolvedValue({ runs: [] } as never)
  vi.mocked(evalApi.launchRun).mockResolvedValue({ run: run('erun-origin') } as never)
})

describe('EvalView origin 运行', () => {
  it('手工 samples 路径不带 useOrigin；转题 URL 可预选回归库', async () => {
    routeQuery.value = { set: 'eset-open' }
    const wrapper = mount(EvalView, {
      global: { stubs: { EvalReportPanel: true, EvalOraclePanel: true, EvalAdvicePanel: true, MetricRegistryPanel: true, RedteamPanel: true, HeldOutPanel: true } },
    })
    await flushPromises()
    await wrapper.find('[data-testid="eval-tab-runs"]').trigger('click')
    expect((wrapper.find('[data-testid="eval-launch-set"]').element as HTMLSelectElement).value).toBe('eset-open')

    await wrapper.find('[data-testid="eval-launch-samples"]').setValue('{"t1":[{"evidence":{"transcript":"OK"}}]}')
    await wrapper.find('[data-testid="eval-launch-form"]').trigger('submit')
    await flushPromises()
    expect(evalApi.launchRun).toHaveBeenCalledWith({
      setId: 'eset-open',
      samples: { t1: [{ evidence: { transcript: 'OK' } }] },
    })
  })

  it('显式勾选后允许空 samples，并发送 useOrigin:true', async () => {
    const wrapper = mount(EvalView, {
      global: { stubs: { EvalReportPanel: true, EvalOraclePanel: true, EvalAdvicePanel: true, MetricRegistryPanel: true, RedteamPanel: true, HeldOutPanel: true } },
    })
    await flushPromises()
    await wrapper.find('[data-testid="eval-tab-runs"]').trigger('click')
    await wrapper.find('[data-testid="eval-launch-use-origin"]').setValue(true)
    await wrapper.find('[data-testid="eval-launch-samples"]').setValue('')
    await wrapper.find('[data-testid="eval-launch-form"]').trigger('submit')
    await flushPromises()
    expect(evalApi.launchRun).toHaveBeenCalledWith({
      setId: 'eset-open',
      samples: {},
      useOrigin: true,
    })
  })

  it('密封集禁用 origin 自动展开', async () => {
    const wrapper = mount(EvalView, {
      global: { stubs: { EvalReportPanel: true, EvalOraclePanel: true, EvalAdvicePanel: true, MetricRegistryPanel: true, RedteamPanel: true, HeldOutPanel: true } },
    })
    await flushPromises()
    await wrapper.find('[data-testid="eval-tab-runs"]').trigger('click')
    await wrapper.find('[data-testid="eval-launch-set"]').setValue('eset-sealed')
    expect(wrapper.find('[data-testid="eval-launch-use-origin"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('密封集不能按来源自动展开')
  })

  it('useRoute 必须在 setup 顶层调用（refresh 内调用会在真实 router 下拿不到 query，2026-10-21 走查实测）', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(resolve(process.cwd(), 'custom/client/eval/views/EvalView.vue'), 'utf8')
    expect(src).toMatch(/const route = useRoute\(\)/)
    expect(src).not.toMatch(/function refresh[\s\S]*?useRoute\(\)/)
  })
})
