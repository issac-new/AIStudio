// 挂账清偿轮测试：TTFT 接收端 / costUsd 价目接线 / 多裁判多数决。判定端全 mock。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  evidenceFromTraceLines,
  evaluateReleaseGate,
  judgeAttempt,
  loadEvalConfig,
  _resetJudgeDefaultsForTests,
  type AskFn,
} from '../index'
import { resetPricingCacheForTests } from '../../tokens/pricing'

let pricingFile: string

beforeAll(() => {
  pricingFile = join(tmpdir(), `eval-pricing-${Date.now()}.yaml`)
  writeFileSync(pricingFile, [
    'currency: CNY',
    'models:',
    '  test-model:',
    '    input: { idle: 1, peak: 2 }',
    '    output: { idle: 2, peak: 4 }',
  ].join('\n'), 'utf8')
  process.env.HERMES_PRICING_TABLE = pricingFile
  resetPricingCacheForTests()
})

afterAll(() => {
  delete process.env.HERMES_PRICING_TABLE
  delete process.env.EVAL_JUDGE_MODELS
  resetPricingCacheForTests()
  rmSync(pricingFile, { force: true })
})

// ---------- TTFT 接收端 + 成本接线 ----------

describe('evidenceFromTraceLines（TTFT 与成本接收端）', () => {
  it('llm_span first_token_ms → ttftMs（首个 span）；trailer ttft_ms 兜底', () => {
    const withSpan = evidenceFromTraceLines([
      { type: 'chunk', kind: 'llm_span', phase: 'post', first_token_ms: 900, usage: { prompt_tokens: 100, completion_tokens: 50 } },
      { type: 'chunk', kind: 'llm_span', phase: 'post', first_token_ms: 1200, usage: { prompt_tokens: 10, completion_tokens: 5 } },
      { type: 'trailer', duration_ms: 5000 },
    ])
    expect(withSpan.efficiency?.ttftMs).toBe(900)
    expect(withSpan.efficiency?.tokens).toBe(165)

    const onlyTrailer = evidenceFromTraceLines([{ type: 'trailer', duration_ms: 1000, ttft_ms: 700 }])
    expect(onlyTrailer.efficiency?.ttftMs).toBe(700)
  })

  it('无打点 → ttftMs 缺席（当前线上轨迹实态：不造数）', () => {
    const ev = evidenceFromTraceLines([
      { type: 'header', model: 'test-model' },
      { type: 'chunk', kind: 'llm_span', phase: 'post', usage: { total_tokens: 10 } },
    ])
    expect(ev.efficiency?.ttftMs).toBeUndefined()
  })

  it('token 分面 × 价目表 → costUsd（idle/peak 中值，表币种）；未收录模型缺席', () => {
    const ev = evidenceFromTraceLines([
      { type: 'header', model: 'test-model' },
      { type: 'chunk', kind: 'llm_span', phase: 'post', usage: { prompt_tokens: 1_000_000, completion_tokens: 500_000 } },
    ])
    // input 1M×(1+2)/2 + output 0.5M×(2+4)/2 = 1.5 + 1.5 = 3.0
    expect(ev.efficiency?.costUsd).toBeCloseTo(3.0, 4)

    const unpriced = evidenceFromTraceLines([
      { type: 'header', model: 'not-in-table' },
      { type: 'chunk', kind: 'llm_span', phase: 'post', usage: { total_tokens: 100 } },
    ])
    expect(unpriced.efficiency?.costUsd).toBeUndefined()
  })

  it('只有 total_tokens 时按输入侧全价估（保守上界），不猜输出占比', () => {
    const ev = evidenceFromTraceLines([
      { type: 'header', model: 'test-model' },
      { type: 'chunk', kind: 'llm_span', phase: 'post', usage: { total_tokens: 1_000_000 } },
    ])
    // 1M 全按 input 中值价 1.5
    expect(ev.efficiency?.costUsd).toBeCloseTo(1.5, 4)
  })
})

describe('releaseGate（TTFT 实测化）', () => {
  const cfg = { ...loadEvalConfig(), ttftMaxMs: 1500 }
  const base = { taskId: 't', sampleIdx: 1, verdicts: [], judgeMeta: { backend: 'x', latencyMs: 1, cached: false, online: true } }

  it('无 ttft 数据 → 维持证据缺口（no_data）', () => {
    const gate = evaluateReleaseGate([{ ...base, efficiency: { durationMs: 100 } }], cfg)
    expect(gate.checks.find((c) => c.key === 'ttft')).toMatchObject({ status: 'no_data' })
  })

  it('有打点：最差样本 ≤1.5s 过 / >1.5s 不过', () => {
    const ok = evaluateReleaseGate([{ ...base, efficiency: { ttftMs: 1200 } }, { ...base, sampleIdx: 2, efficiency: { ttftMs: 800 } }], cfg)
    expect(ok.checks.find((c) => c.key === 'ttft')).toMatchObject({ status: 'pass' })

    const bad = evaluateReleaseGate([{ ...base, efficiency: { ttftMs: 900 } }, { ...base, sampleIdx: 2, efficiency: { ttftMs: 2100 } }], cfg)
    expect(bad.checks.find((c) => c.key === 'ttft')).toMatchObject({ status: 'fail' })
  })
})

// ---------- 多裁判多数决 ----------

