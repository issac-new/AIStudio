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

  it('V8.48 新读数接线：任务难度/角色标注 + 行为信号/经营摘要采集与透传', () => {
    const lib = read('mux/mx-eval-lib.sh')
    expect(lib).toContain('全流程评测-${RFD_ID}-v2')
    expect(lib).toContain('"difficulty":"P1","role":"implementer"')
    expect(lib).toContain('"difficulty":"P0","role":"reviewer"')
    expect(lib).toContain('behavior-signals?days=7')
    expect(lib).toContain('business-summary')
    const py = read('mux/mx-eval-summary.py')
    expect(py).toContain('"byDifficulty": agg.get("byDifficulty")')
    expect(py).toContain('"behaviorSignals": behavior.get("signals")')
    expect(py).toContain('"businessSummary": biz.get("summary")')
    const gen = read('mux/mx-report-gen.py')
    expect(gen).toContain('难度/角色分桶')
    expect(gen).toContain('稳定性/行为信号/经营摘要')
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

function writeVerdict(dir: string, v: { verdict: string; fails?: string[]; gaps?: string[]; line?: string }): void {
  writeFileSync(join(dir, 'verdict.json'), JSON.stringify({
    ok: true, verdict: v.verdict, fails: v.fails ?? [], gaps: v.gaps ?? [],
    line: v.line ?? `EVAL-GATE-${v.verdict.toUpperCase()} 测试判定件`,
  }), 'utf8')
}

function runSummary(dir: string): { status: number; stdout: string; out: any } {
  const out = join(dir, 'eval-summary.json')
  const r = spawnSync('python3', [
    join(HARNESS, 'mux', 'mx-eval-summary.py'), '--dir', dir, '--out', out,
    '--verdict-file', join(dir, 'verdict.json'),
  ], { encoding: 'utf8' })
  let parsed: any = null
  try { parsed = JSON.parse(readFileSync(out, 'utf8')) } catch { /* noop */ }
  return { status: r.status ?? -1, stdout: r.stdout || '', out: parsed }
}

describe('V8.45 评测子门判据（融合批三：判定正本=产品 e2e-verdict.ts；此处钉组装与判定件合并）', () => {
  it('PASS 判定件 → status 0；读数组装完整', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mx-eval-pass-'))
    try {
      writeFixture(dir, () => undefined)
      writeVerdict(dir, { verdict: 'pass' })
      const r = runSummary(dir)
      expect(r.status).toBe(0)
      expect(r.stdout).toContain('EVAL-GATE-PASS')
      expect(r.out.verdict).toBe('pass')
      expect(r.out.run.passAt1).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('FAIL/GAP 判定件 → 退出码 1/2（映射面不动）；判定项原文透传', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mx-eval-map-'))
    try {
      writeFixture(dir, () => undefined)
      writeVerdict(dir, { verdict: 'fail', fails: ['红线一票否决命中（riskVeto=true）'] })
      let r = runSummary(dir)
      expect(r.status).toBe(1)
      expect(r.out.fails.join()).toContain('红线')

      writeVerdict(dir, { verdict: 'gap', gaps: ['能力维度覆盖 0/7（评测任务未显式标注 dimension）', '红队运行缺席（安全证据不可得）'] })
      r = runSummary(dir)
      expect(r.status).toBe(2)
      expect(r.out.gaps.join()).toContain('能力维度覆盖 0/7')
      expect(r.out.gaps.join()).toContain('红队运行缺席')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('判定件缺席 = FAIL fail-closed（判据不复算——产品判定缺席不装绿）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mx-eval-nov-'))
    try {
      writeFixture(dir, () => undefined)
      const r = runSummary(dir)
      expect(r.status).toBe(1)
      expect(r.out.verdict).toBe('fail')
      expect(r.out.fails.join()).toContain('判定件')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('V8.48：新读数透传且不改判（判定件为准；全缺席读数字段 null）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mx-eval-v848-'))
    try {
      writeFixture(dir, (f) => {
        f.run.run.aggregates.byDifficulty = [{ tier: 'P1', taskCount: 2, passAtK: 1 }, { tier: 'P0', taskCount: 1, passAtK: 1 }]
        f.run.run.aggregates.byRole = [{ role: 'implementer', taskCount: 2, passed: 2, passAtK: 1 }, { role: 'reviewer', taskCount: 1, passed: 1, passAtK: 1 }]
        f.run.run.aggregates.outputStability = { rounds: 3, checked: 6, flips: 0, flipRate: 0 }
      })
      writeVerdict(dir, { verdict: 'pass' })
      writeFileSync(join(dir, 'behavior-signals.json'), JSON.stringify({ ok: true, available: true, signals: { days: 7, hasUsage: true, rows: [{ key: 'llm_error_rate', value: 0.01, samples: 200, sufficient: true }] } }), 'utf8')
      writeFileSync(join(dir, 'business-summary.json'), JSON.stringify({ ok: true, summary: { verdict: 'releasable', verdictKey: 'all_gates_pass', facts: [{ key: 'quality', params: { pass: 100, tasks: 3, unknownPct: 0 } }] } }), 'utf8')
      let r = runSummary(dir)
      expect(r.status).toBe(0)
      expect(r.out.run.byDifficulty).toHaveLength(2)
      expect(r.out.run.byRole[0].role).toBe('implementer')
      expect(r.out.run.outputStability.rounds).toBe(3)
      expect(r.out.behaviorSignals.rows[0].key).toBe('llm_error_rate')
      expect(r.out.businessSummary.verdict).toBe('releasable')

      rmSync(join(dir, 'behavior-signals.json'), { force: true })
      rmSync(join(dir, 'business-summary.json'), { force: true })
      writeFixture(dir, (f) => { delete (f.run.run.aggregates as any).byDifficulty })
      r = runSummary(dir)
      expect(r.status).toBe(0)
      expect(r.out.run.byDifficulty).toBeNull()
      expect(r.out.behaviorSignals).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('融合批三接线：eval_summary 走治理服务判定（gov_eval_verdict 单源）', () => {
    const lib = read('mux/mx-eval-lib.sh')
    expect(lib).toContain('gov_eval_verdict "$d"')
    expect(lib).toContain('MX_EVAL_VERDICT_JSON="$d/verdict.json"')
  })
})

