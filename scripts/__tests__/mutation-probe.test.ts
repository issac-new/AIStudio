// 守门:变异探针的判定解析与「门会红」实证（跑一个真实 scope 探针）。
// spec: docs/superpowers/specs/2026-11-05-governance-truth-restoration.md（批次 B5）
import { describe, expect, it } from 'vitest'
import { parseVerdict, runCase, CASES, main } from '../mutation-probe.mjs'

describe('parseVerdict', () => {
  it('解析 PASS/FAIL/CONDITIONAL 行', () => {
    expect(parseVerdict('✓ L0.scope-check: PASS', 'L0.scope-check')).toBe('PASS')
    expect(parseVerdict('✗ L0.scope-check: FAIL — scope-check-result:fail', 'L0.scope-check')).toBe('FAIL')
    expect(parseVerdict('△ L0.registers: CONDITIONAL — x', 'L0.registers')).toBe('CONDITIONAL')
  })
  it('无关门不误匹配', () => {
    expect(parseVerdict('✓ L0.other: PASS', 'L0.scope-check')).toBe('UNKNOWN')
  })
})

describe('runCase（真实 qgate 子进程）', () => {
  it('scope-empty 探针必须检出 FAIL（门会红）', () => {
    const c = CASES.find((x) => x.id === 'scope-empty')
    const r = runCase(c)
    expect(r.verdict).toBe('FAIL')
    expect(r.detected).toBe(true)
  }, 30_000)
})

describe('main', () => {
  it('--help 返回 0 并列出 case', () => {
    const out = { text: '', write(s) { this.text += s } }
    expect(main(['--help'], out, { write() {} })).toBe(0)
    expect(out.text).toContain('scope-empty')
  })
  it('未知 case 返回 2', () => {
    const err = { text: '', write(s) { this.text += s } }
    expect(main(['--case', 'nope'], { write() {} }, err)).toBe(2)
    expect(err.text).toContain('unknown case')
  })
})