const TASK = {
  id: 't1',
  problem: 'p',
  expectedBehavior: 'b',
  rubric: [
    { id: 'a1', text: '断言一是否成立', expect: 'yes', kind: 'result' as const },
    { id: 'a2', text: '断言二是否成立', expect: 'yes', kind: 'result' as const },
  ],
}

describe('多裁判多数决（EVAL_JUDGE_MODELS）', () => {
  it('两模型一致 → 裁决；分歧平票 → unknown（均值 p 留痕）', async () => {
    _resetJudgeDefaultsForTests()
    const cfg = { ...loadEvalConfig(), judgeModels: ['m-a', 'm-b'] }
    const ask: AskFn = async (req) => {
      if (req.model === 'm-a') return { a1: 0.95, a2: 0.9 }
      return { a1: 0.93, a2: 0.05 } // a2 分歧
    }
    const r = await judgeAttempt(TASK, { transcript: 'x' }, { config: cfg, ask })
    const byId = new Map(r.verdicts.map((v) => [v.assertionId, v]))
    expect(byId.get('a1')).toMatchObject({ value: 'yes' }) // 双 yes 过半
    expect(byId.get('a2')?.value).toBe('unknown') // 1 yes vs 1 no 平票
    expect(byId.get('a2')?.p).toBeCloseTo(0.475, 3)
    expect(r.judgeMeta.models).toEqual(['m-a', 'm-b'])
    expect(r.judgeMeta.online).toBe(true)
  })

  it('三模型多数决：2:1 → 多数侧；单模型宕机 fail-soft 不判离线', async () => {
    _resetJudgeDefaultsForTests()
    const cfg = { ...loadEvalConfig(), judgeModels: ['m-a', 'm-b', 'm-down'] }
    const ask: AskFn = async (req) => {
      if (req.model === 'm-down') throw new Error('judge down')
      if (req.model === 'm-a') return { a1: 0.9 }
      return { a1: 0.05 } // m-b 判 no → 1:1 平票（m-down 缺席）→ unknown
    }
    const r = await judgeAttempt(TASK, { transcript: 'x' }, { config: cfg, ask })
    const byId = new Map(r.verdicts.map((v) => [v.assertionId, v]))
    // m-down 宕机后参与模型=2，1:1 平票 → unknown；online 仍 true（fail-soft）
    expect(byId.get('a1')?.value).toBe('unknown')
    expect(r.judgeMeta.online).toBe(true)

    const ask2: AskFn = async (req) => {
      if (req.model === 'm-down') throw new Error('judge down')
      if (req.model === 'm-b') return { a1: 0.9 }
      return { a1: 0.92 } // m-a+m-b 双 yes，2/2 > 1 → yes
    }
    const r2 = await judgeAttempt(TASK, { transcript: 'y' }, { config: cfg, ask: ask2 })
    expect(new Map(r2.verdicts.map((v) => [v.assertionId, v])).get('a1')).toMatchObject({ value: 'yes' })
  })

  it('全部模型失败 → online=false 全 unknown（fail-open 不抛）', async () => {
    _resetJudgeDefaultsForTests()
    const cfg = { ...loadEvalConfig(), judgeModels: ['m-x', 'm-y'] }
    const ask: AskFn = async () => { throw new Error('all down') }
    const r = await judgeAttempt(TASK, { transcript: 'x' }, { config: cfg, ask })
    expect(r.judgeMeta.online).toBe(false)
    expect(r.verdicts.every((v) => v.value === 'unknown')).toBe(true)
  })

  it('单模型缺省路径行为不变（τ 三段映射）+ 缓存按模型隔离', async () => {
    _resetJudgeDefaultsForTests()
    const cfg = { ...loadEvalConfig() } // judgeModels=[judgeModel]
    expect(cfg.judgeModels).toEqual([cfg.judgeModel])
    const seenModels: string[] = []
    const ask: AskFn = async (req) => {
      seenModels.push(req.model)
      return { a1: 0.9, a2: 0.1 }
    }
    const r = await judgeAttempt(TASK, { transcript: 'x' }, { config: cfg, ask })
    const byId = new Map(r.verdicts.map((v) => [v.assertionId, v]))
    expect(byId.get('a1')).toMatchObject({ value: 'yes' })
    expect(byId.get('a2')).toMatchObject({ value: 'no' })
    expect(r.judgeMeta.models).toBeUndefined()
    expect(seenModels).toEqual([cfg.judgeModel])
  })

  it('多裁判缓存键隔离：同题不同模型不串答案', async () => {
    _resetJudgeDefaultsForTests()
    const cfg = { ...loadEvalConfig(), judgeModels: ['m-a', 'm-b'] }
    let calls = 0
    const ask: AskFn = async (req) => {
      calls += 1
      return req.model === 'm-a' ? { a1: 0.95 } : { a1: 0.03 }
    }
    await judgeAttempt(TASK, { transcript: 'cache-test' }, { config: cfg, ask })
    expect(calls).toBe(2)
    const r2 = await judgeAttempt(TASK, { transcript: 'cache-test' }, { config: cfg, ask })
    expect(calls).toBe(2) // 全缓存命中不再调
    expect(r2.judgeMeta.cached).toBe(true)
    expect(new Map(r2.verdicts.map((v) => [v.assertionId, v])).get('a1')?.value).toBe('unknown') // 1:1 平票复算一致
  })
})
