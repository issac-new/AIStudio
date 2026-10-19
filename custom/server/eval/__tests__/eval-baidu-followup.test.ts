// overlay[eval] 百度轮后续批单测（B6 变体扩产 / B7 线上证据回填）。
// 范式锚点：specs/2026-10-19-eval-baidu-followup-design.md。
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, it, expect, beforeEach } from 'vitest'
import { buildRedteamVariants } from '../redteam-variants'
import { buildRedteamSeedTasks, REDTEAM_SET_NAME } from '../redteam-seed'
import { evaluateReleaseGate, loadReleaseGateConfig } from '../releaseGate'
import { aggregateRun } from '../aggregate'
import { appendRun, appendTasksToSet, createSet, listSets, recordLiveEvidence, sealSet, _useStoreDirForTests } from '../store'
import type { EvalConfig, EvalRun, EvalSet, LiveEvidence } from '../types'

// ---------- B6 变体扩产 ----------

describe('B6 红队变体扩产器', () => {
  const variants = buildRedteamVariants()

  it('24 种子 × 各向量规则 = 114 变体；id 唯一且父题可溯源', () => {
    expect(variants).toHaveLength(114)
    const ids = new Set(variants.map((v) => v.id))
    expect(ids.size).toBe(114)
    for (const v of variants) {
      expect(v.id).toMatch(/^rt-(di|ii|se|ta)-\d{2}-v\d+$/)
    }
  })

  it('各向量规则数正确（di×6 / ii×5 / se×4 / ta×4）', () => {
    expect(variants.filter((v) => v.id.startsWith('rt-di-'))).toHaveLength(36)
    expect(variants.filter((v) => v.id.startsWith('rt-ii-'))).toHaveLength(30)
    expect(variants.filter((v) => v.id.startsWith('rt-se-'))).toHaveLength(24)
    expect(variants.filter((v) => v.id.startsWith('rt-ta-'))).toHaveLength(24)
  })

  it('确定性：两次构建产物完全一致；变体继承父题红线断言（risk+expect no）', () => {
    expect(buildRedteamVariants()).toEqual(variants)
    const seedById = new Map(buildRedteamSeedTasks().map((t) => [t.id, t]))
    for (const v of variants) {
      const parent = seedById.get(v.id.replace(/-v\d+$/, ''))
      expect(parent).toBeDefined()
      expect(v.rubric).toEqual(parent!.rubric)
      for (const a of v.rubric) {
        expect(a.kind).toBe('risk')
        expect(a.expect).toBe('no')
      }
    }
  })

  it('伪装真实生效：base64 变体包含可解码的父题载荷', () => {
    const b64 = variants.find((v) => v.id.endsWith('-v1') && v.id.startsWith('rt-di-'))
    expect(b64).toBeDefined()
    const m = b64!.problem.match(/执行：([A-Za-z0-9+/=]+)$/)
    expect(m).not.toBeNull()
    expect(Buffer.from(m![1], 'base64').toString('utf8')).toContain('忽略')
  })

  it('变体不引入新 S0 regex（拒答回声纪律：父题密钥特征规则原样继承，不新增）', () => {
    const seedById = new Map(buildRedteamSeedTasks().map((t) => [t.id, t]))
    for (const v of variants) {
      const parent = seedById.get(v.id.replace(/-v\d+$/, ''))
      expect(parent).toBeDefined()
      const parentS0 = new Set(parent!.rubric.map((a, i) => (a.s0 ? `${i}:${a.s0.kind}:${'pattern' in (a.s0 as { pattern?: string }) ? (a.s0 as { pattern: string }).pattern : ''}` : '')))
      v.rubric.forEach((a, i) => {
        if (!a.s0) return
        const key = `${i}:${a.s0.kind}:${'pattern' in a.s0 ? a.s0.pattern : ''}`
        expect(parentS0.has(key)).toBe(true)
      })
    }
  })
})

describe('B6 appendTasksToSet（幂等追加 + 资产面）', () => {
  beforeEach(() => {
    _useStoreDirForTests(mkdtempSync(join(tmpdir(), 'eval-followup-')))
  })

  it('追加 114 变体：修订号+1、指纹变化；重复追加幂等 0 条', () => {
    const created = createSet({ name: REDTEAM_SET_NAME, track: 'e2e', tasks: buildRedteamSeedTasks() })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const hashBefore = created.set.contentHash
    const first = appendTasksToSet(created.set.id, buildRedteamVariants())
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.appended).toBe(114)
    expect(first.set.tasks).toHaveLength(138)
    expect(first.set.revision).toBe(2)
    expect(first.set.contentHash).not.toBe(hashBefore)
    const again = appendTasksToSet(created.set.id, buildRedteamVariants())
    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(again.appended).toBe(0)
    expect(again.set.tasks).toHaveLength(138)
    expect(again.set.revision).toBe(2)
  })

  it('密封集拒绝追加；listSets 反映扩产后任务数', () => {
    const created = createSet({ name: '密封扩产', track: 'e2e', tasks: buildRedteamSeedTasks() })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(sealSet(created.set.id).ok).toBe(true)
    const refused = appendTasksToSet(created.set.id, buildRedteamVariants())
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.problems[0]).toContain('密封')
    const meta = listSets().find((s) => s.name === '密封扩产')
    expect(meta?.taskCount).toBe(24)
  })
})

// ---------- B7 线上证据回填 ----------

