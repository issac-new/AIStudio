// qgate 失败回流（P2-5）守门：FAIL/CONDITIONAL 提取、坏文件容错、指纹幂等入库。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { extractQgateRunCandidates, readQgateRunRows, type QgateRunRow } from '../qgate-ingest'
import { _useStoreDirForTests, ingestQgateRuns, listCandidates } from '../exp-store'

let dir: string
let runsDir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'qgate-ingest-'))
  runsDir = join(dir, 'runs')
  mkdirSync(runsDir, { recursive: true })
  _useStoreDirForTests(join(dir, 'exp'))
})

afterEach(() => {
  delete process.env.EXP_STORE
  delete process.env.QGATE_RUNS_DIR
  rmSync(dir, { recursive: true, force: true })
})

const row = (over: Partial<QgateRunRow>): QgateRunRow => ({
  runId: 'r1', gateId: 'L1.symbol-grounding', verdict: 'FAIL', startedAt: Date.now(), ...over,
})

describe('extractQgateRunCandidates', () => {
  it('FAIL 与 CONDITIONAL 都产生候选，PASS 忽略，同指纹聚合计数', () => {
    const out = extractQgateRunCandidates([
      row({ runId: 'r1', failureSummary: 'unresolved import @/x' }),
      row({ runId: 'r2', failureSummary: 'unresolved import @/x' }),
      row({ runId: 'r3', verdict: 'CONDITIONAL', conditions: ['clear before release'] }),
      row({ runId: 'r4', verdict: 'PASS' }),
    ])
    expect(out).toHaveLength(2)
    const fail = out.find((c) => c.fingerprint.includes('symbol-grounding') && c.statement.includes('unresolved'))
    expect(fail?.fingerprint).toMatch(/^qgate:L1\.symbol-grounding:/)
    expect(fail?.statement).toContain('（2 次）')
    const cond = out.find((c) => c.statement.includes('clear before release'))
    expect(cond?.type).toBe('antipattern')
  })

  it('不同失败摘要产生不同指纹', () => {
    const out = extractQgateRunCandidates([
      row({ runId: 'r1', failureSummary: 'a' }),
      row({ runId: 'r2', failureSummary: 'b' }),
    ])
    expect(out).toHaveLength(2)
    expect(out[0].fingerprint).not.toBe(out[1].fingerprint)
  })
})

describe('readQgateRunRows / ingestQgateRuns', () => {
  it('坏文件跳过，合法 run 被读取', () => {
    writeFileSync(join(runsDir, 'good.json'), JSON.stringify(row({ runId: 'r1' })), 'utf8')
    writeFileSync(join(runsDir, 'bad.json'), 'not-json', 'utf8')
    const rows = readQgateRunRows(runsDir)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ runId: 'r1', gateId: 'L1.symbol-grounding', verdict: 'FAIL' })
  })

  it('入库按指纹幂等：第二次扫描不新增', () => {
    writeFileSync(join(runsDir, 'r1.json'), JSON.stringify(row({ runId: 'r1', failureSummary: 'boom' })), 'utf8')
    const first = ingestQgateRuns(runsDir)
    expect(first.scanned).toBe(1)
    expect(first.added).toBe(1)
    expect(listCandidates()).toHaveLength(1)
    expect(listCandidates()[0].statement).toContain('qgate 拦截反模式')
    const second = ingestQgateRuns(runsDir)
    expect(second.added).toBe(0)
    expect(second.skipped).toBe(1)
    expect(listCandidates()).toHaveLength(1)
  })
})
