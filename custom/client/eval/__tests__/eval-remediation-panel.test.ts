// @vitest-environment jsdom
// 处置单面板守门：建单调用、同卷复评→验证调用顺序、结果如实展示。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: { value: 'zh' } }) }))
vi.mock('@/api/client', () => ({ request: vi.fn(), getApiKey: () => '', getBaseUrlValue: () => '' }))
vi.mock('@/custom/eval/api', () => ({
  evalApi: {
    getRun: vi.fn(), listIterations: vi.fn(), getSet: vi.fn(), listRemediations: vi.fn(),
    createRemediation: vi.fn(), rerunRun: vi.fn(), verifyRemediation: vi.fn(),
  },
}))

import EvalReportPanel from '@/custom/eval/components/EvalReportPanel.vue'
import { evalApi } from '@/custom/eval/api'
import type { EvalRunDto, RemediationDto } from '@/custom/eval/api'

const failingRun = (): EvalRunDto => ({
  id: 'erun-closure-01',
  setId: 'eset-001',
  setHash: 'a'.repeat(40),
  setRevision: 1,
  target: {},
  k: 2,
  status: 'done',
  createdAt: 0,
  aggregates: {
    taskCount: 1,
    passAt1: 0,
    passAtK: 0,
    byLayer: {
      result: 0, trajectory: null, risk: 'unknown',
      efficiency: { avgTokens: null, avgCostUsd: null, avgSteps: null, avgDurationMs: null },
    },
    unknownRatio: 0,
    rubricDrilldownHint: false,
    riskVeto: false,
    statisticallyInsufficient: false,
    judgeOnline: true,
  },
  attempts: [{
    taskId: 't1', sampleIdx: 1, verdicts: [{ assertionId: 'a1', value: 'no', source: 's0' }], passed: false,
    judgeMeta: { backend: 's0', latencyMs: 1, cached: false, online: true },
  }],
})

const remediation = (over: Partial<RemediationDto> = {}): RemediationDto => ({
  id: 'rem-0001', runId: 'erun-closure-01', setId: 'eset-001', setHash: 'a'.repeat(40), setRevision: 1,
  taskId: 't1', sampleIdx: 1, status: 'open', rerunCount: 0, createdAt: 0, updatedAt: 0, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(evalApi.getRun).mockResolvedValue({ run: failingRun() } as never)
  vi.mocked(evalApi.listIterations).mockResolvedValue({ iterations: [] } as never)
  vi.mocked(evalApi.getSet).mockRejectedValue(new Error('sealed') as never)
  vi.mocked(evalApi.listRemediations).mockResolvedValue({ remediations: [] } as never)
})

describe('处置单面板', () => {
  it('失败样本可建处置单；已通过样本无入口', async () => {
    vi.mocked(evalApi.createRemediation).mockResolvedValue({ created: true, remediation: remediation() } as never)
    const w = mount(EvalReportPanel, { props: { runId: 'erun-closure-01' } })
    await flushPromises()
    const btn = w.find('[data-testid="remediation-open-t1-1"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await flushPromises()
    expect(evalApi.createRemediation).toHaveBeenCalledWith('erun-closure-01', { taskId: 't1', sampleIdx: 1 })
    expect(w.find('[data-testid="eval-remediation-msg"]').text()).toContain('已建')
  })

  it('同卷复评：先 rerunRun 再 verifyRemediation，关闭结果如实展示', async () => {
    vi.mocked(evalApi.listRemediations).mockResolvedValue({ remediations: [remediation()] } as never)
    vi.mocked(evalApi.rerunRun).mockResolvedValue({ run: { id: 'erun-rerun-02' } } as never)
    vi.mocked(evalApi.verifyRemediation).mockResolvedValue({
      closed: true, alreadyClosed: false, remediation: remediation({ status: 'closed', rerunCount: 1, rerunRunId: 'erun-rerun-02' }),
    } as never)
    const w = mount(EvalReportPanel, { props: { runId: 'erun-closure-01' } })
    await flushPromises()

    expect(w.find('[data-testid="eval-remediation-rem-0001"]').text()).toContain('待修复')
    await w.find('[data-testid="eval-remediation-rem-0001"] summary').trigger('click')
    await w.find('[data-testid="eval-remediation-samples-rem-0001"]').setValue('{"t1":[{"evidence":{"transcript":"OK"}}]}')
    await w.find('[data-testid="eval-remediation-rerun-rem-0001"]').trigger('click')
    await flushPromises()

    expect(evalApi.rerunRun).toHaveBeenCalledWith('erun-closure-01', {
      samples: { t1: [{ evidence: { transcript: 'OK' } }] },
      note: '复评 rem-0001',
    })
    expect(evalApi.verifyRemediation).toHaveBeenCalledWith('rem-0001', 'erun-rerun-02')
    expect(w.find('[data-testid="eval-remediation-msg"]').text()).toContain('已关闭')
    // 调用顺序：复评必须在验证之前
    const rerunOrder = vi.mocked(evalApi.rerunRun).mock.invocationCallOrder[0]
    const verifyOrder = vi.mocked(evalApi.verifyRemediation).mock.invocationCallOrder[0]
    expect(rerunOrder).toBeLessThan(verifyOrder)
  })

  it('样本 JSON 非法：不发请求并给出可读提示', async () => {
    vi.mocked(evalApi.listRemediations).mockResolvedValue({ remediations: [remediation()] } as never)
    const w = mount(EvalReportPanel, { props: { runId: 'erun-closure-01' } })
    await flushPromises()
    await w.find('[data-testid="eval-remediation-rem-0001"] summary').trigger('click')
    await w.find('[data-testid="eval-remediation-samples-rem-0001"]').setValue('{not json')
    await w.find('[data-testid="eval-remediation-rerun-rem-0001"]').trigger('click')
    await flushPromises()
    expect(evalApi.rerunRun).not.toHaveBeenCalled()
    expect(w.find('[data-testid="eval-remediation-msg"]').text()).toContain('JSON')
  })
})
