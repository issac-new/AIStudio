// overlay[eval] 百度评测体系轮单测（B1-B5）。
// 范式锚点：specs/assets/wx-articles-2026-10-19/baidu-agent-eval.txt
// §6 数据集资产化 / §3 规则评估器+停用词 / §2 四层金字塔 / §4 评估器即回报函数 / §8 红队种子。
// 判定端零依赖（本文件只测纯函数与 store/种子面，不触发 S1 调用）。
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_STOPWORDS, rougeLf1, similarityScore, similarityVerdict, stripStopwords,
} from '../similarity'
import { contentFingerprint, shortFingerprint } from '../fingerprint'
import { pyramidOf } from '../pyramid'
import { actionLinksOf } from '../actions'
import { buildRedteamSeedTasks, REDTEAM_SET_NAME, REDTEAM_VECTORS } from '../redteam-seed'
import { aggregateRun } from '../aggregate'
import { createSet, listSets, reviseRubric, _useStoreDirForTests } from '../store'
import type { Attempt, EvalConfig, EvalRun, EvalSet, RunAggregates } from '../types'

// ---------- B2 相似度规则 ----------

describe('B2 停用词清洁', () => {
  it('默认表剔除中英高频虚词与空白；空表=显式关闭', () => {
    // 这[是][一]个测试[的]输出 → 去 是/一/的（「一个」整词在表但按字符清洁只删表内字符）
    expect(stripStopwords('这是一个测试的输出', DEFAULT_STOPWORDS)).toBe('这个测试输出')
    expect(stripStopwords('The quick brown fox', DEFAULT_STOPWORDS)).toBe('quickbrownfox')
    expect(stripStopwords('a test', new Set())).toBe('a test')
  })
})

describe('B2 ROUGE-L F1（字符级）', () => {
  it('恒等=1；空侧=0；部分覆盖取 F1', () => {
    expect(rougeLf1('订单已创建成功', '订单已创建成功')).toBe(1)
    expect(rougeLf1('', '参照')).toBe(0)
    expect(rougeLf1('参照答案', '')).toBe(0)
    // candidate=「答案答案答案答案」reference=「答案」：P=1/4 R=1 → F1=0.4
    expect(rougeLf1('答案答案答案答案', '答案')).toBeCloseTo(0.4, 5)
  })

  it('停用词清洁先于计分：虚词噪声不稀释相似度', () => {
    const transcript = '这个 的 答案 是 正确 的'
    const reference = '答案正确'
    const on = similarityScore({ transcript, reference })
    const off = similarityScore({ transcript, reference, stopwords: [] })
    // 开清洁：transcript→「这个答案正确」LCS=4/6 F1=0.8；关清洁：虚词拉低 P，F1<0.8
    expect(on).toBeCloseTo(0.8, 5)
    expect(on).toBeGreaterThan(off)
  })
})

describe('B2 S0 相似度判定', () => {
  const task = {
    id: 't1', problem: 'p', expectedBehavior: '部署完成且服务健康检查通过',
    rubric: [{ id: 'a1', text: '回复与参照语义一致', expect: 'yes' as const, kind: 'result' as const }],
  }
  const rule = { minScore: 0.5 }

  it('证据为空 → unknown（诚实缺席）；达标 → yes；不达标 → no', () => {
    expect(similarityVerdict(task, { transcript: '' }, rule)).toBe('unknown')
    expect(similarityVerdict(task, { transcript: '部署完成且服务健康检查通过' }, rule)).toBe('yes')
    expect(similarityVerdict(task, { transcript: '今天天气不错出去玩了' }, rule)).toBe('no')
  })

  it('stopwords: [] 显式关闭清洁（虚词差异直接反映在得分）', () => {
    // 关闭清洁后虚词差异拉低得分；开启清洁则接近满分
    const transcript = '部署完成且服务健康检查通过'
    const reference = '部署 完成 且 服务 健康 检查 通过'
    const off = similarityScore({ transcript, reference, stopwords: [] })
    const on = similarityScore({ transcript, reference })
    expect(on).toBeGreaterThan(off)
  })
})

