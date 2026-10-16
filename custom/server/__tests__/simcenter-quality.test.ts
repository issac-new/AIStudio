/**
 * /quality 端点纯函数面单测（三篇调研轮 E/F 件，方案正本 V8.35 §5.8.2 判据执行产物）。
 * 覆盖：变异/重复两类证据 JSON 的三锚校验（tool/status/verdict）、缺席/坏 JSON/坏形状
 * 三档降级、数值字段缺席不猜（undefined/null 透传）、双指标各自白名单字段。
 * HTTP 面（503 fail-closed/两处候选路径）走部署窗活体验证——同 orgloop 模式。
 */
import { describe, expect, it } from 'vitest'
import { parseQualityMetric } from '../simcenter/simcenter-controller'

const MUTATION_JSON = JSON.stringify({
  tool: 'mx-mutation-score', status: 'scored', verdict: 'pass', score: 71, threshold: 50,
  total: 7, killed: 5, survived: 2, timeout: 0, ts: '2026-10-16T04:00:00.000Z',
})
const DUP_JSON = JSON.stringify({
  tool: 'mx-dup-ratio', status: 'scored', verdict: 'fail', ratio: 12.5, threshold: 3,
  incrementLines: 40, duplicateLines: 5, blocks: [{ preview: ['a', 'b'] }, { preview: ['c'] }], ts: '2026-10-16T04:01:00.000Z',
})

describe('parseQualityMetric — 变异得分证据', () => {
  it('完整产物：三锚过+杀伤计数与得分透传', () => {
    const v = parseQualityMetric(MUTATION_JSON, 'mx-mutation-score')
    expect(v).toMatchObject({ present: true, status: 'scored', verdict: 'pass', score: 71, threshold: 50, total: 7, killed: 5, survived: 2, timeout: 0 })
  })
  it('score=null（no-mutants/baseline-fail）如实透传不猜', () => {
    const v = parseQualityMetric(JSON.stringify({ tool: 'mx-mutation-score', status: 'no-mutants', verdict: 'pass', score: null }), 'mx-mutation-score')
    expect(v.present).toBe(true)
    expect(v.score).toBeNull()
    expect(v.total).toBeUndefined()
  })
})

describe('parseQualityMetric — 重复率证据', () => {
  it('完整产物：比率/阈值/行数/样本块计数透传', () => {
    const v = parseQualityMetric(DUP_JSON, 'mx-dup-ratio')
    expect(v).toMatchObject({ present: true, verdict: 'fail', ratio: 12.5, threshold: 3, incrementLines: 40, duplicateLines: 5, blocks: 2 })
  })
  it('ratio=null（unmeasured）如实透传', () => {
    const v = parseQualityMetric(JSON.stringify({ tool: 'mx-dup-ratio', status: 'unmeasured', verdict: 'pass', ratio: null }), 'mx-dup-ratio')
    expect(v.present).toBe(true)
    expect(v.ratio).toBeNull()
  })
})

describe('parseQualityMetric — 三档降级（N1 缺席如实）', () => {
  it('file-absent / parse-error / shape-error（tool 错配也算 shape-error）', () => {
    expect(parseQualityMetric(null, 'mx-mutation-score')).toMatchObject({ present: false, reason: 'file-absent' })
    expect(parseQualityMetric('不是 json', 'mx-mutation-score')).toMatchObject({ present: false, reason: 'parse-error' })
    expect(parseQualityMetric('[]', 'mx-mutation-score')).toMatchObject({ present: false, reason: 'shape-error' })
    expect(parseQualityMetric(DUP_JSON, 'mx-mutation-score')).toMatchObject({ present: false, reason: 'shape-error' })
    expect(parseQualityMetric(MUTATION_JSON, 'mx-dup-ratio')).toMatchObject({ present: false, reason: 'shape-error' })
    expect(parseQualityMetric(JSON.stringify({ tool: 'mx-mutation-score', status: 1, verdict: 'pass' }), 'mx-mutation-score')).toMatchObject({ present: false, reason: 'shape-error' })
  })
})
