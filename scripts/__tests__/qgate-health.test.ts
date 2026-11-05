// 守门:qgate-health 代理的参数契约与人类可读渲染。
// spec: docs/superpowers/specs/2026-11-05-governance-truth-restoration.md（批次 A3）
import { describe, it, expect } from 'vitest'
import { parseArgs, cliArgs, renderHuman, applyBaseline, main } from '../qgate-health.mjs'

describe('parseArgs', () => {
  it('默认 scope=all，不要求 fresh', () => {
    expect(parseArgs([])).toEqual({ scope: 'all', requireFresh: false, maxAgeHours: undefined, consecutive: undefined, json: false, noBaseline: false })
  })
  it('scope/require-fresh/max-age-hours/consecutive/json 全部解析', () => {
    expect(parseArgs(['--scope', 'release', '--require-fresh', '--max-age-hours', '12', '--consecutive', '3', '--json'])).toEqual({
      scope: 'release', requireFresh: true, maxAgeHours: '12', consecutive: '3', json: true, noBaseline: false,
    })
  })
  it('--no-baseline 关闭豁免', () => {
    expect(parseArgs(['--no-baseline']).noBaseline).toBe(true)
  })
  it('非法 scope / 非法数字 / 未知参数抛错', () => {
    expect(() => parseArgs(['--scope', 'nope'])).toThrow(/scope/)
    expect(() => parseArgs(['--max-age-hours', '0'])).toThrow(/max-age-hours/)
    expect(() => parseArgs(['--consecutive', '1.5'])).toThrow(/consecutive/)
    expect(() => parseArgs(['--wat'])).toThrow(/unknown/)
  })
})

describe('cliArgs', () => {
  it('总是带 --json；require-fresh 追加；数字转字符串', () => {
    expect(cliArgs({ scope: 'pre-push', requireFresh: false })).toEqual(['health', '--scope', 'pre-push', '--json'])
    expect(cliArgs({ scope: 'release', requireFresh: true, maxAgeHours: 12, consecutive: 3 })).toEqual([
      'health', '--scope', 'release', '--json', '--require-fresh', '--max-age-hours', '12', '--consecutive', '3',
    ])
  })
})

describe('renderHuman', () => {
  it('逐门输出 health/verdict/executionStatus/freshness/连续计数/reason', () => {
    const text = renderHuman({
      scope: 'pre-push', generatedAt: 1, failOn: ['degraded', 'stale'], exitCode: 1,
      summary: { ok: 0, degraded: 1, skip: 0, stale: 0, never: 0, fail: 0, inconclusive: 0 },
      gates: [{
        gateId: 'L0.scope-check', domain: 'L0', verdict: 'CONDITIONAL', executionStatus: 'error',
        degradedReason: 'executor-error', health: 'degraded', freshness: 'fresh',
        consecutiveNonPass: 66, consecutiveBreach: true, blocking: false, reason: 'executor-error',
      }],
    })
    expect(text).toContain('DEGRADED L0.scope-check [L0]')
    expect(text).toContain('verdict=CONDITIONAL/error')
    expect(text).toContain('consecutiveNonPass=66')
    expect(text).toContain('summary: ok=0 degraded=1')
  })
})

describe('applyBaseline', () => {
  const report = {
    scope: 'pre-push', failOn: ['degraded', 'stale'], exitCode: 1,
    summary: { ok: 0, degraded: 2, skip: 0, stale: 0, never: 0, fail: 0, inconclusive: 0 },
    gates: [
      { gateId: 'L0.a', health: 'degraded', consecutiveBreach: false },
      { gateId: 'L0.b', health: 'degraded', consecutiveBreach: false },
    ],
  }
  const baseline = { allow: [
    { gateId: 'L0.a', reason: 'known', reviewBy: '2099-01-01' },
    { gateId: 'L0.b', reason: 'known', reviewBy: '2099-01-01' },
  ] }
  it('基线内且未过期 → 豁免，exit 0', () => {
    const r = applyBaseline(report, baseline, Date.parse('2026-01-01'))
    expect(r.exitCode).toBe(0)
    expect(r.known).toEqual(['L0.a', 'L0.b'])
    expect(r.gates[0].allowed).toBe(true)
  })
  it('基线外的新退化仍失败', () => {
    const r = applyBaseline(report, { allow: [baseline.allow[0]] }, Date.parse('2026-01-01'))
    expect(r.exitCode).toBe(1)
    expect(r.known).toEqual(['L0.a'])
  })
  it('过期条目失效并进 expired，按 strict 失败', () => {
    const r = applyBaseline(report, baseline, Date.parse('2100-01-01'))
    expect(r.exitCode).toBe(1)
    expect(r.expired).toEqual(['L0.a', 'L0.b'])
  })
})

describe('main', () => {
  it('--help 返回 0 且打印用法', () => {
    const out = { text: '', write(s) { this.text += s } }
    const err = { text: '', write(s) { this.text += s } }
    expect(main(['--help'], out, err)).toBe(0)
    expect(out.text).toContain('qgate-health')
    expect(err.text).toBe('')
  })
  it('未知参数返回 2，错误走 stderr', () => {
    const out = { text: '', write(s) { this.text += s } }
    const err = { text: '', write(s) { this.text += s } }
    expect(main(['--wat'], out, err)).toBe(2)
    expect(err.text).toContain('unknown argument')
  })
})