// ---------- B1 内容指纹与资产面 ----------

describe('B1 内容指纹', () => {
  it('键序无关：同内容不同键序同指纹；内容变则指纹变', () => {
    const a = { tasks: [{ id: 't', problem: 'p', expectedBehavior: 'e', rubric: [{ id: 'a', text: 'x', expect: 'yes', kind: 'result' }] }] }
    const b = { tasks: [{ rubric: [{ kind: 'result', expect: 'yes', text: 'x', id: 'a' }], expectedBehavior: 'e', problem: 'p', id: 't' }] }
    expect(contentFingerprint(a as Pick<EvalSet, 'tasks'>)).toBe(contentFingerprint(b as Pick<EvalSet, 'tasks'>))
    const c = { tasks: [{ ...a.tasks[0], problem: 'p2' }] }
    expect(contentFingerprint(a as Pick<EvalSet, 'tasks'>)).not.toBe(contentFingerprint(c as Pick<EvalSet, 'tasks'>))
  })

  it('undefined 字段不入指纹（可选字段缺席 vs 显式 undefined 等价）；短指纹=前 12 位', () => {
    const withUndef = { tasks: [{ id: 't', problem: 'p', expectedBehavior: 'e', rubric: [], module: undefined }] }
    const without = { tasks: [{ id: 't', problem: 'p', expectedBehavior: 'e', rubric: [] }] }
    expect(contentFingerprint(withUndef as Pick<EvalSet, 'tasks'>)).toBe(contentFingerprint(without as Pick<EvalSet, 'tasks'>))
    const full = contentFingerprint(without as Pick<EvalSet, 'tasks'>)
    expect(shortFingerprint(full)).toBe(full.slice(0, 12))
  })
})

describe('B1 store 资产面（指纹+修订号+运行锚定）', () => {
  beforeEach(() => {
    _useStoreDirForTests(mkdtempSync(join(tmpdir(), 'eval-baidu-')))
  })

  const task = {
    id: 't1', problem: '查天气', expectedBehavior: '返回当日天气',
    rubric: [{ id: 'a1', text: '回答包含天气信息', expect: 'yes' as const, kind: 'result' as const }],
  }

  it('建集=rev1 带指纹；listSets 暴露资产字段', () => {
    const created = createSet({ name: '资产集', track: 'e2e', tasks: [task] })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.set.revision).toBe(1)
    expect(created.set.contentHash).toHaveLength(40)
    const meta = listSets().find((s) => s.name === '资产集')
    expect(meta?.contentHash).toBe(created.set.contentHash)
    expect(meta?.revision).toBe(1)
  })

  it('改题（Rubric 修订）后修订号+1 且指纹变化', () => {
    const created = createSet({ name: '改题集', track: 'e2e', tasks: [task] })
    if (!created.ok) return
    const before = created.set.contentHash
    const revised = reviseRubric(created.set.id, 't1', 'a1', '回答包含当日城市天气信息')
    expect(revised.ok).toBe(true)
    if (!revised.ok) return
    expect(revised.set.revision).toBe(2)
    expect(revised.set.contentHash).not.toBe(before)
  })

  it('聚合期锚点漂移判定：run.setHash ≠ 当前集指纹 → pyramid.anchorDrift + 高优先动作', () => {
    const created = createSet({ name: '漂移集', track: 'e2e', tasks: [task] })
    if (!created.ok) return
    const run = buildRun(created.set, [{ taskId: 't1', sampleIdx: 1, verdicts: [{ assertionId: 'a1', value: 'yes', source: 's1' }], judgeMeta: { backend: 'x', latencyMs: 1, cached: false, online: true } }])
    run.setHash = 'deadbeef'
    aggregateRun(created.set, run, testConfig())
    expect(run.aggregates.pyramid?.anchorDrift).toBe(true)
    expect(run.aggregates.actions?.some((a) => a.key === 'anchor_drift' && a.priority === 'high')).toBe(true)
  })

  it('无漂移（setHash=当前指纹）不产生 anchor_drift 动作', () => {
    const created = createSet({ name: '锚定集', track: 'e2e', tasks: [task] })
    if (!created.ok) return
    const run = buildRun(created.set, [{ taskId: 't1', sampleIdx: 1, verdicts: [{ assertionId: 'a1', value: 'yes', source: 's1' }], judgeMeta: { backend: 'x', latencyMs: 1, cached: false, online: true } }])
    run.setHash = created.set.contentHash
    aggregateRun(created.set, run, testConfig())
    expect(run.aggregates.pyramid?.anchorDrift).toBe(false)
    expect(run.aggregates.actions?.some((a) => a.key === 'anchor_drift')).toBe(false)
  })
})

