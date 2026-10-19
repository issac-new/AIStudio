// 告警采集装配守门（2026-10-19 观测层轮）：24h 当前窗/N 天基线窗切分、
// eval 运行注入、端到端出告警。
import { describe, expect, it } from 'vitest'
import { collectObsAlerts } from '../collect'
import type { ObsSpanRow } from '../../obssignals/signals'
import type { EvalRun } from '../../eval/types'

const NOW = 1_760_100_000_000
const NOW_S = NOW / 1000
const DAY = 86_400

function llmAt(epochSec: number, tokens: number, over: Partial<ObsSpanRow> = {}): ObsSpanRow {
  return {
    type: 'chunk', kind: 'llm_span', phase: 'post', session_id: 's',
    started_at: epochSec, ended_at: epochSec + 1, first_token_ms: 500,
    usage: { input_tokens: tokens, output_tokens: Math.floor(tokens / 2) },
    ...over,
  }
}

function evalRun(createdAt: number, passAt1: number): EvalRun {
  return {
    id: `r-${createdAt}`,
    setId: 'set1',
    target: { profile: 'p', model: 'm', version: 'v' },
    k: 1,
    status: 'done',
    attempts: [],
    aggregates: {
      taskCount: 1, passAt1, passAtK: passAt1,
      byLayer: { result: passAt1, trajectory: null, risk: 'none', efficiency: { avgTokens: null, avgCostUsd: null, avgSteps: null, avgDurationMs: null } },
      unknownRatio: 0, rubricDrilldownHint: false, riskVeto: false,
      statisticallyInsufficient: false, judgeOnline: true,
    },
    createdAt,
  } as EvalRun
}

describe('collectObsAlerts', () => {
  it('当前窗/基线窗切分 + 成本尖峰端到端触发', () => {
    const rows: ObsSpanRow[] = [
      // 基线 3 天每天 1000 input（日均 1500 全口径）
      llmAt(NOW_S - 2 * DAY, 1000),
      llmAt(NOW_S - 3 * DAY, 1000),
      llmAt(NOW_S - 4 * DAY, 1000),
      // 当日 9000 input（13500 全口径，9x 基线）
      llmAt(NOW_S - 3600, 9000),
    ]
    const r = collectObsAlerts(7, { now: NOW, rows, evalRuns: [] })
    expect(r.ok).toBe(true)
    const spike = r.alerts.find((a) => a.kind === 'cost-spike')
    expect(spike).toBeDefined()
    expect(spike?.severity).toBe('critical')
    expect(r.sources.traceRows).toBe(4)
  })

  it('质量漂移：eval 运行注入后按窗切分判定', () => {
    const rows: ObsSpanRow[] = [llmAt(NOW_S - 3600, 100)]
    const evalRuns = [
      evalRun(NOW - 3600_000, 0.4), // 当日
      evalRun(NOW - 2 * DAY * 1000, 0.9),
      evalRun(NOW - 3 * DAY * 1000, 0.9),
    ]
    const r = collectObsAlerts(7, { now: NOW, rows, evalRuns })
    const drift = r.alerts.find((a) => a.kind === 'quality-drift')
    expect(drift).toBeDefined()
    expect(drift?.severity).toBe('critical') // 50pp 下跌 ≥ 2×10pp
    expect(r.sources.evalRunsCurrent).toBe(1)
    expect(r.sources.evalRunsBaseline).toBe(2)
  })

  it('基线窗无数据 → skipped no_baseline，不硬报', () => {
    const rows: ObsSpanRow[] = [llmAt(NOW_S - 3600, 100)]
    const r = collectObsAlerts(7, { now: NOW, rows, evalRuns: [] })
    expect(r.alerts.filter((a) => a.kind !== 'quality-drift')).toEqual([])
    const skippedKinds = r.skipped.map((s) => s.kind)
    expect(skippedKinds).toContain('cost-spike')
    expect(skippedKinds).toContain('error-rate')
  })
})
