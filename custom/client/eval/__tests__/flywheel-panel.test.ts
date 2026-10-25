// @vitest-environment jsdom
// 数据飞轮面板冒烟（2026-10-25 吸收轮）：漏斗/根因聚类/门读数渲染、
// 门四态如实呈现、变体扩产动作调 API 且幂等文案如实。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: { value: 'zh' } }) }))
vi.mock('@/api/client', () => ({ request: vi.fn(), getApiKey: () => '', getBaseUrlValue: () => '' }))
vi.mock('@/custom/eval/api', () => ({
  evalApi: { flywheel: vi.fn(), expandBadcaseVariants: vi.fn(), flywheelMergeGate: vi.fn(), fewshotRecall: vi.fn() },
}))

import FlywheelPanel from '@/custom/eval/components/FlywheelPanel.vue'
import { evalApi } from '@/custom/eval/api'

const readout = {
  ok: true,
  funnel: {
    badCases: 9, reflowed: 3, distilled: 2, variantTasks: 20,
    variantBlueprints: 2, remediationOpen: 1, remediationClosed: 2, conversionRate: 1 / 3,
  },
  byRootCause: [
    { rootCause: 'action_loop', label: '动作死循环', count: 2 },
    { rootCause: 'result_defect', label: '结果缺陷', count: 1 },
  ],
  variantTasksInSets: 20,
  gate: {
    status: 'fail', runId: 'erun-9', k: 5, minPassRate: 0.8, minSamples: 3,
    tasks: [
      { taskId: 'bd-bad1', samples: 5, passed: 1, passRate: 0.2 },
      { taskId: 'bd-ok1', samples: 5, passed: 5, passRate: 1 },
    ],
    reproduced: ['bd-bad1'],
    note: '历史 Bug 复现 1 条',
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(evalApi.flywheel).mockResolvedValue(readout as never)
})

describe('FlywheelPanel 冒烟', () => {
  it('漏斗六卡+根因聚类+门表格渲染；复现行标红', async () => {
    const wrapper = mount(FlywheelPanel)
    await flushPromises()
    expect(wrapper.find('[data-testid="eval-flywheel-funnel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="eval-flywheel-rate"]').text()).toContain('33%')
    expect(wrapper.find('[data-testid="eval-flywheel-root-action_loop"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="eval-flywheel-gate-fail"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="eval-flywheel-gate-fail"]').text()).toContain('一票否决')
    const rows = wrapper.findAll('[data-testid="eval-flywheel-gate-table"] tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('bd-bad1')
    expect(rows[0].text()).toContain('20%')
    expect(rows[0].find('.eval-flywheel__rate-bad').exists()).toBe(true)
  })

  it('门 no_data 态如实呈现（不造数）', async () => {
    vi.mocked(evalApi.flywheel).mockResolvedValue({
      ...readout,
      gate: { status: 'no_data', minPassRate: 0.8, minSamples: 3, tasks: [], reproduced: [] },
    } as never)
    const wrapper = mount(FlywheelPanel)
    await flushPromises()
    expect(wrapper.find('[data-testid="eval-flywheel-gate-no_data"]').text()).toContain('no_data')
    expect(wrapper.find('[data-testid="eval-flywheel-gate-table"]').exists()).toBe(false)
  })

  it('扩产按钮调 API；追加数与零追加文案如实；失败可见', async () => {
    vi.mocked(evalApi.expandBadcaseVariants).mockResolvedValue({ ok: true, appended: 10, blueprints: [] } as never)
    const wrapper = mount(FlywheelPanel)
    await flushPromises()
    await wrapper.find('[data-testid="eval-flywheel-expand"]').trigger('click')
    await flushPromises()
    expect(evalApi.expandBadcaseVariants).toHaveBeenCalledWith({ allFromRegression: true })
    expect(wrapper.find('[data-testid="eval-flywheel-expand-note"]').text()).toContain('10')

    vi.mocked(evalApi.expandBadcaseVariants).mockResolvedValue({ ok: true, appended: 0, blueprints: [] } as never)
    await wrapper.find('[data-testid="eval-flywheel-expand"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="eval-flywheel-expand-note"]').text()).toContain('无新变体')

    vi.mocked(evalApi.expandBadcaseVariants).mockRejectedValue(new Error('回归库无带溯源任务'))
    await wrapper.find('[data-testid="eval-flywheel-expand"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="eval-flywheel-error"]').text()).toContain('回归库无带溯源任务')
  })

  it('空飞轮（零转化、零根因）呈现空态不报错', async () => {
    vi.mocked(evalApi.flywheel).mockResolvedValue({
      ok: true,
      funnel: { badCases: 0, reflowed: 0, distilled: 0, variantBlueprints: 0, variantTasks: 0, remediationOpen: 0, remediationClosed: 0, conversionRate: null },
      byRootCause: [],
      variantTasksInSets: 0,
      gate: { status: 'no_data', minPassRate: 0.8, minSamples: 3, tasks: [], reproduced: [] },
    } as never)
    const wrapper = mount(FlywheelPanel)
    await flushPromises()
    expect(wrapper.find('[data-testid="eval-flywheel-roots-empty"]').text()).toContain('飞轮未转')
    expect(wrapper.find('[data-testid="eval-flywheel-rate"]').text()).toContain('—')
  })
})