// ---------- B3 四层金字塔 ----------

describe('B3 四层金字塔', () => {
  it('四层齐备且映射正确：模型层=判定端 / 应用层=组件 / Agent 层=端到端 / 线上层=门禁', () => {
    const run = runWith({
      judgeOnline: true,
      calibration: { samples: 40, excludedUnknown: 0, missingP: 0, buckets: [], ece: 0.05, brier: 0.1, meanGap: 0 } as never,
      byLink: { intent: { total: 10, passed: 9, unknown: 0, passRate: 0.9 } },
      processMetrics: { toolHeadAccuracy: 0.95, trajectoryMatchScore: 0.1, attemptsCompared: 5 },
      releaseGate: { verdict: 'pass', checks: [{ key: 'tool_success', threshold: '≥ 99%', measured: '99.5%', status: 'pass' }], measuredCount: 1, gapKeys: [], basis: 'x', numeric: { toolSuccessRate: 0.995, p99Ratio: null, degradeRate: null } },
      byLayerRisk: 'clean',
      riskVeto: false,
    })
    const p = pyramidOf(run, false)
    expect(p.layers.map((l) => l.key)).toEqual(['model', 'app', 'agent', 'online'])
    expect(p.anchorDrift).toBe(false)
    const model = p.layers[0]
    expect(model.status).toBe('pass')
    expect(model.readings.find((r) => r.key === 'judge_online')?.tone).toBe('good')
    expect(model.readings.find((r) => r.key === 'ece')?.value).toBe('0.050')
    const app = p.layers[1]
    expect(app.readings.find((r) => r.key === 'link_intent')?.value).toContain('90.0%')
    expect(app.readings.find((r) => r.key === 'tool_head')?.tone).toBe('good')
    const online = p.layers[3]
    expect(online.readings.find((r) => r.key === 'gate_tool_success')?.tone).toBe('good')
  })

  it('红线 violated → Agent 层 warn；判定离线 → 模型层 warn；空层如实 no_data', () => {
    const violated = pyramidOf(runWith({ byLayerRisk: 'violated', riskVeto: true }), false)
    expect(violated.layers.find((l) => l.key === 'agent')?.status).toBe('warn')
    expect(violated.layers.find((l) => l.key === 'agent')?.readings.find((r) => r.key === 'risk')?.tone).toBe('bad')

    const offline = pyramidOf(runWith({ judgeOnline: false }), false)
    expect(offline.layers.find((l) => l.key === 'model')?.status).toBe('warn')

    const bare = pyramidOf(runWith({}), false)
    expect(bare.layers.find((l) => l.key === 'app')?.status).toBe('no_data')
    expect(bare.layers.find((l) => l.key === 'app')?.readings).toHaveLength(0)
  })
})

// ---------- B4 动作驱动 ----------

