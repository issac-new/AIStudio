// overlay/proactivity：反事实差值预演单测（2026-11-14 Proactive AI 二轮 P2）。
// 覆盖：概率→差值解释（纯函数）、置信分档、benefit 融合权重（high 全信/low 对半回撤）、
// fail-open（双缺＝null→静态表）、开关关闭＝空 Map、批量上限、clef 通道异常熔断不外抛。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  buildPreviewQuestions, interpretPreview, mergeBenefit, previewSuggestions,
  type PreviewInput,
} from '../anticipation-preview'

const INPUT: PreviewInput = { topicKey: 'unblock-blocked:card-1', kind: 'unblock-blocked', target: 'card-1', note: '卡阻塞 4 小时' }

describe('P2 预演解释（纯函数）', () => {
  it('双概率齐全：delta=2P−1；同向强＝high 置信；explanation 含两概率', () => {
    const r = interpretPreview({ actBetter: 0.9, abstainMiss: 0.85 }, INPUT)
    expect(r).not.toBeNull()
    expect(r!.delta).toBeCloseTo(0.8, 5)
    expect(r!.confidence).toBe('high')
    expect(r!.explanation).toContain('P(行动更优)=0.90')
    expect(r!.explanation).toContain('沉默错失')  // abstainOutcome 呈现
  })

  it('actBetter 缺失＝预演失败（null→调用方回静态表）', () => {
    expect(interpretPreview({ abstainMiss: 0.9 }, INPUT)).toBeNull()
    expect(interpretPreview({}, INPUT)).toBeNull()
  })

  it('置信分档：act≥0.7 且 miss≥0.7=high；一强=medium；都弱=low；单问强=medium', () => {
    expect(interpretPreview({ actBetter: 0.9, abstainMiss: 0.9 }, INPUT)!.confidence).toBe('high')
    expect(interpretPreview({ actBetter: 0.9, abstainMiss: 0.2 }, INPUT)!.confidence).toBe('medium')
    expect(interpretPreview({ actBetter: 0.2, abstainMiss: 0.2 }, INPUT)!.confidence).toBe('low')
    expect(interpretPreview({ actBetter: 0.8 }, INPUT)!.confidence).toBe('medium')
  })

  it('delta 截断到 [-1,1]', () => {
    expect(interpretPreview({ actBetter: 1, abstainMiss: 1 }, INPUT)!.delta).toBe(1)
    expect(interpretPreview({ actBetter: 0, abstainMiss: 0 }, INPUT)!.delta).toBe(-1)
  })
})

describe('P2 benefit 融合权重', () => {
  it('无预演＝静态分原值（source=static）', () => {
    expect(mergeBenefit(0.7)).toEqual({ benefit: 0.7, source: 'static' })
  })

  it('high 置信＝预演差值全权重；low＝与静态分对半回撤', () => {
    const high = mergeBenefit(0.7, { delta: 0.8, actOutcome: '', abstainOutcome: '', explanation: '', confidence: 'high' })
    expect(high.source).toBe('preview')
    expect(high.benefit).toBeCloseTo(0.9, 5) // (0.8+1)/2
    const low = mergeBenefit(0.7, { delta: 0.8, actOutcome: '', abstainOutcome: '', explanation: '', confidence: 'low' })
    expect(low.benefit).toBeCloseTo(0.8, 5) // 0.5*0.9+0.5*0.7
  })
})

describe('P2 批量预演编排', () => {
  const prevOff = process.env.ANTICIPATION_PREVIEW
  const prevMax = process.env.ANTICIPATION_PREVIEW_MAX
  afterEach(() => {
    if (prevOff === undefined) delete process.env.ANTICIPATION_PREVIEW
    else process.env.ANTICIPATION_PREVIEW = prevOff
    if (prevMax === undefined) delete process.env.ANTICIPATION_PREVIEW_MAX
    else process.env.ANTICIPATION_PREVIEW_MAX = prevMax
  })

  it('开关 off＝空 Map（fail-open 回静态表）', async () => {
    process.env.ANTICIPATION_PREVIEW = 'off'
    const out = await previewSuggestions([INPUT], { ask: async () => ({ actBetter: 0.9 }) })
    expect(out.size).toBe(0)
  })

  it('单条 ask 失败跳过、成功进 Map；上限截断', async () => {
    process.env.ANTICIPATION_PREVIEW = 'on'
    delete process.env.ANTICIPATION_PREVIEW_MAX
    const many = Array.from({ length: 8 }, (_, i) => ({ ...INPUT, topicKey: `k${i}`, target: `t${i}` }))
    const out = await previewSuggestions(many, {
      ask: async (req) => {
        // 问句集里必含 actBetter
        if (!req.questions.actBetter) throw new Error('bad request')
        return { actBetter: 0.9, abstainMiss: 0.8 }
      },
    })
    expect(out.size).toBe(5) // 缺省上限 5
  })

  it('ask 全抛错＝空 Map（熔断不外抛）', async () => {
    process.env.ANTICIPATION_PREVIEW = 'on'
    const out = await previewSuggestions([INPUT], { ask: async () => { throw new Error('judge down') } })
    expect(out.size).toBe(0)
  })

  it('问句模板含建议内容与保守措辞（证据不足=否）', () => {
    const q = buildPreviewQuestions(INPUT)
    expect(q.state).toContain('unblock-blocked')
    expect(q.actBetter).toContain('证据不足=否')
  })
})
