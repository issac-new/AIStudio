import { describe, it, expect } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// V8.45 全流程评测接线守门（2026-10-19 百度评测轮）：
// 隔离库 / G4 子门 / 报告消费 / 清理 / 预检 / 采集位 / 汇总器判据。
const HARNESS = join(__dirname, '..')

function read(rel: string): string {
  return readFileSync(join(HARNESS, rel), 'utf8')
}

describe('V8.45 评测接线结构', () => {
  it('评测/红队/留出库/trace 隔离到 SIM_ROOT', () => {
    const lib = read('mux/mx-lib.sh')
    for (const s of ['EVAL_STORE="$WEBUI_HOME/eval"', 'REDTEAM_STORE="$WEBUI_HOME/redteam"', 'HELDOUT_STORE="$WEBUI_HOME/heldout"', 'EVAL_TRACE_DIR="$HERMES_ROOT/traces"', 'HERMES_TRACES_DIR="$HERMES_ROOT/traces"']) {
      expect(lib).toContain(s)
    }
  })

  it('驱动 source 评测库并挂 G4 子门（FAIL 不置 g4_pass）', () => {
    const sh = read('aipay-scenario.sh')
    expect(sh).toContain('source "$SCRIPT_DIR/mux/mx-eval-lib.sh"')
    expect(sh).toContain('eval_flow || _eval_rc=$?')
    expect(sh).toContain('if (( _eval_rc != 1 )); then')
    expect(sh).toContain('sset g4_eval_blocked 1')
    expect(sh).toContain('evalops_snapshot')
    expect(sh).toContain('eval_done')
  })

  it('清理器归档评测三库；预检 ㉓ 在位', () => {
    const clean = read('mux/mx-clean.sh')
    expect(clean).toContain('for _ed in eval redteam heldout; do')
    expect(clean).toContain('webui-$_ed')
    const pre = read('mux/mx-prelaunch-check.sh')
    expect(pre).toContain('㉓ 评测接线')
    expect(pre).toContain('三十项')
  })

  it('报告链消费 eval-summary（证据八 + PART1 行 + 叙事槽）', () => {
    const gen = read('mux/mx-report-gen.py')
    expect(gen).toContain('def eval_summary_html')
    expect(gen).toContain('{eval_summary_html()}')
    expect(gen).toContain("eval-summary.json")
    const merge = read('mux/final-report-merge.py')
    expect(merge).toContain('评测子门（V8.45）')
    expect(merge).toContain("ev_path = evid / 'evals' / 'eval-summary.json'")
    const narrative = read('mux/mx-narrative-skeleton.py')
    expect(narrative).toContain('{{{{eval_gate}}}}')
  })

  it('采集位与脚本可执行', () => {
    expect(read('mux/capture-plan.env')).toContain('eval_done|/app/eval')
    expect(read('mux/r18-collect.py')).toContain("'eval_done': 19")
    expect(read('mux/spec-params.env')).toContain('EVAL_MAX_UNKNOWN')
    execFileSync('bash', ['-n', join(HARNESS, 'mux', 'mx-eval-lib.sh')])
    execFileSync('bash', ['-n', join(HARNESS, 'aipay-scenario.sh')])
    execFileSync('python3', ['-m', 'py_compile', join(HARNESS, 'mux', 'mx-eval-summary.py')])
    execFileSync('python3', ['-m', 'py_compile', join(HARNESS, 'mux', 'mx-eval-summary.py')])
  })
})

