// @vitest-environment jsdom
// 报告面板百度轮渲染冒烟（B3 金字塔 / B4 动作驱动 / B1 锚点漂移）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: { value: 'zh' } }) }))
vi.mock('@/api/client', () => ({ request: vi.fn(), getApiKey: () => '', getBaseUrlValue: () => '' }))
vi.mock('@/custom/eval/api', () => ({
  evalApi: { getRun: vi.fn(), listIterations: vi.fn(), getSet: vi.fn(), recordLiveEvidence: vi.fn() },
}))

import EvalReportPanel from '@/custom/eval/components/EvalReportPanel.vue'
import { evalApi } from '@/custom/eval/api'
import type { EvalRunDto } from '@/custom/eval/api'

function runOf(over: Partial<EvalRunDto['aggregates']>): EvalRunDto {
  return {
    id: 'erun-baidu-01',
    setId: 'eset-001',
    setHash: 'a'.repeat(40),
    target: {},
    k: 2,
    status: 'done',
    createdAt: 0,
    aggregates: {
      taskCount: 2,
      passAt1: 0.5,
      passAtK: 0.5,
      byLayer: {
        result: 0.5, trajectory: null, risk: 'clean',
        efficiency: { avgTokens: null, avgCostUsd: null, avgSteps: null, avgDurationMs: null },
      },
      unknownRatio: 0.05,
      rubricDrilldownHint: false,
      riskVeto: false,
      statisticallyInsufficient: false,
      judgeOnline: true,
      ...over,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(evalApi.listIterations).mockResolvedValue({ iterations: [] } as never)
  vi.mocked(evalApi.getSet).mockRejectedValue(new Error('sealed') as never)
})

describe('EvalReportPanel 百度轮渲染（B3/B4）', () => {
  it('四层金字塔渲染：模型/应用/Agent/线上各层读数到位；无数据层如实缺席', async () => {
    vi.mocked(evalApi.getRun).mockResolvedValue({ run: runOf({
      pyramid: {
        anchorDrift: false,
        layers: [
          { key: 'model', status: 'pass', readings: [{ key: 'judge_online', label: '判定端', value: '在线', tone: 'good' }] },
          { key: 'app', status: 'no_data', readings: [] },
          { key: 'agent', status: 'pass', readings: [{ key: 'pass_at_k', label: 'pass@k', value: '50.0%', tone: 'muted' }] },
          { key: 'online', status: 'warn', readings: [{ key: 'gate_ttft', label: 'ttft', value: 'no_data', tone: 'muted' }, { key: 'gate_tool_success', label: 'tool_success', value: '97%（阈值 ≥ 99.0%）', tone: 'bad' }] },
        ],
      },
    }) } as never)
    const w = mount(EvalReportPanel, { props: { runId: 'erun-baidu-01' } })
    await flushPromises()
    expect(w.find('[data-testid="eval-report-pyramid"]').exists()).toBe(true)
    expect(w.find('[data-testid="eval-pyramid-model"]').text()).toContain('判定端')
    expect(w.find('[data-testid="eval-pyramid-app"]').text()).toContain('无读数')
    expect(w.find('[data-testid="eval-pyramid-online"]').classes()).toContain('pyramid__layer--warn')
    // 无漂移不显示改版提示
    expect(w.find('[data-testid="eval-report-drift"]').exists()).toBe(false)
  })

  it('动作驱动清单渲染：读数/条件/动作三列；高优先行在列', async () => {
    vi.mocked(evalApi.getRun).mockResolvedValue({ run: runOf({
      actions: [
        { key: 'risk_veto', metric: '红线否决', condition: '任一 risk 断言命中红线', action: '阻断发布；坏例回流回归库 + 根因排查', priority: 'high' },
        { key: 'k_insufficient', metric: 'k=1', condition: '单跑不作门禁', action: '补 k≥2 采样重跑', priority: 'low' },
      ],
    }) } as never)
    const w = mount(EvalReportPanel, { props: { runId: 'erun-baidu-01' } })
    await flushPromises()
    expect(w.find('[data-testid="eval-report-actions"]').exists()).toBe(true)
    expect(w.find('[data-testid="eval-action-risk_veto"]').text()).toContain('阻断发布')
    expect(w.find('[data-testid="eval-action-risk_veto"]').classes()).toContain('action-high')
    expect(w.find('[data-testid="eval-action-k_insufficient"]').exists()).toBe(true)
  })

  it('锚点漂移提示渲染（集已改版警示）', async () => {
    vi.mocked(evalApi.getRun).mockResolvedValue({ run: runOf({
      pyramid: { anchorDrift: true, layers: [] },
    }) } as never)
    const w = mount(EvalReportPanel, { props: { runId: 'erun-baidu-01' } })
    await flushPromises()
    expect(w.find('[data-testid="eval-report-drift"]').text()).toContain('集已改版')
  })

  it('无金字塔/动作面（旧 run 数据）不渲染块、不报错', async () => {
    vi.mocked(evalApi.getRun).mockResolvedValue({ run: runOf({}) } as never)
    const w = mount(EvalReportPanel, { props: { runId: 'erun-baidu-01' } })
    await flushPromises()
    expect(w.find('[data-testid="eval-report-pyramid"]').exists()).toBe(false)
    expect(w.find('[data-testid="eval-report-actions"]').exists()).toBe(false)
  })

  it('线上证据回填表单：QPS 全组+分档提交走 recordLiveEvidence；填一半 QPS 拦截', async () => {
    vi.mocked(evalApi.getRun).mockResolvedValue({ run: runOf({
      releaseGate: { verdict: 'no_data', checks: [], measuredCount: 0, gapKeys: ['qps_headroom'], basis: 'x' },
    }) } as never)
    vi.mocked(evalApi.recordLiveEvidence).mockResolvedValue({ run: {} } as never)
    const w = mount(EvalReportPanel, { props: { runId: 'erun-baidu-01' } })
    await flushPromises()

    // 填一半 QPS → 拦截不发包
    await w.find('[data-testid="eval-live-target"]').setValue('100')
    await w.find('form[data-testid="eval-live-form"]').trigger('submit')
    await flushPromises()
    expect(evalApi.recordLiveEvidence).not.toHaveBeenCalled()

    // 全组 QPS + 简单档 → 发包载荷正确
    await w.find('[data-testid="eval-live-achieved"]').setValue('95')
    await w.find('[data-testid="eval-live-err"]').setValue('0.005')
    await w.find('[data-testid="eval-live-p99"]').setValue('1.8')
    await w.find('[data-testid="eval-live-simple"]').setValue('4000')
    await w.find('form[data-testid="eval-live-form"]').trigger('submit')
    await flushPromises()
    expect(evalApi.recordLiveEvidence).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(evalApi.recordLiveEvidence).mock.calls[0][1]
    expect(payload.qpsProbe).toMatchObject({ targetQps: 100, achievedQps: 95, errorRate: 0.005, p99ToP50: 1.8 })
    expect(payload.responseTiers).toEqual([{ tier: 'simple', samples: 1, p95Ms: 4000 }])
  })
})
