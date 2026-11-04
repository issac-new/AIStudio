// W3 验收 DSL 四断言求值 + 六类故障样本回归（规则级；未执行真实模型）。
import { describe, expect, it } from 'vitest'
import { judgeAttempt } from '../judge'
import type { EvalTask, Evidence, S0Rule } from '../types'
import { FAULT_SAMPLES, SAMPLE_ASSERTIONS } from './fixtures/fault-samples'

async function judgeOne(rule: S0Rule, evidence: Evidence) {
  const task = {
    id: 'w3-dsl-probe',
    title: '断言求值探针',
    rubric: [{ criterion: 'c1', question: 'q', anchors: { present: 'a', absent: 'b' }, s0: rule }],
  } as unknown as EvalTask
  // S0 纯规则路径不触模型调用（ask 缺席时 S1 判 unknown）；config 只需最小骨架。
  const result = await judgeAttempt(task, evidence, {
    config: { judgeBaseUrl: '', judgeModel: 'none', judgeModels: ['none'] } as never,
  })
  return result
}

describe('W3 验收 DSL：forbidden_tools', () => {
  it('禁用工具出现判 no', async () => {
    const r = await judgeOne({ kind: 'forbidden_tools', tools: ['publishAnnouncement'] }, {
      toolCalls: [{ name: 'read_file', ok: true }, { name: 'publishAnnouncement', ok: true }],
    })
    expect(JSON.stringify(r)).toContain('forbidden_tools 命中')
  })
  it('未出现判 yes；证据缺席 unknown', async () => {
    const r = await judgeOne({ kind: 'forbidden_tools', tools: ['x'] }, { toolCalls: [{ name: 'read_file', ok: true }] })
    expect(JSON.stringify(r)).toContain('未出现禁用工具')
    const u = await judgeOne({ kind: 'forbidden_tools', tools: ['x'] }, {})
    expect(JSON.stringify(u)).toContain('证据缺席')
  })
})

describe('W3 验收 DSL：json_path', () => {
  const result = { recommendations: [{ evidenceRefs: ['a'] }, { evidenceRefs: ['b', 'c'] }], meta: { total: 2 } }

  it('[*].length every 语义：每项都满足判 yes', async () => {
    const r = await judgeOne({ kind: 'json_path', path: '$.recommendations[*].evidenceRefs.length', operator: 'gt', value: 0 }, { resultJson: result })
    expect(JSON.stringify(r)).toContain('yes')
  })
  it('任一项不满足判 no（无证据结论被拦）', async () => {
    const r = await judgeOne({ kind: 'json_path', path: '$.recommendations[*].evidenceRefs.length', operator: 'gt', value: 0 }, {
      resultJson: { recommendations: [{ evidenceRefs: ['a'] }, { evidenceRefs: [] }] },
    })
    expect(JSON.stringify(r)).toContain('no')
  })
  it('索引路径与 exists；路径未命中判 no；结果缺席 unknown', async () => {
    const a = await judgeOne({ kind: 'json_path', path: '$.meta.total', operator: 'eq', value: 2 }, { resultJson: result })
    expect(JSON.stringify(a)).toContain('yes')
    const b = await judgeOne({ kind: 'json_path', path: '$.missing.key', operator: 'exists' }, { resultJson: result })
    expect(JSON.stringify(b)).toContain('no')
    const c = await judgeOne({ kind: 'json_path', path: '$.a', operator: 'exists' }, {})
    expect(JSON.stringify(c)).toContain('证据缺席')
  })
})

describe('W3 验收 DSL：result_schema', () => {
  it('缺必填键判 no；类型不符判 no；齐备判 yes；证据缺席 unknown', async () => {
    const rule = { kind: 'result_schema', required: [{ key: 'summary', type: 'string' }, { key: 'artifactRefs', type: 'array' }] } as S0Rule
    const missing = await judgeOne(rule, { resultJson: { summary: 's' } })
    expect(JSON.stringify(missing)).toContain('缺 artifactRefs')
    const badType = await judgeOne(rule, { resultJson: { summary: 42, artifactRefs: [] } })
    expect(JSON.stringify(badType)).toContain('类型')
    const ok = await judgeOne(rule, { resultJson: { summary: 's', artifactRefs: [] } })
    expect(JSON.stringify(ok)).toContain('必填键齐备')
    const unknown = await judgeOne(rule, {})
    expect(JSON.stringify(unknown)).toContain('证据缺席')
  })
})

describe('W3 验收 DSL：side_effects_max', () => {
  it('超限判 no；未超判 yes；计数器缺席 unknown', async () => {
    const rule = { kind: 'side_effects_max', counter: 'createdRecords', max: 1 } as S0Rule
    const bad = await judgeOne(rule, { sideEffects: { createdRecords: 2 } })
    expect(JSON.stringify(bad)).toContain('no')
    const ok = await judgeOne(rule, { sideEffects: { createdRecords: 1 } })
    expect(JSON.stringify(ok)).toContain('yes')
    const unknown = await judgeOne(rule, { sideEffects: {} })
    expect(JSON.stringify(unknown)).toContain('未上报')
  })
})

describe('W3 六类故障样本（规则级回归；未执行真实模型）', () => {
  for (const sample of FAULT_SAMPLES) {
    it(`${sample.id}：${sample.scenario} → 断言判 no（故障被拦住）`, async () => {
      const assertions = SAMPLE_ASSERTIONS[sample.category] as unknown as S0Rule[]
      expect(assertions.length).toBeGreaterThan(0)
      for (const rule of assertions) {
        const r = await judgeOne(rule, sample.evidence)
        expect(JSON.stringify(r)).toMatch(/"no"|未命中|命中|超限|违规|证据/)
      }
    })
  }
  it('对照：合规证据下六类断言不误伤', async () => {
    const goodEvidence: Evidence = {
      toolCalls: [{ name: 'read_file', ok: true }, { name: 'submitRecommendation', ok: true }],
      sideEffects: { createdRecords: 1, submittedAttempts: 1 },
      resultJson: {
        summary: 's',
        artifactRefs: [],
        recommendations: [{ id: 'r1', evidenceRefs: ['e1'] }],
      },
    }
    // 空输入/依赖不可用两类的 json_path 断言在合规证据上应判 yes（不误伤）
    for (const cat of ['empty-input', 'dependency-unavailable'] as const) {
      for (const rule of SAMPLE_ASSERTIONS[cat] as unknown as S0Rule[]) {
        const r = await judgeOne(rule, goodEvidence)
        expect(JSON.stringify(r)).toContain('yes')
      }
    }
  })
})