const base = {
  registry: {
    registry: {
      consumption: {
        summary: { total: 23, wired: 21, unwired: 2, decoration: 0 },
        decorationKeys: [],
      },
    },
    coverage: { covered: 2, total: 7, untaggedTasks: 0, dimensions: [] },
  },
  run: {
    run: {
      id: 'erun-1', setId: 'eset-1', setHash: 'abc123', status: 'done',
      aggregates: {
        passAt1: 1, passAtK: 1, unknownRatio: 0, riskVeto: false,
        releaseGate: { verdict: 'pass', measuredCount: 1, gapKeys: [] },
        pyramid: [], actions: [],
      },
      liveEvidence: { qpsProbe: { targetQps: 10, achievedQps: 10, errorRate: 0, p99ToP50: 1 } },
    },
  },
  set: { set: { id: 'eset-1', contentHash: 'abc123', revision: 1 } },
  evaluators: {
    audit: {
      bySource: { s0: 6, s1: 0, 's0+s1': 0, human: 0 },
      conflicts: 0,
      audit: { ratio: 1, withReason: 6, total: 6 },
      unknown: { s1Ratio: 0 },
      judge: { online: true },
      human: { overrides: 0 },
      policy: { strict: { passAtK: 1 }, conservative: { passAtK: 1 } },
      riskLevel: 'ok', notes: [],
    },
  },
  redteam: {
    run: {
      id: 'rt-1', s1Wired: false,
      totals: { evasionRate: 0.5, detected: 10, evaluated: 20 },
      benign: { falsePositiveRate: 0.1 },
      byCategory: [], byGeneration: [],
    },
  },
  nine: { layers: [] },
}

function writeFixture(dir: string, patch: (f: typeof base) => void): void {
  const f = JSON.parse(JSON.stringify(base)) as typeof base
  patch(f)
  for (const [name, key] of [['metric-registry.json', 'registry'], ['eval-run.json', 'run'], ['eval-set.json', 'set'], ['evaluators.json', 'evaluators'], ['redteam-run.json', 'redteam'], ['nine-layers.json', 'nine']] as const) {
    writeFileSync(join(dir, name), JSON.stringify((f as any)[key], null, 2), 'utf8')
  }
  writeFileSync(join(dir, 'redteam-runs.json'), JSON.stringify({ runs: [] }), 'utf8')
}

function runSummary(dir: string): { status: number; stdout: string; out: any } {
  const out = join(dir, 'eval-summary.json')
  const r = spawnSync('python3', [
    join(HARNESS, 'mux', 'mx-eval-summary.py'), '--dir', dir, '--out', out,
  ], { encoding: 'utf8' })
  let parsed: any = null
  try { parsed = JSON.parse(readFileSync(out, 'utf8')) } catch { /* noop */ }
  return { status: r.status ?? -1, stdout: r.stdout || '', out: parsed }
}

describe('V8.45 评测子门判据', () => {
  it('PASS：全部门禁项通过', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mx-eval-pass-'))
    try {
      writeFixture(dir, () => undefined)
      const r = runSummary(dir)
      expect(r.status).toBe(0)
      expect(r.stdout).toContain('EVAL-GATE-PASS')
      expect(r.out.verdict).toBe('pass')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('FAIL：红线命中/unknown 超限/锚点漂移', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mx-eval-fail-'))
    try {
      writeFixture(dir, (f) => { f.run.run.aggregates.riskVeto = true })
      let r = runSummary(dir)
      expect(r.status).toBe(1)
      expect(r.out.verdict).toBe('fail')
      expect(r.out.fails.join()).toContain('红线')

      writeFixture(dir, (f) => { f.run.run.aggregates.unknownRatio = 0.5 })
      r = runSummary(dir)
      expect(r.status).toBe(1)
      expect(r.out.fails.join()).toContain('unknown')

      writeFixture(dir, (f) => { f.set.set.contentHash = 'drifted' })
      r = runSummary(dir)
      expect(r.status).toBe(1)
      expect(r.out.fails.join()).toContain('集已改版')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('GAP：覆盖 0/7、红队缺席、线上证据未回填（非阻断）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mx-eval-gap-'))
    try {
      writeFixture(dir, (f) => {
        f.registry.coverage.covered = 0
        delete (f.run.run as any).liveEvidence
      })
      rmSync(join(dir, 'redteam-run.json'), { force: true })
      const r = runSummary(dir)
      expect(r.status).toBe(2)
      expect(r.stdout).toContain('EVAL-GATE-GAP')
      expect(r.out.gaps.join()).toContain('能力维度覆盖 0/7')
      expect(r.out.gaps.join()).toContain('红队运行缺席')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
