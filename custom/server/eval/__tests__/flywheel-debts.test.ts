// 数据飞轮 round 2 守门：Few-shot 召回（词面 v1）/ 合入门 / 台账快照与归因补充 /
// LLM 归因并联复核（mock 判定端四态）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('../clef', () => {
  class JudgeUnavailableError extends Error {}
  return {
    JudgeUnavailableError,
    clefAskMixed: vi.fn(),
  }
})

import { clefAskMixed } from '../clef'
import { fewshotInjectLine, fewshotMinSim, recallFewshot, triplesOfLedger } from '../fewshot'
import { listLedger, mergeGateOf, recordDistill } from '../flywheel'
import { distillBadCase, judgeAttributionOf } from '../badcase-distill'
import { loadEvalConfig, type EvalRun, type EvalSet } from '../types'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'flywheel-debts-'))
  process.env.EVAL_STORE = join(dir, 'eval')
  vi.mocked(clefAskMixed).mockReset()
})

afterEach(() => {
  delete process.env.EVAL_STORE
  for (const k of ['FLYWHEEL_FEWSHOT_MIN_SIM']) delete process.env[k]
  rmSync(dir, { recursive: true, force: true })
})

const entry = (over: Record<string, unknown> = {}) => ({
  taskId: 'bd-x1', sourceRunId: 'erun-1', sourceTaskId: 't1', sampleIdx: 1,
  rootCause: 'result_defect' as const, tabooActions: ['禁止重复失败'], failedSteps: 5, stepRedline: 7,
  targetSetId: 'eset-009', ...over,
})

describe('Few-shot 召回（词面 v1，D12）', () => {
  it('无文本快照的旧台账记录跳过（D16 fail-soft）；有快照产三元组', () => {
    const triples = triplesOfLedger([entry(), entry({ problem: '查北京到上海的机票', expectedBehavior: '返回正确航班' })])
    expect(triples).toHaveLength(1)
    expect(triples[0]).toMatchObject({ trigger: '查北京到上海的机票', rootCause: 'result_defect' })
    expect(triples[0].wrongDemo).toContain('禁止重复失败')
  })

  it('同题改述召回、异题不误召回；超阈值封顶 3', () => {
    const distills = [
      entry({ problem: '查北京到上海的机票', expectedBehavior: '正确航班' }),
      entry({ sourceTaskId: 't2', sampleIdx: 2, problem: '帮我看看北京飞上海的航班票', expectedBehavior: '正确航班' }),
      entry({ sourceTaskId: 't3', sampleIdx: 3, problem: '查广州到深圳的高铁票', expectedBehavior: '正确车次' }),
    ]
    const recall = recallFewshot('帮忙查一下北京到上海的机票哈', distills)
    expect(recall.candidates).toBe(3)
    expect(recall.recalled.length).toBeGreaterThanOrEqual(1)
    expect(recall.recalled[0].trigger).toContain('机票')
    // 异题（高铁）不进召回
    expect(recall.recalled.some((t) => t.trigger.includes('高铁'))).toBe(false)
    // 空查询与空台账：零召回（Prompt 保持干净）
    expect(recallFewshot('', distills).recalled).toEqual([])
    expect(recallFewshot('任意查询', []).recalled).toEqual([])
  })

  it('阈值 env 可覆盖；注入行凭据形态成对呈现', () => {
    process.env.FLYWHEEL_FEWSHOT_MIN_SIM = '0.99'
    expect(fewshotMinSim()).toBe(0.99)
    const distills = [entry({ problem: '查北京到上海的机票', expectedBehavior: '正确航班' })]
    // 完全同文相似度=1.0 过任何阈值；改述词面分 <1 过不了 0.99
    expect(recallFewshot('查北京到上海的机票', distills).recalled).toHaveLength(1)
    expect(recallFewshot('帮我查一下北京到上海的机票哈', distills).recalled).toEqual([])
    delete process.env.FLYWHEEL_FEWSHOT_MIN_SIM
    const line = fewshotInjectLine(recallFewshot('查北京到上海的机票', distills))
    expect(line).toContain('历史教训')
    expect(line).toContain('正确做法')
    expect(fewshotInjectLine(recallFewshot('完全无关的另一个话题', distills, { minSim: 0.99 }))).toBeNull()
  })
})

