// v0.3 R1 契约门族守门：diff/breaking/surface/matrix 四模式 + diff.ts 核心。
// 负例先行：契约漂移、未核验报告、面哈希漂移、消费者断供——都不得 PASS。
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { jsonPointerDiff, getPath, evaluateAssertion } from '../src/core/diff.js'
import { runContractExecutor } from '../src/executors/contract.js'
import type { ExecutorSpec } from '../src/core/types.js'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'qgate-r1-'))

describe('diff.ts 核心（JSON Pointer + 断言）', () => {
  it('深比较：missing/unexpected/mismatch 三类；ignorePaths 段通配只豁免声明路径', () => {
    const expected = { a: 1, b: { c: 2 }, d: [1, 2] }
    const observed = { a: 1, b: { c: 3 }, e: 9 }
    const diffs = jsonPointerDiff(expected, observed)
    expect(diffs.map((d) => d.pointer).sort()).toEqual(['/b/c', '/d', '/e'])
    const ignored = jsonPointerDiff(expected, observed, ['/b/*'])
    expect(ignored.map((d) => d.pointer).sort()).toEqual(['/d', '/e'])
  })

  it('getPath 点路径取值；evaluateAssertion 六算子 + when 条件 skip', () => {
    const c = { amount: 100, cap: 50, list: [{ v: 7 }] }
    expect(getPath(c, 'amount')).toBe(100)
    expect(getPath(c, 'list.0.v')).toBe(7)
    expect(getPath(c, 'nope.x')).toBeUndefined()
    expect(evaluateAssertion({ left: 'amount', operator: 'ge', right: 'cap' }, c)).toBe(true)
    expect(evaluateAssertion({ left: 'amount', operator: 'lt', right: 'cap' }, c)).toBe(false)
    expect(evaluateAssertion({ left: 'amount', operator: 'eq', value: 100 }, c)).toBe(true)
    expect(evaluateAssertion({ left: 'amount', operator: 'neq', value: 100 }, c)).toBe(false)
    expect(evaluateAssertion({ left: 'amount', operator: 'eq', value: 100, when: 'flag' }, c)).toBe('skip')
  })
})

describe('contract mode=diff（期望契约 vs 观察）', () => {
  const exec = (over: Partial<ExecutorSpec>): ExecutorSpec => ({ id: 'c', type: 'contract', mode: 'diff', evidenceType: 'x', ...over })
  const run = (e: ExecutorSpec, ws: string) => runContractExecutor(e, { runId: 'r', gateId: 'g', workspace: ws })

  it('一致 → pass；漂移 → fail 点名 pointer；ignorePaths 豁免', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'expected.json'), JSON.stringify({ version: 1, paths: { '/a': { get: 1 } } }))
    writeFileSync(join(ws, 'observed.json'), JSON.stringify({ version: 1, paths: { '/a': { get: 1 } } }))
    expect(run(exec({ expectedFile: 'expected.json', observedFile: 'observed.json' }), ws).result).toBe('pass')
    writeFileSync(join(ws, 'observed.json'), JSON.stringify({ version: 2, paths: { '/a': { get: 1 } } }))
    const fail = run(exec({ expectedFile: 'expected.json', observedFile: 'observed.json' }), ws)
    expect(fail.result).toBe('fail')
    expect(fail.summary).toContain('/version')
    const ignored = run(exec({ expectedFile: 'expected.json', observedFile: 'observed.json', ignorePaths: ['/version'] }), ws)
    expect(ignored.result).toBe('pass')
  })

  it('期望/观察缺失 → error（INCONCLUSIVE 方向）', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'expected.json'), '{}')
    expect(run(exec({ expectedFile: 'expected.json', observedFile: 'nope.json' }), ws).result).toBe('error')
    expect(run(exec({ expectedFile: 'nope.json', observedFile: 'x.json' }), ws).result).toBe('error')
  })
})

