// @vitest-environment jsdom
// 优化建议面板冒烟（2026-10-14 阿里调研轮 A+F）：三清单+瀑布渲染、源状态如实、空态。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: { value: 'zh' } }) }))
vi.mock('@/api/client', () => ({ request: vi.fn(), getApiKey: () => '', getBaseUrlValue: () => '' }))
vi.mock('@/custom/eval/api', () => ({
  evalApi: { adviceReport: vi.fn() },
}))

import EvalAdvicePanel from '@/custom/eval/components/EvalAdvicePanel.vue'
import { evalApi } from '@/custom/eval/api'

const report = {
  generatedAt: '2026-10-14T04:00:00Z',
  windowDays: 7,
  sources: [
    { id: 'hermes-web-ui.db sessions', available: true },
    { id: 'traces 工具 span', available: false, note: '宿主侧仅 header/trailer' },
  ],
  tokenTop: [{
    id: 's1', title: '重构会话', model: 'glm-5', lastActive: 1,
    inputTokens: 900, outputTokens: 100, totalTokens: 1000, estimatedCostUsd: 0.42,
  }],
  slowStages: [{ stage: 'devimpl', entered: 3, totalSec: 3600, medianSec: 1200, p90Sec: 1800, sharePct: 61.2 }],
  gateErrorTop: [{ key: 'archgate:evidence_missing', gate: 'archgate', reason: 'evidence_missing', count: 2, lastAt: 200, sample: '缺锚点' }],
  waterfall: {
    stages: [
      { stage: 'devimpl', entered: 3, totalSec: 3600, medianSec: 1200, p90Sec: 1800, sharePct: 61.2 },
      { stage: 'review', entered: 3, totalSec: 600, medianSec: 300, p90Sec: 400, sharePct: 10.2 },
    ],
    cards: [{ taskId: 't1', spanSec: 4200, transitions: 3 }],
    medianSpanSec: 4200,
    events: 6,
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(evalApi.adviceReport).mockResolvedValue({ ok: true, report } as never)
})

describe('EvalAdvicePanel 冒烟', () => {
  it('三张清单+瀑布渲染；缺席源如实标出', async () => {
    const w = mount(EvalAdvicePanel)
    await flushPromises()
    expect(w.find('[data-testid="eval-advice"]').exists()).toBe(true)
    expect(w.find('[data-testid="eval-advice-tok-s1"]').text()).toContain('重构会话')
    expect(w.text()).toContain('archgate / evidence_missing')
    expect(w.text()).toContain('缺锚点')
    expect(w.findAll('.advice__fall').length).toBe(2)
    // 缺席源划线呈现（诚实缺席，不造数）
    expect(w.find('.advice__src--off').text()).toContain('traces')
  })

  it('窗口切换重新拉取', async () => {
    const w = mount(EvalAdvicePanel)
    await flushPromises()
    await w.find('[data-testid="eval-advice-days"]').setValue('30')
    await w.find('[data-testid="eval-advice-reload"]').trigger('click')
    await flushPromises()
    expect(evalApi.adviceReport).toHaveBeenLastCalledWith(30)
  })
})