describe('FlywheelPanel round 2：合入门与 fewshot 试算', () => {
  it('合入门试算：勾选变更 → blocked 理由呈现；全不勾 → not_required', async () => {
    vi.mocked(evalApi.flywheelMergeGate).mockResolvedValue({
      ok: true, status: 'blocked', changedClasses: ['prompt'],
      reasons: ['回归样本库无运行：变更后未做过历史坏例回放'],
    } as never)
    const wrapper = mount(FlywheelPanel)
    await flushPromises()
    await wrapper.find('[data-testid="eval-flywheel-merge-prompt"]').setValue(true)
    await wrapper.find('[data-testid="eval-flywheel-merge-btn"]').trigger('click')
    await flushPromises()
    expect(evalApi.flywheelMergeGate).toHaveBeenCalledWith({ prompt: true, model: false, orchestration: false })
    expect(wrapper.find('[data-testid="eval-flywheel-merge-blocked"]').text()).toContain('拒绝合入')
    expect(wrapper.find('[data-testid="eval-flywheel-merge-blocked"]').text()).toContain('无运行')

    vi.mocked(evalApi.flywheelMergeGate).mockResolvedValue({
      ok: true, status: 'not_required', changedClasses: [], reasons: ['三类变更皆未动'],
    } as never)
    await wrapper.find('[data-testid="eval-flywheel-merge-btn"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="eval-flywheel-merge-not_required"]').text()).toContain('不触发')
  })

  it('fewshot 试算：召回条目呈现错误/正确示范；零召回如实空态', async () => {
    vi.mocked(evalApi.fewshotRecall).mockResolvedValue({
      ok: true, query: '查机票', minSim: 0.45, candidates: 2,
      recalled: [{ ledgerId: 'fw-0001', trigger: '查北京到上海的机票', wrongDemo: 'result_defect：禁止重复失败', rightDemo: '返回正确航班', rootCause: 'result_defect', similarity: 0.62 }],
    } as never)
    const wrapper = mount(FlywheelPanel)
    await flushPromises()
    await wrapper.find('[data-testid="eval-flywheel-fewshot-query"]').setValue('查北京到上海的机票')
    await wrapper.find('[data-testid="eval-flywheel-fewshot-btn"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="eval-flywheel-fewshot-fw-0001"]').text()).toContain('错误示范')
    expect(wrapper.find('[data-testid="eval-flywheel-fewshot-fw-0001"]').text()).toContain('正确做法')
    expect(wrapper.find('[data-testid="eval-flywheel-fewshot-meta"]').text()).toContain('2')

    vi.mocked(evalApi.fewshotRecall).mockResolvedValue({
      ok: true, query: 'x', minSim: 0.45, candidates: 0, recalled: [],
    } as never)
    await wrapper.find('[data-testid="eval-flywheel-fewshot-btn"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="eval-flywheel-fewshot-empty"]').text()).toContain('零召回')
  })
})
