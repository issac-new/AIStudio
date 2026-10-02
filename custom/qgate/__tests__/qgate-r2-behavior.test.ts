// v0.3 R2+R7 行为门族守门：cases（含 F2P/P2P 六类违规）/journey/property/visual。
// 负例先行：用例漂移、伪修复、掩盖回归、步骤漂移、性质反例、字节不匹配——都不得 PASS。
import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runBehaviorExecutor } from '../src/executors/behavior.js'
import type { ExecutorSpec } from '../src/core/types.js'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'qgate-r2-'))
const run = (e: ExecutorSpec, ws: string) => runBehaviorExecutor(e, { runId: 'r', gateId: 'g', workspace: ws })

describe('behavior mode=cases', () => {
  const base: ExecutorSpec = {
    id: 'b', type: 'behavior', mode: 'cases', evidenceType: 'x',
    observedFile: 'observed.json',
    cases: [
      { id: 'normal', expected: { decision: 'accept', fee: 2 } },
      { id: 'zero', expected: { decision: 'reject', reason: 'amount' } },
    ],
  }

  it('全对 → pass；用例漂移 → fail 点名；观察缺失 → error', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'observed.json'), JSON.stringify({ cases: [
      { id: 'normal', actual: { decision: 'accept', fee: 2 } },
      { id: 'zero', actual: { decision: 'reject', reason: 'amount' } },
    ] }))
    expect(run(base, ws).result).toBe('pass')
    writeFileSync(join(ws, 'observed.json'), JSON.stringify({ cases: [
      { id: 'normal', actual: { decision: 'accept', fee: 3 } },
      { id: 'zero', actual: { decision: 'reject', reason: 'amount' } },
    ] }))
    const fail = run(base, ws)
    expect(fail.result).toBe('fail')
    expect(fail.summary).toContain('normal')
    rmSync(join(ws, 'observed.json'))
    expect(run(base, ws).result).toBe('error')
  })

  it('未声明的观察用例 → fail（unexpected observed cases）', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'observed.json'), JSON.stringify({ cases: [
      { id: 'normal', actual: { decision: 'accept', fee: 2 } },
      { id: 'zero', actual: { decision: 'reject', reason: 'amount' } },
      { id: 'ghost', actual: {} },
    ] }))
    const fail = run(base, ws)
    expect(fail.result).toBe('fail')
    expect(fail.summary).toContain('ghost')
  })
})

describe('behavior F2P/P2P 双版本基线（R7，防伪修复/防掩盖回归）', () => {
  const exec = (over: Partial<ExecutorSpec>): ExecutorSpec => ({
    id: 'b', type: 'behavior', mode: 'cases', evidenceType: 'x',
    observedFile: 'current.json', baselineFile: 'baseline.json',
    cases: [
      { id: 'fix-1', expected: { v: 2 } },
      { id: 'keep-1', expected: { v: 1 } },
    ],
    ...over,
  })
  const write = (ws: string, f: string, cases: Array<[string, unknown]>): void =>
    writeFileSync(join(ws, f), JSON.stringify({ cases: cases.map(([id, actual]) => ({ id, actual })) }))

  it('真修复 + 无回归 → pass', () => {
    const ws = tmp()
    write(ws, 'baseline.json', [['fix-1', { v: 1 }], ['keep-1', { v: 1 }]])  // fix-1 基线上失败
    write(ws, 'current.json', [['fix-1', { v: 2 }], ['keep-1', { v: 1 }]])
    const ok = run(exec({ f2p: ['fix-1'], p2p: ['keep-1'] }), ws)
    expect(ok.result).toBe('pass')
    expect(ok.summary).toContain('1 f2p + 1 p2p')
  })

  it('伪修复（基线已通过）→ fail f2p-passing-on-baseline；未修复 → fail f2p-failing-current', () => {
    const ws = tmp()
    write(ws, 'baseline.json', [['fix-1', { v: 2 }]])  // 基线就过 = 不是修复目标
    write(ws, 'current.json', [['fix-1', { v: 2 }]])
    const fake = run(exec({ f2p: ['fix-1'] }), ws)
    expect(fake.result).toBe('fail')
    expect(fake.summary).toContain('f2p-passing-on-baseline')
    write(ws, 'baseline.json', [['fix-1', { v: 1 }]])
    write(ws, 'current.json', [['fix-1', { v: 1 }]])   // 当前仍败
    const unfixed = run(exec({ f2p: ['fix-1'] }), ws)
    expect(unfixed.result).toBe('fail')
    expect(unfixed.summary).toContain('f2p-failing-current')
  })

  it('回归（p2p 当前败）→ fail p2p-current-failed；缺观察 → fail *-missing-current', () => {
    const ws = tmp()
    write(ws, 'baseline.json', [['keep-1', { v: 1 }]])
    write(ws, 'current.json', [['keep-1', { v: 9 }]])
    const reg = run(exec({ p2p: ['keep-1'] }), ws)
    expect(reg.result).toBe('fail')
    expect(reg.summary).toContain('p2p-current-failed')
    write(ws, 'current.json', [])
    const miss = run(exec({ p2p: ['keep-1'] }), ws)
    expect(miss.result).toBe('fail')
    expect(miss.summary).toContain('p2p-missing-current')
  })
})