describe('contract mode=breaking（外部 diff 工具报告）', () => {
  const exec = (): ExecutorSpec => ({ id: 'c', type: 'contract', mode: 'breaking', evidenceType: 'x', observedFile: 'report.json' })
  const run = (ws: string) => runContractExecutor(exec(), { runId: 'r', gateId: 'g', workspace: ws })

  it('checked+空 breaking → pass；有破坏 → fail 点名；未核验/畸形 → error', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'report.json'), JSON.stringify({ checked: true, breaking: [] }))
    expect(run(ws).result).toBe('pass')
    writeFileSync(join(ws, 'report.json'), JSON.stringify({ checked: true, breaking: ['DELETE /payments'] }))
    const fail = run(ws)
    expect(fail.result).toBe('fail')
    expect(fail.summary).toContain('DELETE /payments')
    writeFileSync(join(ws, 'report.json'), JSON.stringify({ checked: false, breaking: [] }))
    expect(run(ws).result).toBe('error')
    writeFileSync(join(ws, 'report.json'), '{bad')
    expect(run(ws).result).toBe('error')
  })
})

describe('contract mode=surface（openapi 面枚举 + 哈希绑定）', () => {
  const exec = (over: Partial<ExecutorSpec> = {}): ExecutorSpec => ({ id: 'c', type: 'contract', mode: 'surface', evidenceType: 'x', surfaceFile: 'openapi.json', ...over })
  const run = (e: ExecutorSpec, ws: string) => runContractExecutor(e, { runId: 'r', gateId: 'g', workspace: ws })
  const openapi = { openapi: '3.0.0', paths: { '/payments': { get: {}, post: {} }, '/refunds': { post: {} } } }

  it('枚举端点 → pass（计数入证据）；无端点/坏文件 → 拒收', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'openapi.json'), JSON.stringify(openapi))
    const ok = run(exec(), ws)
    expect(ok.result).toBe('pass')
    expect(ok.summary).toContain('3 endpoints')
    writeFileSync(join(ws, 'openapi.json'), JSON.stringify({ openapi: '3.0.0', paths: {} }))
    expect(run(exec(), ws).result).toBe('fail')
    writeFileSync(join(ws, 'openapi.json'), 'nope')
    expect(run(exec(), ws).result).toBe('error')
  })

  it('contentSha256 漂移 → fail', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'openapi.json'), JSON.stringify(openapi))
    writeFileSync(join(ws, 'register.json'), JSON.stringify({ surfaceFile: 'openapi.json', contentSha256: 'deadbeef'.repeat(8) }))
    const fail = run(exec({ observedFile: 'register.json' }), ws)
    expect(fail.result).toBe('fail')
    expect(fail.summary).toContain('sha256 drifted')
  })
})

describe('contract mode=matrix（消费者兼容矩阵）', () => {
  const exec = (): ExecutorSpec => ({ id: 'c', type: 'contract', mode: 'matrix', evidenceType: 'x', consumersDir: 'consumers', observedFile: 'provider.json' })
  const run = (ws: string) => runContractExecutor(exec(), { runId: 'r', gateId: 'g', workspace: ws })

  it('全兼容 → pass；端点断供/字段缺失 → fail 归因到消费者', () => {
    const ws = tmp()
    mkdirSync(join(ws, 'consumers'))
    writeFileSync(join(ws, 'consumers', 'web.json'), JSON.stringify({ consumer: 'web', expected: [{ method: 'get', path: '/payments' }, { method: 'post', path: '/refunds', fields: ['amount'] }] }))
    writeFileSync(join(ws, 'provider.json'), JSON.stringify({ endpoints: [{ method: 'get', path: '/payments' }, { method: 'post', path: '/refunds', requestBodyFields: ['amount'] }] }))
    expect(run(ws).result).toBe('pass')
    writeFileSync(join(ws, 'provider.json'), JSON.stringify({ endpoints: [{ method: 'get', path: '/payments' }] }))
    const fail = run(ws)
    expect(fail.result).toBe('fail')
    expect(fail.summary).toContain('web')
    expect(fail.summary).toContain('/refunds')
  })

  it('目录缺失/空 → error', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'provider.json'), JSON.stringify({ endpoints: [] }))
    expect(run(ws).result).toBe('error')
  })
})
