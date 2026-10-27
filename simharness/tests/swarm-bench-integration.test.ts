import { describe, it, expect } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 2026-10-24 群体协作聚合层接线守门（评测榜）：
// 采集位 / 透传键 / 报告行 / 判据零变化（spec 2026-10-24-swarm-bench-leaderboard.md D18/D21）。
// 单一事实源=overlay custom/server/delivery/swarm-bench.ts——本仓只调端点落证据。
const HARNESS = join(__dirname, '..')

function read(rel: string): string {
  return readFileSync(join(HARNESS, rel), 'utf8')
}

describe('群体协作评测榜接线结构', () => {
  it('eval_collect 采集 swarm-bench（fail-soft 静默）', () => {
    const lib = read('mux/mx-eval-lib.sh')
    expect(lib).toContain('/api/hermes/delivery/swarm-bench')
    expect(lib).toContain('swarm-bench.json')
    expect(lib).toContain('只透传不进判据')
  })

  it('summary 透传 swarmBench 键（不进判据）', () => {
    const py = read('mux/mx-eval-summary.py')
    expect(py).toContain('swarm-bench.json')
    expect(py).toContain('"swarmBench"')
    // 判据面零新增：fails/gaps 组装段不得出现 bench 透传
    const judgeZone = py.slice(py.indexOf('fails, gaps = []'), py.indexOf('verdict = "fail"'))
    expect(judgeZone).not.toContain('swarmBench')
  })

  it('报告证据八表有「群体协作评测榜」行', () => {
    const gen = read('mux/mx-report-gen.py')
    expect(gen).toContain("bench = d.get('swarmBench') or {}")
    expect(gen).toContain('<td>群体协作评测榜</td>')
    expect(gen).toContain('taskLatencyMedianSeconds')
  })

  it('脚本语法门', () => {
    execFileSync('bash', ['-n', join(HARNESS, 'mux', 'mx-eval-lib.sh')])
    execFileSync('python3', ['-m', 'py_compile', join(HARNESS, 'mux', 'mx-eval-summary.py')])
    execFileSync('python3', ['-m', 'py_compile', join(HARNESS, 'mux', 'mx-report-gen.py')])
  })
})

// 透传不改判：带 swarm-bench.json 与缺席两种形态，退出码与 verdict 一致。
const baseDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'mx-swarm-bench-'))
  const passFixture = {
    registry: { registry: { consumption: { summary: { total: 23, wired: 21, unwired: 2, decoration: 0 }, decorationKeys: [] } }, coverage: { covered: 2, total: 7, untaggedTasks: 0, dimensions: [] } },
    run: { run: { id: 'erun-1', setId: 'eset-1', setHash: 'abc123', status: 'done', aggregates: { passAt1: 1, passAtK: 1, unknownRatio: 0, riskVeto: false, releaseGate: { verdict: 'pass', measuredCount: 1, gapKeys: [] }, pyramid: [], actions: [] }, liveEvidence: { qpsProbe: { targetQps: 10, achievedQps: 10, errorRate: 0, p99ToP50: 1 } } } },
    set: { set: { id: 'eset-1', contentHash: 'abc123', revision: 1 } },
    evaluators: { audit: { bySource: { s0: 6, s1: 0, 's0+s1': 0, human: 0 }, conflicts: 0, audit: { ratio: 1, withReason: 6, total: 6 }, unknown: { s1Ratio: 0 }, judge: { online: true }, human: { overrides: 0 }, policy: { strict: { passAtK: 1 }, conservative: { passAtK: 1 } }, riskLevel: 'ok', notes: [] } },
    redteam: { run: { id: 'rt-1', s1Wired: false, totals: { evasionRate: 0.5, detected: 10, evaluated: 20 }, benign: { falsePositiveRate: 0.1 }, byCategory: [], byGeneration: [] } },
    nine: { layers: [] },
  }
  for (const [name, key] of [['metric-registry.json', 'registry'], ['eval-run.json', 'run'], ['eval-set.json', 'set'], ['evaluators.json', 'evaluators'], ['redteam-run.json', 'redteam'], ['nine-layers.json', 'nine']] as const) {
    writeFileSync(join(dir, name), JSON.stringify((passFixture as any)[key], null, 2), 'utf8')
  }
  writeFileSync(join(dir, 'redteam-runs.json'), JSON.stringify({ runs: [] }), 'utf8')
  writeFileSync(join(dir, 'verdict.json'), JSON.stringify({ ok: true, verdict: 'pass', fails: [], gaps: [], line: 'EVAL-GATE-PASS 测试判定件' }), 'utf8')
  return dir
}

function runSummary(dir: string): { status: number; out: any } {
  const out = join(dir, 'eval-summary.json')
  const r = spawnSync('python3', [join(HARNESS, 'mux', 'mx-eval-summary.py'), '--dir', dir, '--out', out, '--verdict-file', join(dir, 'verdict.json')], { encoding: 'utf8' })
  let parsed: any = null
  try { parsed = JSON.parse(readFileSync(out, 'utf8')) } catch { /* noop */ }
  return { status: r.status ?? -1, out: parsed }
}

describe('群体协作评测榜透传判据', () => {
  it('带榜单：swarmBench 透传且 verdict 不变（PASS）', () => {
    const dir = baseDir()
    try {
      writeFileSync(join(dir, 'swarm-bench.json'), JSON.stringify({
        available: true,
        runsScanned: 2,
        entries: [
          { run: '20261021-v8-run22', overallRank: 1.2, onFrontier: true, values: { completionRate: 5 / 6, taskLatencyMedianSeconds: 1063 } },
          { run: '20261020-fx', overallRank: 1.4, onFrontier: true, values: { completionRate: 1, taskLatencyMedianSeconds: 1800 } },
        ],
        pareto: { costKey: 'charsPerCompletedTask', benefitKey: 'completionRate', frontierSize: 2 },
        note: '均位=可用指标平均名次',
      }), 'utf8')
      const r = runSummary(dir)
      expect(r.status).toBe(0)
      expect(r.out.verdict).toBe('pass')
      expect(r.out.swarmBench.runsScanned).toBe(2)
      expect(r.out.swarmBench.entries).toHaveLength(2)
      expect(r.out.swarmBench.entries[0].values.taskLatencyMedianSeconds).toBe(1063)
      expect(r.out.swarmBench.frontierSize).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('榜单缺席（旧证据目录形态）：swarmBench=null 且判据不受影响', () => {
    const dir = baseDir()
    try {
      const r = runSummary(dir)
      expect(r.status).toBe(0)
      expect(r.out.verdict).toBe('pass')
      expect(r.out.swarmBench).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
