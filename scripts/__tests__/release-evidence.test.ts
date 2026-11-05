// 守门:发布证据的齐全性判定（不跑真实发布）。
// spec: docs/superpowers/specs/2026-11-05-governance-truth-restoration.md（批次 C3）
import { describe, expect, it } from 'vitest'
import { buildEvidence, main } from '../release-evidence.mjs'

const JUNIT_OK = '<testsuites tests="7820" failures="0"></testsuites>'
const STATE_OK = { 'engineering.basic-check': { runId: 'run-1', verdict: 'PASS', startedAt: 1 } }

describe('buildEvidence', () => {
  it('junit 新鲜 + basic-check PASS → pass', () => {
    const e = buildEvidence({ now: 1000, junitText: JUNIT_OK, junitMtime: 999, state: STATE_OK, version: '1.0.12-overlay', tag: 'v1.0.12-overlay', head: 'abc', tree: 'def' })
    expect(e.pass).toBe(true)
    expect(e.junit).toEqual({ tests: 7820, failures: 0 })
  })
  it('junit 陈旧 → fail', () => {
    const dayMs = 24 * 3600 * 1000
    const e = buildEvidence({ now: dayMs + 1000, junitText: JUNIT_OK, junitMtime: 999, state: STATE_OK, version: 'v', tag: 't', head: 'h', tree: 't' })
    expect(e.pass).toBe(false)
    expect(e.problems.join(' ')).toContain('stale')
  })
  it('basic-check 非 PASS → fail', () => {
    const e = buildEvidence({ now: 1000, junitText: JUNIT_OK, junitMtime: 999, state: { 'engineering.basic-check': { runId: 'r', verdict: 'CONDITIONAL', startedAt: 1 } }, version: 'v', tag: 't', head: 'h', tree: 't' })
    expect(e.pass).toBe(false)
    expect(e.problems.join(' ')).toContain('verdict=CONDITIONAL')
  })
  it('junit 有失败 → fail', () => {
    const e = buildEvidence({ now: 1000, junitText: '<testsuites tests="10" failures="1"></testsuites>', junitMtime: 999, state: STATE_OK, version: 'v', tag: 't', head: 'h', tree: 't' })
    expect(e.pass).toBe(false)
    expect(e.problems.join(' ')).toContain('failures=1')
  })
  it('源文件比测试证据新 → fail（改完代码没重跑）', () => {
    const e = buildEvidence({ now: 1000, junitText: JUNIT_OK, junitMtime: 999, state: STATE_OK, version: 'v', tag: 't', head: 'h', tree: 't', runStartedAt: 100, sourceNewestMtime: 200 })
    expect(e.pass).toBe(false)
    expect(e.problems.join(' ')).toContain('source newer than test evidence')
  })
})

describe('main', () => {
  it('--help 返回 0', () => {
    const out = { text: '', write(s) { this.text += s } }
    expect(main(['--help'], out, { write() {} })).toBe(0)
    expect(out.text).toContain('release-evidence')
  })
})
