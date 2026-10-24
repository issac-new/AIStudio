import { describe, it, expect } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 2026-10-24 群体协作四维度读数接线守门（多 Agent 群体协作评测基准吸收轮）：
// 采集位 / 透传键 / 报告行 / 判据零变化（spec 2026-10-24-swarm-eval-benchmark-absorption.md D1/D2）。
// 单一事实源=overlay custom/server/delivery/swarm-collab.ts——本仓只调端点落证据，
// 不复制度量逻辑（D1）；结构断言锁三处接线在位（V8.48 守门同款范式）。
const HARNESS = join(__dirname, '..')

function read(rel: string): string {
  return readFileSync(join(HARNESS, rel), 'utf8')
}

describe('群体协作读数接线结构', () => {
  it('eval_collect 采集 swarm-collab（fail-soft 静默）', () => {
    const lib = read('mux/mx-eval-lib.sh')
    expect(lib).toContain('/api/hermes/delivery/swarm-collab?run=${RUN_ID:-}')
    expect(lib).toContain('swarm-collab.json')
    expect(lib).toContain('只透传不进判据')
  })

  it('summary 透传 swarmCollab 键（不进判据）', () => {
    const py = read('mux/mx-eval-summary.py')
    expect(py).toContain('swarm-collab.json')
    expect(py).toContain('"swarmCollab": swarm.get("readout")')
    // 判据面零新增：fails/gaps 组装段不得出现 swarm 字样
    const judgeZone = py.slice(py.indexOf('fails, gaps = []'), py.indexOf('verdict = "fail"'))
    expect(judgeZone).not.toContain('swarm')
  })

  it('报告证据八表有「群体协作读数」行', () => {
    const gen = read('mux/mx-report-gen.py')
    expect(gen).toContain("swarm = d.get('swarmCollab') or {}")
    expect(gen).toContain('<tr><td>群体协作读数</td>')
    expect(gen).toContain("comm_sw = swarm.get('communication') or {}")
  })

  it('脚本语法门', () => {
    execFileSync('bash', ['-n', join(HARNESS, 'mux', 'mx-eval-lib.sh')])
    execFileSync('python3', ['-m', 'py_compile', join(HARNESS, 'mux', 'mx-eval-summary.py')])
    execFileSync('python3', ['-m', 'py_compile', join(HARNESS, 'mux', 'mx-report-gen.py')])
  })
})

// 透传不改判：带 swarm-collab.json 与全缺席两种形态，退出码与 verdict 一致。
const baseDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'mx-swarm-'))
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
  return dir
}

function runSummary(dir: string): { status: number; out: any } {
  const out = join(dir, 'eval-summary.json')
  const r = spawnSync('python3', [join(HARNESS, 'mux', 'mx-eval-summary.py'), '--dir', dir, '--out', out], { encoding: 'utf8' })
  let parsed: any = null
  try { parsed = JSON.parse(readFileSync(out, 'utf8')) } catch { /* noop */ }
  return { status: r.status ?? -1, out: parsed }
}

describe('群体协作读数透传判据', () => {
  it('带读数：swarmCollab 透传且 verdict 不变（PASS）', () => {
    const dir = baseDir()
    try {
      writeFileSync(join(dir, 'swarm-collab.json'), JSON.stringify({
        available: true, run: '20261021-fx',
        readout: {
          run: '20261021-fx', communication: { dispatchCount: 77, morCharsPerTask: 4200, intentFidelity: { rate: 0.75, preserved: 3, anchoredTasks: 4, basis: 'anchor' }, deadlockSignals: { backfillCount: 5 } },
          credit: { agents: [], taskCompletion: { done: 2, total: 4 }, coalitionsCovered: 4 },
          pareto: { frontierSize: 3, points: [] },
          social: { uat: { total: 7, pass: 7, conditional: 0, reject: 0 }, unconditionalPassRate: 1, gateRejects: 16, byzantine: { status: 'no_data', note: '' } },
        },
      }), 'utf8')
      const r = runSummary(dir)
      expect(r.status).toBe(0)
      expect(r.out.verdict).toBe('pass')
      expect(r.out.swarmCollab.communication.dispatchCount).toBe(77)
      expect(r.out.swarmCollab.social.gateRejects).toBe(16)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('全缺席（旧证据目录形态）：swarmCollab=null 且判据不受影响', () => {
    const dir = baseDir()
    try {
      const r = runSummary(dir)
      expect(r.status).toBe(0)
      expect(r.out.swarmCollab).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
