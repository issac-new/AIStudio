import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// V8.46 治理闭环接线守门（2026-10-19 run22 前置轮）：
// G6 键统一 / 发布门与 UAT 台账 / 评测处置链 / 证据九 / 预检 ㉔-㉚ / 模板同步。
// 任一环只改产品不接驱动、或只改报告不接审计，本套件当场失败。
const HARNESS = join(__dirname, '..')
const OVERLAY = process.env.MX_OVERLAY_ROOT || '/Users/cuishi/lab/ncwk/overlay'

function read(rel: string): string {
  return readFileSync(join(HARNESS, rel), 'utf8')
}
function readOverlay(rel: string): string {
  const p = join(OVERLAY, rel)
  if (!existsSync(p)) throw new Error(`overlay 文件缺席：${p}（设 MX_OVERLAY_ROOT 指向产品仓）`)
  return readFileSync(p, 'utf8')
}

describe('V8.46 G6 闸键统一', () => {
  it('产品六闸 G6=retro_done@步24，不再取 report_done', () => {
    const reg = readOverlay('custom/client/ia2/views/sim/steps-registry.ts')
    expect(reg).toContain("id: 'G6', key: 'retro_done', step: 24")
    expect(reg).not.toContain("id: 'G6', key: 'report_done'")
    const test = readOverlay('custom/client/ia2/__tests__/sim-overview-panel.test.ts')
    expect(test).toContain("'g5_ready', 'retro_done'")
  })
})

describe('V8.46 治理闭环接线', () => {
  it('prelaunch 三十项且 ㉔-㉚ 在位', () => {
    const pre = read('mux/mx-prelaunch-check.sh')
    expect(pre).toContain('prelaunch 三十项')
    for (const n of ['㉔', '㉕', '㉖', '㉗', '㉘', '㉙', '㉚']) {
      expect(pre).toContain(n)
    }
  })

  it('驱动接发布门/UAT 台账与闭环快照', () => {
    const sh = read('aipay-scenario.sh')
    expect(sh).toContain('/api/hermes/sim/release-gate')
    expect(sh).toContain('/api/hermes/sim/uat-verdict')
    expect(sh).toContain('mx-closure-snapshot.sh')
    expect(sh).toContain('deliver --step 23')
    expect(sh).toContain('skill 过程帧采集位未建')
  })

  it('报告证据九 + 审计查15/16 + 合并后复跑', () => {
    const gen = read('mux/mx-report-gen.py')
    expect(gen).toContain('证据九：治理结果可反查')
    expect(gen).toContain('closure_evidence_html')
    const audit = read('mux/mx-report-audit.py')
    expect(audit).toContain('查 15：评测结果一致性')
    expect(audit).toContain('查 16：治理结果证据九')
    const sh = read('aipay-scenario.sh')
    const audits = (sh.match(/mx-report-audit\.py/g) || []).length
    expect(audits).toBeGreaterThanOrEqual(2)
  })

  it('评测处置链与线上证据回填函数在位', () => {
    const lib = read('mux/mx-eval-lib.sh')
    expect(lib).toContain('eval_remediation_flow')
    expect(lib).toContain('eval_live_evidence')
    expect(lib).toContain('/live-evidence')
    expect(lib).toContain('/remediations/')
    expect(lib).toContain('remediations.json')
  })

  it('模板五张带 V8.46 同步位', () => {
    expect(read('mux/templates-pending/test-report.md')).toContain('评测处置链（V8.46）')
    expect(read('mux/templates-pending/release-plan.md')).toContain('release-gate.jsonl')
    expect(read('mux/templates-pending/acceptance.md')).toContain('uat-verdicts.jsonl')
    expect(read('mux/templates-pending/retrospective.md')).toContain('治理闭环读数（V8.46')
    expect(read('mux/templates-pending/audit-opinion.md')).toContain('治理闭环证据九')
  })

  it('脚本语法与 Python 可编译', () => {
    execFileSync('bash', ['-n', join(HARNESS, 'aipay-scenario.sh')])
    execFileSync('bash', ['-n', join(HARNESS, 'mux/mx-prelaunch-check.sh')])
    execFileSync('bash', ['-n', join(HARNESS, 'mux/mx-closure-snapshot.sh')])
    execFileSync('bash', ['-n', join(HARNESS, 'mux/mx-eval-lib.sh')])
    execFileSync('python3', ['-m', 'py_compile',
      join(HARNESS, 'mux/mx-report-gen.py'),
      join(HARNESS, 'mux/mx-report-audit.py'),
    ])
  })
})
