// overlay[eval] 腾讯评测体系轮单测（过程指标纯函数面）。
// 范式锚点：specs/assets/wx-articles-2026-10-13/tencent-agent-eval.md §03/§08/§09。
// 判定端零依赖（本文件只测纯函数与聚合，不触发 judge 调用）。
import { describe, it, expect } from 'vitest'
import {
  lcsLength,
  levenshtein,
  toolHeadAccuracyOf,
  trajectoryMatchOf,
  byLinkOf,
  byExceptionOf,
  processMetricsOf,
  p99Of,
  sixDimensionsOf,
  toolSuccessRateOf,
} from '../metrics'
import { evaluateReleaseGate, loadReleaseGateConfig } from '../releaseGate'
import type { Attempt, EvalRun, EvalSet, RunAggregates } from '../types'

// ---------- 夹具 ----------

function attemptOf(over: Partial<Attempt> & { taskId: string }): Attempt {
  return { sampleIdx: 1, verdicts: [], ...over }
}

function runOf(attempts: Attempt[], aggregatesOver: Partial<RunAggregates> = {}): EvalRun {
  const aggregates: RunAggregates = {
    taskCount: 0,
    passAt1: null,
    passAtK: null,
    byLayer: {
      result: null,
      trajectory: null,
      risk: 'none',
      efficiency: { avgTokens: null, avgCostUsd: null, avgSteps: null, avgDurationMs: null },
    },
    unknownRatio: 0,
    rubricDrilldownHint: false,
    riskVeto: false,
    statisticallyInsufficient: false,
    judgeOnline: true,
    ...aggregatesOver,
  }
  return { id: 'erun-x', setId: 'eset-001', target: {}, k: 1, status: 'done', attempts, aggregates, createdAt: 0 }
}

// ---------- 序列比对原语 ----------

