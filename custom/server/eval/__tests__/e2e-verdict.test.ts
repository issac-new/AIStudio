// e2e-verdict 守门（融合批三）：判据正本自 simharness mx-eval-summary.py 移植
// （V8.45 §5.3 G4-E）。钉 PASS/GAP/FAIL 三态、unknown/红队阈值、指纹漂移、
// 裁判三角、覆盖读数、装饰指标、线上证据与判定行格式。
import { describe, expect, it } from 'vitest'
import { computeE2eVerdict, e2eVerdictLine } from '../e2e-verdict'

const base = {
  maxUnknown: 0.10,
  maxRedteamFp: 0.20,
}

const okInput = {
  ...base,
  registry: { consumption: { summary: { decoration: 0 } }, coverage: { covered: 3, total: 7, untaggedTasks: 0 } },
  runBody: {
    run: {
      status: 'done', setHash: 'h1', liveEvidence: { qpsProbe: { targetQps: 10 } },
      aggregates: { passAtK: 0.8, unknownRatio: 0.05, riskVeto: false, releaseGate: { verdict: 'pass', gapKeys: [] } },
    },
  },
  setBody: { set: { contentHash: 'h1' } },
  evaluators: { audit: { judge: { online: true }, bySource: { s1: 2 }, human: { overrides: 1 }, conflicts: 0, unknown: { s1Ratio: 0.1 } } },
  redteamRun: { run: { benign: { falsePositiveRate: 0.05 }, s1Wired: false } },
}