describe('B4 动作驱动清单（评估器即回报函数）', () => {
  it('每类触发各产生对应动作且按优先级排序', () => {
    const run = runWith({
      judgeOnline: false,
      riskVeto: true,
      unknownRatio: 0.3,
      rubricDrilldownHint: true,
      statisticallyInsufficient: true,
      byLink: { intent: { total: 10, passed: 5, unknown: 0, passRate: 0.5 } },
      releaseGate: {
        verdict: 'fail',
        checks: [
          { key: 'tool_success', threshold: '≥ 99%', measured: '97%', status: 'fail' },
          { key: 'ttft', threshold: '≤ 1.5s', measured: null, status: 'no_data', gap: 'x' },
        ],
        measuredCount: 1, gapKeys: ['ttft'], basis: 'x',
        numeric: { toolSuccessRate: 0.97, p99Ratio: null, degradeRate: null },
      },
    })
    const links = actionLinksOf(run, true)
    const keys = links.map((l) => l.key)
    expect(keys).toContain('anchor_drift')
    expect(keys).toContain('judge_offline')
    expect(keys).toContain('risk_veto')
    expect(keys).toContain('rubric_drilldown')
    expect(keys).toContain('gate_tool_success')
    expect(keys).toContain('gate_gap_ttft')
    expect(keys).toContain('link_intent')
    expect(keys).toContain('k_insufficient')
    // 高优先在前
    const priorities = links.map((l) => l.priority)
    const firstLow = priorities.indexOf('low')
    expect(priorities.slice(0, firstLow).every((p) => p !== 'low')).toBe(true)
    // 每条动作非空（驱动不了动作的指标不建——产出必须有动作）
    for (const l of links) expect(l.action.length).toBeGreaterThan(4)
  })

  it('全绿通过态零动作（无事可驱动=不产噪）', () => {
    const run = runWith({
      judgeOnline: true,
      unknownRatio: 0.01,
      rubricDrilldownHint: false,
      riskVeto: false,
      byLink: { intent: { total: 10, passed: 10, unknown: 0, passRate: 1 } },
      releaseGate: { verdict: 'pass', checks: [{ key: 'tool_success', threshold: '≥ 99%', measured: '99.5%', status: 'pass' }], measuredCount: 1, gapKeys: [], basis: 'x', numeric: { toolSuccessRate: 0.995, p99Ratio: null, degradeRate: null } },
      k: 3,
    })
    expect(actionLinksOf(run, false)).toHaveLength(0)
  })

  it('校准动作：ECE 劣化且样本足才触发（样本不足不误报）', () => {
    const degraded = runWith({ calibration: { samples: 50, excludedUnknown: 0, missingP: 0, buckets: [], ece: 0.3, brier: 0.3, meanGap: 0 } as never })
    expect(actionLinksOf(degraded, false).some((a) => a.key === 'judge_calibration')).toBe(true)
    const fewSamples = runWith({ calibration: { samples: 5, excludedUnknown: 0, missingP: 0, buckets: [], ece: 0.3, brier: 0.3, meanGap: 0 } as never })
    expect(actionLinksOf(fewSamples, false).some((a) => a.key === 'judge_calibration')).toBe(false)
  })
})

// ---------- B5 红队种子库 ----------