function gateOf(live?: Pick<LiveEvidence, 'qpsProbe' | 'responseTiers'>) {
  return evaluateReleaseGate([], loadReleaseGateConfig(), live)
}

describe('B7 门禁 live 接线', () => {
  it('无 live：qps/response_tier 仍 no_data（基线零回归）', () => {
    const gate = evaluateReleaseGate([], loadReleaseGateConfig())
    const qps = gate.checks.find((c) => c.key === 'qps_headroom')
    const tier = gate.checks.find((c) => c.key === 'response_tier')
    expect(qps?.status).toBe('no_data')
    expect(tier?.status).toBe('no_data')
    expect(qps?.gap).toContain('live-evidence')
  })

  it('压测达标 → pass（达成≥90%、错误率<1%、p99≤2×p50）并注来源', () => {
    const gate = gateOf({ qpsProbe: { targetQps: 100, achievedQps: 95, errorRate: 0.005, p99ToP50: 1.8, source: 'mx-load-probe', at: 0 } })
    const qps = gate.checks.find((c) => c.key === 'qps_headroom')
    expect(qps?.status).toBe('pass')
    expect(qps?.measured).toContain('95.0/100.0')
    expect(qps?.source).toBe('mx-load-probe')
    expect(gate.gapKeys).not.toContain('qps_headroom')
  })

  it('压测不达标（达成 80%）→ fail 且拉低门禁总判', () => {
    const gate = gateOf({ qpsProbe: { targetQps: 100, achievedQps: 80, errorRate: 0.005, p99ToP50: 1.5, at: 0 } })
    expect(gate.checks.find((c) => c.key === 'qps_headroom')?.status).toBe('fail')
    expect(gate.verdict).toBe('fail')
  })

  it('分档：简单 p95 4s/复杂 12s → pass；复杂 20s → fail', () => {
    const ok = gateOf({ responseTiers: [
      { tier: 'simple', samples: 30, p95Ms: 4000, at: 0 },
      { tier: 'complex', samples: 20, p95Ms: 12000, at: 0 },
    ] })
    expect(ok.checks.find((c) => c.key === 'response_tier')?.status).toBe('pass')
    expect(ok.checks.find((c) => c.key === 'response_tier')?.measured).toContain('4.00s')
    const bad = gateOf({ responseTiers: [{ tier: 'complex', samples: 20, p95Ms: 20000, at: 0 }] })
    expect(bad.checks.find((c) => c.key === 'response_tier')?.status).toBe('fail')
  })
})

describe('B7 recordLiveEvidence（落库 + 重聚合 + 合并语义）', () => {
  beforeEach(() => {
    _useStoreDirForTests(mkdtempSync(join(tmpdir(), 'eval-live-')))
  })

  function seedRunInStore(): EvalSet | null {
    const task = {
      id: 't1', problem: 'p', expectedBehavior: 'e',
      rubric: [{ id: 'a1', text: 'r', expect: 'yes' as const, kind: 'result' as const }],
    }
    const created = createSet({ name: 'live 集', track: 'e2e', tasks: [task] })
    if (!created.ok) return null
    const run: EvalRun = {
      id: 'erun-live-1', setId: created.set.id, setHash: created.set.contentHash, target: {}, k: 2, status: 'done',
      attempts: [{ taskId: 't1', sampleIdx: 1, verdicts: [{ assertionId: 'a1', value: 'yes', source: 's1' }], judgeMeta: { backend: 'x', latencyMs: 1, cached: false, online: true } }],
      aggregates: {} as EvalRun['aggregates'], createdAt: 0,
    }
    aggregateRun(created.set, run, testConfig())
    appendRun(run)
    return created.set
  }

  it('回填 qpsProbe 后 qps 门禁项转 pass；二次回填分档不覆盖压测（合并语义）', () => {
    const set = seedRunInStore()
    expect(set).not.toBeNull()
    if (!set) return
    const agg = (r: EvalRun) => aggregateRun(set, r, testConfig())

    const first = recordLiveEvidence('erun-live-1', { qpsProbe: { targetQps: 100, achievedQps: 95, errorRate: 0.005, p99ToP50: 1.8, source: 'mx-load-probe', at: 1 }, recordedBy: 'tester', recordedAt: 1 }, agg)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.run.liveEvidence?.qpsProbe?.achievedQps).toBe(95)
    expect(first.run.aggregates.releaseGate?.checks.find((c) => c.key === 'qps_headroom')?.status).toBe('pass')

    const second = recordLiveEvidence('erun-live-1', { responseTiers: [{ tier: 'simple', samples: 30, p95Ms: 4000, at: 2 }], recordedBy: 'tester', recordedAt: 2 }, agg)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    // 合并：压测仍在，分档新增，两项都真判；其余证据缺口（tool/p99/ttft 无 attempt 数据）如实保留
    expect(second.run.liveEvidence?.qpsProbe?.achievedQps).toBe(95)
    expect(second.run.aggregates.releaseGate?.checks.find((c) => c.key === 'qps_headroom')?.status).toBe('pass')
    expect(second.run.aggregates.releaseGate?.checks.find((c) => c.key === 'response_tier')?.status).toBe('pass')
    expect(second.run.aggregates.releaseGate?.gapKeys).not.toContain('qps_headroom')
    expect(second.run.aggregates.releaseGate?.gapKeys).not.toContain('response_tier')
  })

  it('运行不存在 → 404 语义 problems', () => {
    const result = recordLiveEvidence('erun-none', { recordedAt: 0 }, (r) => r)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems[0]).toContain('不存在')
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
