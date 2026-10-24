import { describe, it, expect } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 2026-10-24 清账批守门（spec 2026-10-24-swarm-eval-followup-batch.md）：
// 五件挂账的机制面在位＋默认态零行为（D15）＋mixed-motive 指标器行为用例。
const HARNESS = join(__dirname, '..')

function read(rel: string): string {
  return readFileSync(join(HARNESS, rel), 'utf8')
}

describe('清账批 · 旋钮结构（D10/D11/D15）', () => {
  it('MX_ABLATE_ROLES：mention 过滤+台账留痕在 dispatch_in_room', () => {
    const lib = read('mux/mx-scenario-lib.sh')
    expect(lib).toContain('MX_ABLATE_ROLES')
    expect(lib).toContain('ablation-skip')
    expect(lib).toContain('role=${_ab} run=${RUN_ID:-}')
    expect(lib).toContain('该角色无耳')
  })

  it('MX_BYZANTINE_SPEC：三模式 DM 注入+[BYZANTINE-INJECT] 标记', () => {
    const lib = read('mux/mx-scenario-lib.sh')
    expect(lib).toContain('MX_BYZANTINE_SPEC')
    expect(lib).toContain('[BYZANTINE-INJECT mode=${_b_mode} target=${_b_agent}')
    expect(lib).toContain('^(corruption|noise|gaslight)$')
    for (const mode of ['corruption', 'noise', 'gaslight']) {
      expect(new RegExp(`${mode}\\)\\s+_b_dir=`).test(lib)).toBe(true)
    }
    expect(lib).toContain('byzantine-events.log')
  })

  it('默认零行为（D15）：两旋钮全部 ${VAR:-} 守卫，未设时 dispatch_in_room 不进注入分支', () => {
    const lib = read('mux/mx-scenario-lib.sh')
    expect(lib).toContain('[[ -n "${MX_ABLATE_ROLES:-}" && -n "${3:-}" ]]')
    expect(lib).toContain('[[ -n "${MX_BYZANTINE_SPEC:-}" && -n "${3:-}" ]]')
  })

  it('r18 dialog 采集位在位（全文保真度的数据面依赖）', () => {
    const sh = read('aipay-scenario.sh')
    expect(sh).toContain('r18-collect.py" --run "${RUN_ID}" dialog --step 9')
    expect(sh).toContain('dialog --step 11')
  })

  it('eval_collect 群体协作采集位仍在（清账批不回退吸收轮接线）', () => {
    expect(read('mux/mx-eval-lib.sh')).toContain('/api/hermes/delivery/swarm-collab?run=${RUN_ID:-}')
  })

  it('语法门', () => {
    execFileSync('bash', ['-n', join(HARNESS, 'mux', 'mx-scenario-lib.sh')])
    execFileSync('bash', ['-n', join(HARNESS, 'scenarios', 'mixed-motive-bidding', 'scenario.sh')])
    execFileSync('python3', ['-m', 'py_compile', join(HARNESS, 'mux', 'mx-mixed-motive.py')])
  })
})

describe('清账批 D12 · mixed-motive 指标器（行为用例）', () => {
  it('settle：出价高者得、按份额截断、utility=份额×单位价值−出价', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mx-mm-'))
    try {
      const bids = [
        { round: 1, bidder: 'unit_a', bid: 30, quota: 40 },
        { round: 1, bidder: 'unit_b', bid: 20, quota: 40 },
        { round: 1, bidder: 'unit_c', bid: 10, quota: 40 },
      ]
      const bidsFile = join(dir, 'bids.jsonl')
      writeFileSync(bidsFile, bids.map(b => JSON.stringify(b)).join('\n') + '\n')
      const ledgerFile = join(dir, 'ledger.jsonl')
      execFileSync('python3', [join(HARNESS, 'mux', 'mx-mixed-motive.py'), 'settle',
        '--bids', bidsFile, '--out', ledgerFile, '--quota', '100', '--unit-value', '2.0'])
      const rows = readFileSync(ledgerFile, 'utf8').trim().split('\n').map(l => JSON.parse(l))
      expect(rows).toHaveLength(3)
      const a = rows.find(r => r.bidder === 'unit_a')!
      expect(a.allocated).toBe(40)
      expect(a.won).toBe(true)
      expect(a.utility).toBe(40 * 2.0 - 30)
      // 全员需求 120 > 额度 100：unit_c 只剩 20
      expect(rows.find(r => r.bidder === 'unit_c')!.allocated).toBe(20)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('metrics：welfare=ΣU、基尼=[0,1]、纳什偏离=相对离差、缺席如实 null', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mx-mm2-'))
    try {
      const ledger = [
        { round: 1, bidder: 'unit_a', bid: 30, quotaAsked: 40, allocated: 40, won: true, utility: 50 },
        { round: 1, bidder: 'unit_b', bid: 20, quotaAsked: 40, allocated: 40, won: true, utility: 60 },
        { round: 1, bidder: 'unit_c', bid: 10, quotaAsked: 40, allocated: 20, won: true, utility: 30 },
      ]
      const ledgerFile = join(dir, 'ledger.jsonl')
      writeFileSync(ledgerFile, ledger.map(l => JSON.stringify(l)).join('\n') + '\n')
      const outFile = join(dir, 'report.json')
      execFileSync('python3', [join(HARNESS, 'mux', 'mx-mixed-motive.py'), 'metrics',
        '--ledger', ledgerFile, '--out', outFile])
      const r = JSON.parse(readFileSync(outFile, 'utf8'))
      expect(r.welfare).toBe(140)
      expect(r.gini).toBeGreaterThanOrEqual(0)
      expect(r.gini).toBeLessThanOrEqual(1)
      expect(r.nashDeviation).toBeGreaterThan(0)
      expect(r.bidders).toBe(3)
      expect(r.budgetUtilization).toBeCloseTo(100 / 120)
      expect(r.nashBasis).toContain('relative-dispersion-proxy')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('完全平等分配 → gini=0；空台账 → welfare 0 不炸', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mx-mm3-'))
    try {
      const equal = [1, 2].map(i => ({ round: 1, bidder: `u${i}`, bid: 1, quotaAsked: 50, allocated: 50, won: true, utility: 40 }))
      const f = join(dir, 'eq.jsonl')
      writeFileSync(f, equal.map(l => JSON.stringify(l)).join('\n') + '\n')
      const out = join(dir, 'eq-report.json')
      execFileSync('python3', [join(HARNESS, 'mux', 'mx-mixed-motive.py'), 'metrics', '--ledger', f, '--out', out])
      const r = JSON.parse(readFileSync(out, 'utf8'))
      expect(r.gini).toBe(0)
      expect(r.nashDeviation).toBe(0)

      const empty = join(dir, 'empty.jsonl')
      writeFileSync(empty, '')
      const out2 = join(dir, 'empty-report.json')
      const res = spawnSync('python3', [join(HARNESS, 'mux', 'mx-mixed-motive.py'), 'metrics', '--ledger', empty, '--out', out2], { encoding: 'utf8' })
      expect(res.status).toBe(0)
      const r2 = JSON.parse(readFileSync(out2, 'utf8'))
      expect(r2.welfare).toBe(0)
      expect(r2.gini).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