describe('B5 红队种子库', () => {
  const tasks = buildRedteamSeedTasks()

  it('24 任务 × 4 向量，id 唯一且按向量成段', () => {
    expect(tasks).toHaveLength(24)
    const ids = new Set(tasks.map((t) => t.id))
    expect(ids.size).toBe(24)
    for (const v of ['rt-di', 'rt-ii', 'rt-se', 'rt-ta']) {
      expect(tasks.filter((t) => t.id.startsWith(v))).toHaveLength(6)
    }
    expect(REDTEAM_VECTORS.map((v) => v.key)).toEqual(['direct_injection', 'indirect_injection', 'secret_exfil', 'tool_abuse'])
    expect(REDTEAM_SET_NAME).toBe('红队种子库·v1')
  })

  it('全部 risk 断言 expect=no（红线建模一致性，过 store 校验）', () => {
    for (const t of tasks) {
      expect(t.rubric.length).toBeGreaterThan(0)
      for (const a of t.rubric) {
        expect(a.kind).toBe('risk')
        expect(a.expect).toBe('no')
      }
    }
  })

  it('种子过 store 校验可建集（含 S0 regex 合法性）', () => {
    _useStoreDirForTests(mkdtempSync(join(tmpdir(), 'eval-baidu-rt-')))
    const created = createSet({ name: REDTEAM_SET_NAME, track: 'e2e', tasks })
    expect(created.ok).toBe(true)
    if (created.ok) {
      expect(created.set.tasks).toHaveLength(24)
      expect(created.set.contentHash).toHaveLength(40)
    }
  })

  it('S0 regex 只用于密钥特征类信号（拒答回声陷阱：命令类文本不做 regex）', () => {
    const s0RegexPatterns = tasks
      .flatMap((t) => t.rubric)
      .filter((a) => a.s0?.kind === 'regex')
      .map((a) => (a.s0 as { pattern: string }).pattern)
    expect(s0RegexPatterns.length).toBeGreaterThan(0)
    for (const p of s0RegexPatterns) {
      // 密钥特征统一口径：全部来自 SECRET_MARKERS 家族（sk-/AKIA/ghp_/PRIVATE KEY/JWT）
      expect(p).toContain('sk-')
      expect(p).not.toMatch(/rm\\s|\/etc\/|curl/)
    }
  })
})

// ---------- 夹具 ----------

function testConfig(): EvalConfig {
  return {
    judgeBaseUrl: 'http://test', judgeModel: 'm', judgeModels: ['m'], judgeTimeoutMs: 10,
    tauYes: 0.75, tauNo: 0.25, unknownWarnRatio: 0.2, maxStateChars: 100, cacheTtlMs: 1000,
    breakerThreshold: 5, breakerCooldownMs: 1000, sealedMaxAttempts: 3,
  }
}

function buildRun(set: EvalSet, attempts: Attempt[]): EvalRun {
  return { id: 'erun-test', setId: set.id, target: {}, k: 1, status: 'done', attempts, aggregates: {} as EvalRun['aggregates'], createdAt: 0 }
}

interface RunOverrides {
  judgeOnline?: boolean
  calibration?: RunAggregates['calibration']
  byLink?: RunAggregates['byLink']
  processMetrics?: RunAggregates['processMetrics']
  releaseGate?: RunAggregates['releaseGate']
  byLayerRisk?: RunAggregates['byLayer']['risk']
  riskVeto?: boolean
  unknownRatio?: number
  rubricDrilldownHint?: boolean
  statisticallyInsufficient?: boolean
  k?: number
}

function runWith(o: RunOverrides): EvalRun {
  const aggregates: RunAggregates = {
    taskCount: 1,
    passAt1: 0.8,
    passAtK: 0.9,
    byLayer: {
      result: 0.8, trajectory: null,
      risk: o.byLayerRisk ?? 'none',
      efficiency: { avgTokens: null, avgCostUsd: null, avgSteps: null, avgDurationMs: null },
    },
    unknownRatio: o.unknownRatio ?? 0,
    rubricDrilldownHint: o.rubricDrilldownHint ?? false,
    riskVeto: o.riskVeto ?? false,
    statisticallyInsufficient: o.statisticallyInsufficient ?? false,
    judgeOnline: o.judgeOnline ?? true,
    ...(o.calibration ? { calibration: o.calibration } : {}),
    ...(o.byLink ? { byLink: o.byLink } : {}),
    ...(o.processMetrics ? { processMetrics: o.processMetrics } : {}),
    ...(o.releaseGate ? { releaseGate: o.releaseGate } : {}),
  }
  return {
    id: 'erun-x', setId: 'eset-001', target: {}, k: o.k ?? 1, status: 'done',
    attempts: [], aggregates, createdAt: 0,
  }
}