describe('合入门（D14：三类变更 → 回归库红线 fail-closed）', () => {
  const run = (opts: { k: number; attempts: Array<{ taskId: string; passed?: boolean }>; riskVeto?: boolean }): EvalRun => ({
    id: 'erun-9', setId: 'eset-009', target: {}, k: opts.k, status: 'done', createdAt: 1,
    attempts: opts.attempts.map((a, i) => ({ taskId: a.taskId, sampleIdx: i + 1, verdicts: [], passed: a.passed })),
    aggregates: { riskVeto: opts.riskVeto } as never,
  })
  const allPass = run({ k: 3, attempts: Array.from({ length: 3 }, () => ({ taskId: 'bd-ok', passed: true })) })

  it('三类皆未动 → not_required（不扩权）', () => {
    const r = mergeGateOf({}, allPass)
    expect(r.status).toBe('not_required')
    expect(r.changedClasses).toEqual([])
  })

  it('变更但回归库无运行 → blocked 带人话理由', () => {
    const r = mergeGateOf({ model: true }, undefined)
    expect(r.status).toBe('blocked')
    expect(r.reasons.join()).toContain('无运行')
  })

  it('k<2 → blocked；复现 → blocked；全过 → pass；riskVeto → blocked', () => {
    expect(mergeGateOf({ prompt: true }, run({ k: 1, attempts: [{ taskId: 't1' }] })).status).toBe('blocked')
    const reproduced = run({ k: 3, attempts: Array.from({ length: 3 }, () => ({ taskId: 'bd-bad', passed: false })) })
    const blocked = mergeGateOf({ prompt: true }, reproduced)
    expect(blocked.status).toBe('blocked')
    expect(blocked.reasons.join()).toContain('复现')
    expect(mergeGateOf({ prompt: true, orchestration: true }, allPass)).toMatchObject({ status: 'pass', changedClasses: ['prompt', 'orchestration'] })
    expect(mergeGateOf({ model: true }, run({ k: 3, attempts: Array.from({ length: 3 }, () => ({ taskId: 'bd-ok', passed: true })), riskVeto: true })).status).toBe('blocked')
  })
})

describe('台账补充（重复提炼补快照/归因复核）', () => {
  it('重复来源补齐缺失快照；归因复核以最近一次为准', () => {
    recordDistill(entry())
    recordDistill(entry({ problem: '查票题面', expectedBehavior: '正确做法', attribution: { verdict: 'confirmed', p: 0.91, at: 1 } }))
    const [after] = listLedger().distills
    expect(listLedger().distills).toHaveLength(1)
    expect(after.problem).toBe('查票题面')
    expect(after.attribution).toMatchObject({ verdict: 'confirmed', p: 0.91 })
    recordDistill(entry({ attribution: { verdict: 'disputed', p: 0.1, reason: '复核翻案', at: 2 } }))
    expect(listLedger().distills[0].attribution).toMatchObject({ verdict: 'disputed' })
  })
})

describe('LLM 归因并联复核（D13：四态不改主判）', () => {
  const set: EvalSet = {
    id: 'eset-001', name: 's', track: 'e2e', sealed: false, contentHash: 'h', revision: 1, createdAt: 1,
    tasks: [{
      id: 't1', problem: 'p', expectedBehavior: 'e',
      rubric: [{ id: 'a1', text: '结果正确', expect: 'yes', kind: 'result' }],
    }],
  }
  const run: EvalRun = {
    id: 'erun-1', setId: 'eset-001', target: {}, k: 2, status: 'done', createdAt: 1,
    attempts: [{ taskId: 't1', sampleIdx: 1, verdicts: [{ assertionId: 'a1', value: 'no', source: 's0' }] }],
    aggregates: {} as never,
  }

  it('P≥tauYes → confirmed；P≤tauNo → disputed 带人工复核提示', async () => {
    vi.mocked(clefAskMixed).mockResolvedValue({ flywheel_attr_confirm: 0.9 } as never)
    const distilled = distillBadCase(set, run, 't1', 1)
    expect((await judgeAttributionOf(distilled.distilled, loadEvalConfig())).verdict).toBe('confirmed')
    vi.mocked(clefAskMixed).mockResolvedValue({ flywheel_attr_confirm: 0.1 } as never)
    const disputed = await judgeAttributionOf(distilled.distilled, loadEvalConfig())
    expect(disputed.verdict).toBe('disputed')
    expect(disputed.reason).toContain('人工复核')
  })

  it('灰区 → unknown；判定端不可用 → offline 零费路径不受影响', async () => {
    const distilled = distillBadCase(set, run, 't1', 1)
    vi.mocked(clefAskMixed).mockResolvedValue({ flywheel_attr_confirm: 0.5 } as never)
    expect((await judgeAttributionOf(distilled.distilled, loadEvalConfig())).verdict).toBe('unknown')
    vi.mocked(clefAskMixed).mockRejectedValue(new Error('judge down') as never)
    const offline = await judgeAttributionOf(distilled.distilled, loadEvalConfig())
    expect(offline.verdict).toBe('offline')
    expect(offline.reason).toContain('判定端不可用')
  })
})
