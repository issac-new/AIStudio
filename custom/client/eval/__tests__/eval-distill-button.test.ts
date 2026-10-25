// @vitest-environment jsdom
// 报告页「提炼入库」按钮冒烟（数据飞轮 round 2 挂账 5）：失败样本行出按钮、
// 点击调 distill 端点回显提案摘要；通过样本无按钮；重复提炼幂等提示。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: { value: 'zh' } }) }))
vi.mock('@/api/client', () => ({ request: vi.fn(), getApiKey: () => '', getBaseUrlValue: () => '' }))
vi.mock('@/custom/eval/api', () => ({
  evalApi: { getRun: vi.fn(), listIterations: vi.fn(), getSet: vi.fn(), recordLiveEvidence: vi.fn(), distillBadcase: vi.fn() },
}))

import EvalReportPanel from '@/custom/eval/components/EvalReportPanel.vue'
import { evalApi } from '@/custom/eval/api'

const run = {
  id: 'erun-distill-01',
  setId: 'eset-001',
  target: {},
  k: 2,
  status: 'done',
  createdAt: 0,
  aggregates: {
    taskCount: 2, passAt1: 0.5, passAtK: 0.5,
    byLayer: { result: 0.5, trajectory: null, risk: 'clean', efficiency: { avgTokens: null, avgCostUsd: null, avgSteps: null, avgDurationMs: null } },
    unknownRatio: 0, rubricDrilldownHint: false, riskVeto: false, statisticallyInsufficient: false, judgeOnline: true,
  },
  attempts: [
    { taskId: 't1', sampleIdx: 1, passed: false, verdicts: [{ assertionId: 'a1', value: 'no', source: 's0' }] },
    { taskId: 't1', sampleIdx: 2, passed: true, verdicts: [{ assertionId: 'a1', value: 'yes', source: 's0' }] },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(evalApi.listIterations).mockResolvedValue({ iterations: [] } as never)
  vi.mocked(evalApi.getSet).mockRejectedValue(new Error('sealed') as never)
  vi.mocked(evalApi.getRun).mockResolvedValue({ run } as never)
})

describe('报告页提炼按钮', () => {
  it('失败样本行出按钮：点击调端点并回显根因/步数红线/禁忌条数；通过样本无按钮', async () => {
    vi.mocked(evalApi.distillBadcase).mockResolvedValue({
      ok: true, appended: 1, duplicate: false,
      proposal: { taskId: 'bd-x1', rootCause: 'result_defect', rootCauseLabel: '结果缺陷', tabooActions: ['禁止重复失败', '断言 a1 不得再次失败'], failedSteps: 3, stepRedline: 5 },
      set: { id: 'eset-009', name: '回归样本库', taskCount: 1, revision: 2 },
    } as never)
    const w = mount(EvalReportPanel, { props: { runId: 'erun-distill-01' } })
    await flushPromises()

    const btn = w.find('[data-testid="distill-t1-1"]')
    expect(btn.exists()).toBe(true)
    expect(w.find('[data-testid="distill-t1-2"]').exists()).toBe(false)

    await btn.trigger('click')
    await flushPromises()
    expect(evalApi.distillBadcase).toHaveBeenCalledWith('erun-distill-01', { taskId: 't1', sampleIdx: 1 })
    const msg = w.find('[data-testid="eval-distill-msg"]').text()
    expect(msg).toContain('结果缺陷')
    expect(msg).toContain('步数红线 5')
    expect(msg).toContain('禁忌条数 2')
  })

  it('幂等重复：服务端 appended=0 时回显幂等提示；失败可见', async () => {
    vi.mocked(evalApi.distillBadcase).mockResolvedValue({
      ok: true, appended: 0, duplicate: true, ledgerDuplicate: true, proposal: null,
    } as never)
    const w = mount(EvalReportPanel, { props: { runId: 'erun-distill-01' } })
    await flushPromises()
    await w.find('[data-testid="distill-t1-1"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="eval-distill-msg"]').text()).toContain('幂等跳过')

    vi.mocked(evalApi.distillBadcase).mockRejectedValue(new Error('该样本已通过，无需提炼') as never)
    await w.find('[data-testid="distill-t1-1"]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('该样本已通过')
  })
})