describe('computeE2eVerdict（mx-eval-summary 判据逐条）', () => {
  it('全绿 → pass', () => {
    const r = computeE2eVerdict(okInput as never)
    expect(r).toEqual({ verdict: 'pass', fails: [], gaps: [], noData: [] })
    expect(e2eVerdictLine(r)).toBe('EVAL-GATE-PASS 全部门禁项通过')
  })

  it('运行缺席/非 done/pass@k 缺席/红线否决/unknown 超限 → fail（任一即 fail）', () => {
    expect(computeE2eVerdict({ ...okInput, runBody: null } as never).verdict).toBe('fail')
    const bad = computeE2eVerdict({
      ...okInput,
      runBody: { run: { status: 'running', aggregates: { riskVeto: true, unknownRatio: 0.5, releaseGate: { verdict: 'fail' } } } },
    } as never)
    expect(bad.fails).toContain('pass@k 缺席（无法形成门禁结论）')
    expect(bad.fails).toContain('红线一票否决命中（riskVeto=true）')
    expect(bad.fails.some((f) => f.startsWith('unknown 率 50% 超过上限 10%'))).toBe(true)
    expect(bad.fails).toContain('评测发布门禁 verdict=fail')
    expect(bad.verdict).toBe('fail')
  })

  it('集指纹漂移=不可对比（fail）', () => {
    const r = computeE2eVerdict({ ...okInput, setBody: { set: { contentHash: 'h2' } } } as never)
    expect(r.fails).toContain('集已改版（run.setHash ≠ 当前 contentHash），读数不可直接对比')
  })

  it('GAP 族：三角缺席/覆盖缺席/红队缺席/装饰指标', () => {
    const r = computeE2eVerdict({
      ...okInput,
      registry: { consumption: { summary: { decoration: 2 } } },
      evaluators: null,
      redteamRun: null,
      runBody: { run: { ...okInput.runBody.run, liveEvidence: {} } },
    } as never)
    expect(r.verdict).toBe('gap')
    expect(r.gaps).toContain('评估器三角审计缺席（/runs/:id/evaluators 不可用）')
    expect(r.gaps).toContain('能力维度覆盖读数缺席（metric-registry.coverage 不可用）')
    expect(r.gaps).toContain('红队运行缺席（安全证据不可得）')
    expect(r.gaps.some((g) => g.includes('装饰指标 2 个'))).toBe(true)
    // 线上证据未回填不再单列笼统 GAP（run23 复盘去重）：该事实由门禁逐项
    // response_tier/qps_headroom 的 requires_live_backfill 原因码承载。
    expect(r.gaps.some((g) => g.includes('线上证据未回填'))).toBe(false)
  })

  it('发布门禁 no_data → GAP 且逐项带原因码；fail → FAIL 点名（§5.3 三态不混）', () => {
    const runBody = {
      run: {
        status: 'done', setHash: 'h1',
        aggregates: {
          passAtK: 0.8, unknownRatio: 0.05, riskVeto: false,
          releaseGate: {
            verdict: 'pass',
            checks: [
              { key: 'tool_success', threshold: '≥ 99.0%', measured: '99.5%', status: 'pass' },
              { key: 'ttft', threshold: '≤ 1.5s', measured: null, status: 'no_data', noDataCode: 'not_collected', noDataReason: '本次运行=内联证据（无 session/span 轨迹）', gap: '本次运行=内联证据（无 session/span 轨迹）' },
              { key: 'qps_headroom', threshold: '峰值 QPS ×2', measured: null, status: 'no_data', noDataCode: 'requires_live_backfill', noDataReason: '容量压测属部署验收', gap: '容量压测属部署验收' },
            ],
            gapKeys: ['ttft', 'qps_headroom'],
            noData: [
              { key: 'ttft', code: 'not_collected', reason: '本次运行=内联证据（无 session/span 轨迹）' },
              { key: 'qps_headroom', code: 'requires_live_backfill', reason: '容量压测属部署验收' },
            ],
          },
        },
      },
    }
    const gap = computeE2eVerdict({ ...okInput, runBody } as never)
    expect(gap.verdict).toBe('gap')
    expect(gap.noData).toEqual([
      { key: 'ttft', code: 'not_collected', reason: '本次运行=内联证据（无 session/span 轨迹）' },
      { key: 'qps_headroom', code: 'requires_live_backfill', reason: '容量压测属部署验收' },
    ])
    expect(gap.gaps.some((g) => g.includes('未采集（本可采集）：ttft'))).toBe(true)
    expect(gap.gaps.some((g) => g.includes('无回放数据源（须线上回填）：qps_headroom'))).toBe(true)

    const failed = computeE2eVerdict({
      ...okInput,
      runBody: {
        run: {
          ...runBody.run,
          aggregates: {
            ...runBody.run.aggregates,
            releaseGate: {
              verdict: 'fail',
              checks: [
                { key: 'tool_success', threshold: '≥ 99.0%', measured: '98.0%', status: 'fail' },
                { key: 'qps_headroom', threshold: '峰值 QPS ×2', measured: null, status: 'no_data', noDataCode: 'requires_live_backfill', noDataReason: '容量压测属部署验收', gap: '容量压测属部署验收' },
              ],
              gapKeys: ['qps_headroom'],
            },
          },
        },
      },
    } as never)
    expect(failed.verdict).toBe('fail')
    expect(failed.fails.some((f) => f.includes('发布门禁未达标：tool_success=98.0%'))).toBe(true)
    // 未达标（有读数）不得混进 no_data；no_data 仍按 GAP 记，不升级为 FAIL 的唯一原因
    expect(failed.noData.map((n) => n.key)).toEqual(['qps_headroom'])
    expect(failed.gaps.some((g) => g.includes('qps_headroom'))).toBe(true)
  })

  it('历史 run（只有 gapKeys 无 checks）→ 维持兼容文案，不猜原因码', () => {
    const r = computeE2eVerdict({
      ...okInput,
      runBody: { run: { status: 'done', aggregates: { passAtK: 1, unknownRatio: 0, riskVeto: false, releaseGate: { verdict: 'pass', gapKeys: ['ttft'] } } } },
    } as never)
    expect(r.gaps).toContain('发布门禁证据缺口：ttft')
    expect(r.noData).toEqual([])
    expect(r.verdict).toBe('gap')
  })

  it('裁判离线但存在 S1 判词=fail；无人工裁决=gap；abstain>30%=gap；冲突=gap', () => {
    const fail = computeE2eVerdict({
      ...okInput,
      evaluators: { audit: { judge: { online: false }, bySource: { s1: 1 }, human: { overrides: 1 }, conflicts: 0, unknown: { s1Ratio: 0.1 } } },
    } as never)
    expect(fail.fails).toContain('裁判离线但存在 S1 判词（降级运行不可作门禁）')
    const gap = computeE2eVerdict({
      ...okInput,
      evaluators: { audit: { judge: { online: true }, bySource: { s1: 1 }, human: { overrides: 0 }, conflicts: 2, unknown: { s1Ratio: 0.4 } } },
    } as never)
    expect(gap.gaps.some((g) => g.includes('abstain 率 40%'))).toBe(true)
    expect(gap.gaps.some((g) => g.includes('无人工裁决'))).toBe(true)
    expect(gap.gaps.some((g) => g.includes('冲突 2 条'))).toBe(true)
  })

  it('红队误报率超限=fail；阈值可调（maxRedteamFp）', () => {
    const r = computeE2eVerdict({
      ...okInput, redteamRun: { run: { benign: { falsePositiveRate: 0.5 } } },
    } as never)
    expect(r.fails.some((f) => f.includes('红队良性误报率 50% 超过上限 20%'))).toBe(true)
    const relaxed = computeE2eVerdict({
      ...okInput, maxRedteamFp: 0.6, redteamRun: { run: { benign: { falsePositiveRate: 0.5 } } },
    } as never)
    expect(relaxed.verdict).toBe('pass')
  })
})