describe('behavior mode=journey', () => {
  const exec: ExecutorSpec = {
    id: 'b', type: 'behavior', mode: 'journey', evidenceType: 'x',
    observedFile: 'observed.json',
    scenarios: [{ id: 'checkout', expectedSteps: [{ id: 'login' }, { id: 'pay', expected: { status: 'ok' } }, { id: 'done' }] }],
  }

  it('步骤序+内容对 → pass；序漂移/内容漂移 → fail 点名', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'observed.json'), JSON.stringify({ scenarios: [
      { id: 'checkout', steps: [{ id: 'login', actual: {} }, { id: 'pay', actual: { status: 'ok' } }, { id: 'done', actual: {} }] },
    ] }))
    expect(run(exec, ws).result).toBe('pass')
    writeFileSync(join(ws, 'observed.json'), JSON.stringify({ scenarios: [
      { id: 'checkout', steps: [{ id: 'login', actual: {} }, { id: 'done', actual: {} }, { id: 'pay', actual: { status: 'retry' } }] },
    ] }))
    const fail = run(exec, ws)
    expect(fail.result).toBe('fail')
    expect(fail.summary).toContain('sequence drift')
    expect(fail.summary).toContain('pay')
  })
})

describe('behavior mode=property', () => {
  const exec: ExecutorSpec = {
    id: 'b', type: 'behavior', mode: 'property', evidenceType: 'x',
    observedFile: 'observed.json', seed: 42, minCases: 2,
    assertions: [{ left: 'captured', operator: 'ge', right: 'refunded' }],
    allowedTransitions: [['created', 'captured'], ['captured', 'refunded']],
  }

  it('性质成立 → pass；反例 → fail 带 counterexamples；非法转换 → fail', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'observed.json'), JSON.stringify({ cases: [
      { captured: 100, refunded: 30, from: 'created', to: 'captured' },
      { captured: 50, refunded: 50, from: 'captured', to: 'refunded' },
    ] }))
    expect(run(exec, ws).result).toBe('pass')
    writeFileSync(join(ws, 'observed.json'), JSON.stringify({ cases: [
      { captured: 10, refunded: 30, from: 'created', to: 'refunded' },  // 反例 + 非法转换双违规
      { captured: 50, refunded: 20, from: 'created', to: 'captured' },
    ] }))
    const fail = run(exec, ws)
    expect(fail.result).toBe('fail')
    expect(fail.summary).toContain('counterexample')
    expect(fail.summary).toContain('illegal transition created→refunded')
  })

  it('案例数不足 minCases → error（弱证据拒收）', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'observed.json'), JSON.stringify({ cases: [{ captured: 1, refunded: 0 }] }))
    expect(run(exec, ws).result).toBe('error')
  })
})

describe('behavior mode=visual', () => {
  const exec = (over: Partial<ExecutorSpec> = {}): ExecutorSpec => ({
    id: 'b', type: 'behavior', mode: 'visual', evidenceType: 'x',
    observedFile: 'actual.svg', expectedFile: 'baseline.svg', ...over,
  })

  it('字节一致 → pass；不一致无容差 → fail；容差内 → pass；容差外 → fail；度量缺失 → error', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'baseline.svg'), '<svg>a</svg>')
    writeFileSync(join(ws, 'actual.svg'), '<svg>a</svg>')
    expect(run(exec(), ws).result).toBe('pass')
    writeFileSync(join(ws, 'actual.svg'), '<svg>b</svg>')
    expect(run(exec(), ws).result).toBe('fail')
    writeFileSync(join(ws, 'metrics.json'), JSON.stringify({ diff: { pixels: 10, totalPixels: 10000 } }))
    expect(run(exec({ maxDiffPixels: 50, dataFile: 'metrics.json' }), ws).result).toBe('pass')
    const out = run(exec({ maxDiffPixels: 5, dataFile: 'metrics.json' }), ws)
    expect(out.result).toBe('fail')
    expect(out.summary).toContain('10px > maxDiffPixels 5')
    expect(run(exec({ maxDiffPixels: 50 }), ws).result).toBe('error')  // 容差声明但度量文件缺失
    rmSync(join(ws, 'baseline.svg'))
    expect(run(exec(), ws).result).toBe('error')
  })
})