describe('序列比对原语（LCS / 编辑距离）', () => {
  it('LCS：同序全匹配=长度；乱序丢失', () => {
    expect(lcsLength(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(3)
    expect(lcsLength(['a', 'b', 'c'], ['c', 'b', 'a'])).toBe(1)
    expect(lcsLength(['a', 'b'], [])).toBe(0)
  })

  it('编辑距离：恒等=0；一次插入=1；全换=长度', () => {
    expect(levenshtein(['read', 'write', 'commit'], ['read', 'write', 'commit'])).toBe(0)
    expect(levenshtein(['read', 'commit'], ['read', 'grep', 'commit'])).toBe(1)
    expect(levenshtein(['a', 'b'], ['x', 'y'])).toBe(2)
  })
})

// ---------- 过程双指标 ----------

describe('过程双指标（Tool Head Accuracy / 轨迹匹配分）', () => {
  it('完全按期望执行 → 正确率=1、绕路=0', () => {
    const expected = ['read_file', 'edit_file', 'run_tests']
    const actual = ['read_file', 'edit_file', 'run_tests']
    expect(toolHeadAccuracyOf(expected, actual)).toBe(1)
    expect(trajectoryMatchOf(expected, actual)).toBe(0)
  })

  it('碰巧答对被抓获：冗余绕路不扣选择正确率，但轨迹绕路>0（两指标分工）', () => {
    const expected = ['read_file', 'edit_file', 'run_tests']
    const actual = ['read_file', 'grep_code', 'edit_file', 'run_tests', 'ls_dir']
    // LCS=3（read/edit/run_tests 按序都在）→ 选择正确率=1（冗余调用归轨迹指标管）
    expect(toolHeadAccuracyOf(expected, actual)).toBe(1)
    // 编辑距离=2（插 grep + 插 ls）/3 → 绕路 2/3
    expect(trajectoryMatchOf(expected, actual)).toBeCloseTo(2 / 3, 5)
  })

  it('完全跑偏 → 正确率=0、绕路=1', () => {
    expect(toolHeadAccuracyOf(['a', 'b'], ['x', 'y'])).toBe(0)
    expect(trajectoryMatchOf(['a', 'b'], ['x', 'y'])).toBe(1)
  })

  it('实际为空 → 正确率 0、绕路 1（有证据、无调用）', () => {
    expect(toolHeadAccuracyOf(['a'], [])).toBe(0)
    expect(trajectoryMatchOf(['a'], [])).toBe(1)
  })
})

// ---------- 六环节分段 / 异常分桶 ----------

describe('链路六环节分段（byLink）', () => {
  const set: EvalSet = {
    id: 's1', name: 'link-set', track: 'e2e', sealed: false, createdAt: 0,
    tasks: [{
      id: 't1', problem: 'p', expectedBehavior: 'b',
      rubric: [
        { id: 'a1', text: '意图识别正确', expect: 'yes', kind: 'result', link: 'intent' },
        { id: 'a2', text: '工具选择正确', expect: 'yes', kind: 'trajectory', link: 'tool_choice' },
        { id: 'a3', text: '参数完整', expect: 'yes', kind: 'trajectory', link: 'params' },
      ],
    }],
  }

  it('无 link 标注 → 缺省不产噪', () => {
    const plain: EvalSet = { ...set, tasks: [{ ...set.tasks[0], rubric: [{ id: 'a1', text: 'x', expect: 'yes', kind: 'result' }] }] }
    expect(byLinkOf(plain, runOf([]))).toBeUndefined()
  })

  it('环节独立分段：intent 过、tool_choice 败、params unknown', () => {
    const run = runOf([attemptOf({
      taskId: 't1',
      verdicts: [
        { assertionId: 'a1', value: 'yes', source: 's1' },
        { assertionId: 'a2', value: 'no', source: 's1' },
        { assertionId: 'a3', value: 'unknown', source: 's1' },
      ],
    })])
    const byLink = byLinkOf(set, run)
    expect(byLink?.intent).toEqual({ total: 1, passed: 1, unknown: 0, passRate: 1 })
    expect(byLink?.tool_choice).toEqual({ total: 1, passed: 0, unknown: 0, passRate: 0 })
    expect(byLink?.params?.passRate).toBe(0)
    expect(byLink?.params?.unknown).toBe(1)
    expect(byLink?.expression).toBeUndefined()
  })
})

describe('异常场景分桶（byException）', () => {
  function setOf(types: Array<string | undefined>): EvalSet {
    return {
      id: 's2', name: 'exc-set', track: 'e2e', sealed: false, createdAt: 0,
      tasks: types.map((t, i) => ({
        id: `t${i}`, problem: 'p', expectedBehavior: 'b',
        ...(t ? { exceptionType: t as never } : {}),
        rubric: [{ id: 'a1', text: 'x', expect: 'yes', kind: 'result' }],
      })),
    }
  }

  it('全 none → 缺省', () => {
    expect(byExceptionOf(setOf([undefined, undefined]), runOf([]))).toBeUndefined()
  })

  it('按类目分桶出任务数与桶内 pass@k', () => {
    const set = setOf(['insufficient_permission', 'tool_timeout', undefined])
    const run = runOf([
      attemptOf({ taskId: 't0', passed: true, verdicts: [{ assertionId: 'a1', value: 'yes', source: 's0' }] }),
      attemptOf({ taskId: 't1', passed: false, verdicts: [{ assertionId: 'a1', value: 'no', source: 's0' }] }),
    ])
    const buckets = byExceptionOf(set, run)
    const byType = new Map(buckets?.map((b) => [b.type, b]))
    expect(byType.get('insufficient_permission')).toEqual({ type: 'insufficient_permission', taskCount: 1, passAtK: 1 })
    expect(byType.get('tool_timeout')?.passAtK).toBe(0)
    // 无样本任务在桶内计不过（与 run 级 pass@k 同口径：分母=任务数）
    expect(byType.get('none')).toEqual({ type: 'none', taskCount: 1, passAtK: 0 })
  })
})

// ---------- run 级过程双指标 ----------

describe('processMetricsOf（run 级均值 + 诚实缺席）', () => {
  const set: EvalSet = {
    id: 's3', name: 'pm-set', track: 'e2e', sealed: false, createdAt: 0,
    tasks: [
      { id: 't1', problem: 'p', expectedBehavior: 'b', expectedToolCalls: ['a', 'b'], rubric: [{ id: 'x', text: 't', expect: 'yes', kind: 'result' }] },
      { id: 't2', problem: 'p', expectedBehavior: 'b', rubric: [{ id: 'x', text: 't', expect: 'yes', kind: 'result' }] },
    ],
  }

  it('无任务声明期望序列 → 缺省', () => {
    expect(processMetricsOf(set, runOf([]))).toBeUndefined()
  })

  it('均值 + 未声明任务不参与（不是 0 分）', () => {
    const run = runOf([
      attemptOf({ taskId: 't1', toolCalls: [{ name: 'a', ok: true }, { name: 'b', ok: true }] }),
      attemptOf({ taskId: 't1', sampleIdx: 2, toolCalls: [{ name: 'a', ok: true }, { name: 'x', ok: true }, { name: 'b', ok: true }] }),
      attemptOf({ taskId: 't2', toolCalls: [{ name: 'z', ok: true }] }),
    ])
    const pm = processMetricsOf(set, run)
    expect(pm?.attemptsCompared).toBe(2)
    expect(pm?.toolHeadAccuracy).toBe(1) // 两样本 LCS 均=2/2
    expect(pm?.trajectoryMatchScore).toBeCloseTo((0 + 1 / 2) / 2, 5)
  })

  it('有期望序列但证据缺 toolCalls → 不参与（未测≠零分）', () => {
    const run = runOf([attemptOf({ taskId: 't1' })])
    expect(processMetricsOf(set, run)).toBeUndefined()
  })
})

// ---------- P99 / 工具成功率 ----------

describe('p99Of（最近邻秩）', () => {
  it('n<2 → null', () => expect(p99Of([100])).toBeNull())
  it('单异常值抬 P99', () => {
    expect(p99Of([100, 100, 100, 100, 100, 100, 100, 100, 100, 900])).toBe(900)
  })
})

describe('toolSuccessRateOf', () => {
  it('无调用记录 → null', () => expect(toolSuccessRateOf([attemptOf({ taskId: 't' })])).toBeNull())
  it('成败混合比例', () => {
    const rate = toolSuccessRateOf([attemptOf({ taskId: 't', toolCalls: [{ name: 'a', ok: true }, { name: 'b', ok: false }, { name: 'c', ok: true }] })])
    expect(rate).toBeCloseTo(2 / 3, 5)
  })
})

// ---------- 六维度量分面 ----------

describe('sixDimensionsOf（诚实立账：未采集=null 不造数）', () => {
  it('功能/安全有读数，可靠/UX 立账为缺，性能随 P99 比，成本随取数', () => {
    const run = runOf([], {
      passAtK: 0.8,
      byLayer: {
        result: null, trajectory: null, risk: 'clean',
        efficiency: { avgTokens: 1000, avgCostUsd: null, avgSteps: null, avgDurationMs: null },
      },
    })
    const dims = new Map(sixDimensionsOf(run, 1.5).map((d) => [d.dim, d]))
    expect(dims.get('functionality')).toMatchObject({ value: 0.8, instrumented: true })
    expect(dims.get('security')).toMatchObject({ value: 1, instrumented: true })
    expect(dims.get('reliability')).toMatchObject({ value: null, instrumented: false })
    expect(dims.get('ux')).toMatchObject({ value: null, instrumented: false })
    expect(dims.get('performance')).toMatchObject({ value: 1.5, instrumented: true })
    expect(dims.get('cost')).toMatchObject({ value: null, instrumented: false })
  })

  it('risk violated → 安全维 0', () => {
    const run = runOf([], { byLayer: { result: null, trajectory: null, risk: 'violated', efficiency: { avgTokens: null, avgCostUsd: null, avgSteps: null, avgDurationMs: null } } })
    expect(sixDimensionsOf(run, null).find((d) => d.dim === 'security')).toMatchObject({ value: 0, instrumented: true })
  })
})

// ---------- 发布门禁 ----------

describe('evaluateReleaseGate（腾讯 Pre-Launch 阈值机械执行）', () => {
  const cfg = loadReleaseGateConfig()

  it('默认阈值照抄文章口径（99% / 2× / 0.5% / 1.5s）', () => {
    expect(cfg.toolSuccessMin).toBe(0.99)
    expect(cfg.p99RatioMax).toBe(2)
    expect(cfg.degradeRateMax).toBe(0.005)
    expect(cfg.ttftMaxMs).toBe(1500)
  })

  it('实测项全过 → verdict=pass（缺口项单列 gapKeys，不算失败）', () => {
    const attempts: Attempt[] = [
      attemptOf({ taskId: 't', toolCalls: Array.from({ length: 100 }, (_, i) => ({ name: `tool-${i}`, ok: i < 99 })), efficiency: { durationMs: 100 }, judgeMeta: { backend: 'x', latencyMs: 1, cached: false, online: true } }),
      attemptOf({ taskId: 't', sampleIdx: 2, toolCalls: [{ name: 'a', ok: true }], efficiency: { durationMs: 105 }, judgeMeta: { backend: 'x', latencyMs: 1, cached: false, online: true } }),
    ]
    const gate = evaluateReleaseGate(attempts, cfg)
    const byKey = new Map(gate.checks.map((c) => [c.key, c]))
    expect(byKey.get('tool_success')).toMatchObject({ status: 'pass', measured: '99.0%' })
    expect(byKey.get('p99_ratio')).toMatchObject({ status: 'pass' })
    expect(byKey.get('degrade_rate')).toMatchObject({ status: 'pass', measured: '0.00%' })
    expect(gate.verdict).toBe('pass')
    expect(gate.measuredCount).toBe(3)
    expect(gate.gapKeys).toEqual(['ttft', 'response_tier', 'qps_headroom'])
    expect(gate.numeric.toolSuccessRate).toBeCloseTo(100 / 101, 5)
  })

  it('工具成功率 98% < 99% → 该项 fail、verdict=fail', () => {
    const attempts: Attempt[] = [
      attemptOf({ taskId: 't', toolCalls: [{ name: 'a', ok: true }, { name: 'b', ok: false }, { name: 'c', ok: true }, { name: 'd', ok: true }, { name: 'e', ok: true }, { name: 'f', ok: true }, { name: 'g', ok: true }, { name: 'h', ok: true }, { name: 'i', ok: true }, { name: 'j', ok: true }] }),
      attemptOf({ taskId: 't', sampleIdx: 2, efficiency: { durationMs: 100 } }),
    ]
    const gate = evaluateReleaseGate(attempts, cfg)
    expect(gate.checks.find((c) => c.key === 'tool_success')?.status).toBe('fail')
    expect(gate.verdict).toBe('fail')
  })

  it('判定端离线样本占比抬降级率 → fail（口径=fail-open 降级事件）', () => {
    const attempts: Attempt[] = [
      attemptOf({ taskId: 't', toolCalls: [{ name: 'a', ok: true }], efficiency: { durationMs: 100 }, judgeMeta: { backend: 'x', latencyMs: 1, cached: false, online: false } }),
      attemptOf({ taskId: 't', sampleIdx: 2, efficiency: { durationMs: 110 }, judgeMeta: { backend: 'x', latencyMs: 1, cached: false, online: true } }),
    ]
    const gate = evaluateReleaseGate(attempts, cfg)
    expect(gate.checks.find((c) => c.key === 'degrade_rate')?.status).toBe('fail')
    expect(gate.verdict).toBe('fail')
  })

  it('无任何实测证据 → verdict=no_data（不编造通过）', () => {
    const gate = evaluateReleaseGate([attemptOf({ taskId: 't' })], cfg)
    expect(gate.verdict).toBe('no_data')
    expect(gate.measuredCount).toBe(0)
    expect(gate.checks.every((c) => c.status === 'no_data')).toBe(true)
  })

  it('P99 尖刺 → p99_ratio fail', () => {
    const durations = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 5000]
    const attempts: Attempt[] = durations.map((ms, i) => attemptOf({ taskId: 't', sampleIdx: i + 1, efficiency: { durationMs: ms }, judgeMeta: { backend: 'x', latencyMs: 1, cached: false, online: true } }))
    const gate = evaluateReleaseGate(attempts, cfg)
    expect(gate.checks.find((c) => c.key === 'p99_ratio')?.status).toBe('fail')
    expect(gate.numeric.p99Ratio).toBeGreaterThan(2)
  })
})
