// @vitest-environment jsdom
/**
 * AI 产出质量区 VTU（三篇调研轮 E/F 件，R14/N2——V8.35 §5.8.2 判据执行产物的产品面）。
 * 覆盖：qualityCards 纯函数（过线/未过/未计分/基线红中止/未跑五态+杀伤明细+样本块）；
 * GovAiQualitySection 渲染（双卡色态、缺席如实、run 输入回车加载）。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { qualityCards, type QualityResponse } from '../api/ai-quality'
import GovAiQualitySection from '../views/gov/GovAiQualitySection.vue'

vi.mock('../api/ai-quality', async () => {
  const actual = await vi.importActual<typeof import('../api/ai-quality')>('../api/ai-quality')
  return { ...actual, fetchQuality: vi.fn() }
})
const { fetchQuality } = await import('../api/ai-quality')

function res(mut: Partial<QualityResponse['mutation']>, dup: Partial<QualityResponse['duplication']>): QualityResponse {
  return {
    run: 'r',
    mutation: { present: true, tool: 'mx-mutation-score', status: 'scored', verdict: 'pass', ...mut } as QualityResponse['mutation'],
    duplication: { present: true, tool: 'mx-dup-ratio', status: 'scored', verdict: 'pass', ...dup } as QualityResponse['duplication'],
  }
}

describe('qualityCards — 纯函数五态', () => {
  it('过线：得分/比率+杀伤明细+样本块', () => {
    const [m, d] = qualityCards(res(
      { score: 71, threshold: 50, killed: 5, total: 7, survived: 2, source: 'a/mutation-score.json' },
      { ratio: 0, threshold: 3, incrementLines: 40, duplicateLines: 0, blocks: 0, source: 'a/dup-ratio.json' },
    ))
    expect(m).toMatchObject({ state: 'pass', headline: '得分 71（线 ≥50）', detail: '杀 5/共 7（存活 2）' })
    expect(d).toMatchObject({ state: 'pass', headline: '重复率 0%（阈 ≤3%）', detail: '增量 40 行中重复 0 行，样本块 0 处' })
  })
  it('未过：fail 态透传工具原判', () => {
    const [m, d] = qualityCards(res(
      { verdict: 'fail', score: 29, threshold: 50, killed: 2, total: 7, survived: 5 },
      { verdict: 'fail', ratio: 12.5, threshold: 3, incrementLines: 40, duplicateLines: 5, blocks: 2 },
    ))
    expect(m.state).toBe('fail'); expect(d.state).toBe('fail')
  })
  it('未计分：no-mutants 与 unmeasured 如实；基线红中止给一句话', () => {
    const [m] = qualityCards(res({ status: 'no-mutants', verdict: 'pass', score: null }, {}))
    expect(m).toMatchObject({ state: 'unmeasured', headline: '未计分' })
    const [m2] = qualityCards(res({ status: 'baseline-fail', verdict: 'baseline-fail', score: null }, {}))
    expect(m2).toMatchObject({ state: 'unmeasured', headline: '基线红中止', detail: expect.stringContaining('先修基线') })
    const [, d] = qualityCards(res({}, { status: 'unmeasured', verdict: 'pass', ratio: null }))
    expect(d).toMatchObject({ state: 'unmeasured', headline: '样本太小未计' })
  })
  it('未跑：缺席原因可读+候选路径透出', () => {
    const r: QualityResponse = {
      run: 'r',
      mutation: { present: false, reason: 'file-absent', candidates: ['x/evidence/mutation-score.json'] },
      duplication: { present: false, reason: 'parse-error' },
    }
    const [m, d] = qualityCards(r)
    expect(m).toMatchObject({ state: 'absent', headline: '未跑', detail: expect.stringContaining('缺席'), source: 'x/evidence/mutation-score.json' })
    expect(d.state).toBe('absent')
  })
})

describe('GovAiQualitySection — 渲染与加载', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('空态提示在先；输入 run 回车加载双卡，色态类落卡', async () => {
    ;(fetchQuality as ReturnType<typeof vi.fn>).mockResolvedValue(res(
      { score: 71, threshold: 50, killed: 5, total: 7, survived: 2, source: 'evidence/mutation-score.json' },
      { verdict: 'fail', ratio: 12.5, threshold: 3, incrementLines: 40, duplicateLines: 5, blocks: 2, source: 'evidence/dup-ratio.json' },
    ))
    const w = mount(GovAiQualitySection)
    expect(w.find('[data-testid="gq-empty"]').exists()).toBe(true)
    await w.find('[data-testid="gq-run"]').setValue('20261015-v8-run20')
    await w.find('[data-testid="gq-run"]').trigger('keyup.enter')
    await flushPromises()
    expect(fetchQuality).toHaveBeenCalledWith('20261015-v8-run20')
    expect(w.find('[data-testid="gq-card-mutation"]').classes()).toContain('is-pass')
    expect(w.find('[data-testid="gq-card-duplication"]').classes()).toContain('is-fail')
    expect(w.find('[data-testid="gq-headline-mutation"]').text()).toBe('得分 71（线 ≥50）')
    expect(w.find('[data-testid="gq-headline-duplication"]').text()).toBe('重复率 12.5%（阈 ≤3%）')
    w.unmount()
  })

  it('端点报错如实呈现不吞', async () => {
    ;(fetchQuality as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('503 fail-closed'))
    const w = mount(GovAiQualitySection)
    await w.find('[data-testid="gq-run"]').setValue('r1')
    await w.find('[data-testid="gq-load"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="gq-error"]').text()).toContain('503')
    w.unmount()
  })
})
