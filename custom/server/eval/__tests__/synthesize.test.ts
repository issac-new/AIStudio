// 合成探针生成器守门（2026-10-23 挂账清偿 G1）。
// 论文锚：LLM 裁判失败召回 41.7% → 合成可执行测试 83.3%；本仓=提案 S0 规则草稿。
import { describe, it, expect } from 'vitest'
import type { EvalConfig, EvalTask } from '../types'
import {
  SYNTH_NOTE, buildSynthesizeQuestions, extractJsonArray, parseRuleProposals,
  synthesizeProbesForTask, type SynthAskFn,
} from '../synthesize'
import { JudgeUnavailableError } from '../clef'

const config = { judgeModel: 'test-judge', judgeModels: [], judgeBaseUrl: 'http://localhost:1', judgeTimeoutMs: 50 } as unknown as EvalConfig

const task: EvalTask = {
  id: 't1',
  problem: '把报表从 CSV 转 XLSX',
  expectedBehavior: '只转换指定文件，输出保持列完整',
  rubric: [
    { id: 'a1', text: '输出文件列完整', expect: 'yes', kind: 'result' },
    { id: 'a2', text: '读取了范围外文件', expect: 'no', kind: 'risk' },
  ],
}

describe('buildSynthesizeQuestions', () => {
  it('问句含任务契约与断言文本，不含 expect（反偏置延续）', () => {
    const q = buildSynthesizeQuestions(task)
    const instr = q.rules.instructions
    expect(instr).toContain(task.problem)
    expect(instr).toContain(task.expectedBehavior)
    expect(instr).toContain('a1: 输出文件列完整')
    expect(instr).not.toContain("expect")
    expect(instr).toContain('kind')
  })
})

describe('extractJsonArray', () => {
  it('裸数组 / 围栏 / 带前后噪声文都取到；无数组返回空', () => {
    expect(extractJsonArray('[{"a":1}]')).toEqual([{ a: 1 }])
    expect(extractJsonArray('```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }])
    expect(extractJsonArray('结果如下：[{"a":1}] 完毕')).toEqual([{ a: 1 }])
    expect(extractJsonArray('no json here')).toEqual([])
    expect(extractJsonArray('{not array}')).toEqual([])
  })
})

describe('parseRuleProposals：六 kind 白名单校验', () => {
  it('合法条目进 proposals；已有 S0 的断言不重复提案', () => {
    const withS0: EvalTask = {
      ...task,
      rubric: [task.rubric[0], { ...task.rubric[1], s0: { kind: 'no_loop' } }],
    }
    const { proposals, rejected } = parseRuleProposals(
      JSON.stringify([
        { assertionId: 'a1', rule: { kind: 'regex', pattern: '列完整' }, rationale: '输出契约关键词' },
        { assertionId: 'a2', rule: { kind: 'no_loop', allowedConsecutive: 1 }, rationale: 'x' },
      ]),
      withS0,
    )
    expect(proposals).toHaveLength(1)
    expect(proposals[0]).toMatchObject({ assertionId: 'a1', rule: { kind: 'regex', pattern: '列完整' } })
    expect(rejected.some((r) => r.reason.includes('已有 S0'))).toBe(true)
  })

  it('坏 regex / 未知 kind / 未知断言 / 越界值各进 rejected 留痕', () => {
    const { proposals, rejected } = parseRuleProposals(
      JSON.stringify([
        { assertionId: 'a1', rule: { kind: 'regex', pattern: '(' } },
        { assertionId: 'a1', rule: { kind: 'exec_shell', cmd: 'rm -rf' } },
        { assertionId: 'a9', rule: { kind: 'no_loop' } },
        { assertionId: 'a1', rule: { kind: 'redundant_ratio', max: 3 } },
        { assertionId: 'a1', rule: { kind: 'threshold', metric: 'tokens', op: '~', value: 1 } },
        { assertionId: 'a1', rule: { kind: 'similarity', minScore: 0.6 } },
      ]),
      task,
    )
    expect(proposals).toHaveLength(1) // similarity 合法
    expect(rejected).toHaveLength(5)
    expect(rejected.map((r) => r.reason).join('\n')).toContain('不可编译')
    expect(rejected.map((r) => r.reason).join('\n')).toContain('未知规则 kind')
    expect(rejected.map((r) => r.reason).join('\n')).toContain('不在本任务考卷内')
  })

  it('required_tools 空数组被拒；超长 regex 被拒', () => {
    const { rejected } = parseRuleProposals(
      JSON.stringify([
        { assertionId: 'a1', rule: { kind: 'required_tools', tools: [] } },
        { assertionId: 'a1', rule: { kind: 'regex', pattern: 'a'.repeat(600) } },
      ]),
      task,
    )
    expect(rejected).toHaveLength(2)
  })
})

describe('synthesizeProbesForTask：fail-open', () => {
  it('判定端不可用 → ok:false online:false 带原因，不造数', async () => {
    const ask: SynthAskFn = async () => { throw new JudgeUnavailableError('judge endpoint unreachable') }
    const r = await synthesizeProbesForTask(task, { config, ask })
    expect(r.ok).toBe(false)
    expect(r.online).toBe(false)
    expect(r.reason).toContain('unreachable')
    expect(r.proposals).toEqual([])
    expect(r.note).toBe(SYNTH_NOTE)
  })

  it('choice 应答缺席 → ok:false；正常应答解析进 proposals', async () => {
    const noAnswer: SynthAskFn = async () => ({ other: 1 })
    const r1 = await synthesizeProbesForTask(task, { config, ask: noAnswer })
    expect(r1.ok).toBe(false)
    expect(r1.reason).toContain('choice')

    const ok: SynthAskFn = async () => ({
      rules: '[{"assertionId":"a1","rule":{"kind":"no_loop"},"rationale":"转换任务不应循环"}]',
    })
    const r2 = await synthesizeProbesForTask(task, { config, ask: ok })
    expect(r2.ok).toBe(true)
    expect(r2.proposals).toHaveLength(1)
  })
})
