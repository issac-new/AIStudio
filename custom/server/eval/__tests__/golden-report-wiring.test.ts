// 黄金集门检读数接线（2026-11-12 handbook 吸收）：摘要真跑 + 报告源码级锚点。
import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = join(import.meta.dirname, '..', '..', '..', '..')

describe('黄金集门检读数接线', () => {
  it('mx-eval-summary.py 真跑：goldenGate 透传 buckets/mismatch/calibration', () => {
    const dir = mkdtempSync(join(tmpdir(), 'golden-report-'))
    try {
      writeFileSync(join(dir, 'golden-gate.json'), JSON.stringify({
        ok: true,
        buckets: { positive: 10, ambiguous: 9, adversarial: 10 },
        mismatch: ['ga-ur-01'],
        calibration: { f2pPassed: 22, f2pTotal: 30, p2pPassed: 29, p2pTotal: 30, calibrated: false, decision: 'uncalibrated', failed: [] },
        runId: 'r1',
      }))
      writeFileSync(join(dir, 'verdict.json'), JSON.stringify({ verdict: 'gap', fails: [], gaps: ['demo'], line: 'EVAL-GATE-GAP demo' }))
      const out = join(dir, 'out.json')
      const r = spawnSync('python3', [join(root, 'simharness/mux/mx-eval-summary.py'), '--dir', dir, '--out', out, '--verdict-file', join(dir, 'verdict.json')], { encoding: 'utf8' })
      // gap 判定退出码 4 是产品语义，不是脚本失败。
      expect([0, 4]).toContain(r.status)
      const payload = JSON.parse(readFileSync(out, 'utf8'))
      expect(payload.goldenGate).toMatchObject({
        ok: true,
        buckets: { positive: 10, ambiguous: 9, adversarial: 10 },
        mismatch: ['ga-ur-01'],
      })
      expect(payload.goldenGate.calibration.f2pPassed).toBe(22)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('报告生成器含黄金集行与读数文件锚点（防静默摘除）', () => {
    const src = readFileSync(join(root, 'simharness/mux/mx-report-gen.py'), 'utf8')
    expect(src).toContain('黄金集门检')
    expect(src).toContain("golden-gate.json")
    expect(src).toContain('gg_txt')
  })

  it('G4 流程先跑门检再出摘要（同轮读数）', () => {
    const src = readFileSync(join(root, 'simharness/mux/mx-eval-lib.sh'), 'utf8')
    const gate = src.indexOf('eval_golden_gate >/dev/null')
    const summary = src.indexOf('out=$(eval_summary)')
    expect(gate).toBeGreaterThan(-1)
    expect(summary).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(summary)
  })
})
