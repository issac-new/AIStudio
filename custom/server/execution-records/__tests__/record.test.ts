// overlay/execution-records 真值单测（AgentTeams 吸收批二「执行记录写口」）。
// 对标判据（run-coding-cli.sh:83 原意）：每个退出路径都留痕——没有 transcript 的
// 索引条目会隐形，被拒绝的尝试恰恰最该被看见。本文件锁 record.ts 六条真值：
// 追加/按日分片、runId 幂等末行胜、坏行跳过、days 窗口过滤、prune 裁剪、写失败
// 计数不抛（旁路观测绝不影响主链路）。
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  appendExecutionRecord,
  executionRecordWriteFailures,
  executionRecordsDir,
  pruneExecutionRecords,
  readExecutionRecords,
} from '../record'

let dir: string
let env: NodeJS.ProcessEnv

/** 与 record.ts dayStamp 同构（本地时区），用于断言按日分片文件名。 */
function dayStamp(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function seedDayFile(daysAgo: number, lines: string[]): string {
  const ts = Date.now() - daysAgo * 86_400_000
  const name = `execution-records-${dayStamp(ts)}.jsonl`
  writeFileSync(join(dir, name), lines.join('\n') + '\n', 'utf8')
  return name
}

function validLine(over: Record<string, unknown>): string {
  return JSON.stringify({ v: 1, kind: 'coding-run', outcome: 'success', startedAt: Date.now(), ...over })
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'execution-records-'))
  env = { EXECUTION_RECORDS_DIR: dir }
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('appendExecutionRecord', () => {
  it('追加写入按日分片的今日文件，带契约版本 v=1', () => {
    appendExecutionRecord({ kind: 'coding-run', runId: 'r1', outcome: 'success', startedAt: Date.now() }, env)
    const expected = join(dir, `execution-records-${dayStamp(Date.now())}.jsonl`)
    expect(existsSync(expected)).toBe(true)
    const lines = readFileSync(expected, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0])).toMatchObject({ v: 1, kind: 'coding-run', runId: 'r1', outcome: 'success' })
  })

  it('目录自建：EXECUTION_RECORDS_DIR 指向不存在路径也能落盘', () => {
    const nested = join(dir, 'a/b/c')
    appendExecutionRecord({ kind: 'delegate', runId: 'r2', outcome: 'blocked', reason: 'engine-not-found', startedAt: Date.now() }, { EXECUTION_RECORDS_DIR: nested })
    expect(existsSync(join(nested, 'execution-records.jsonl'))).toBe(false)
    const names = readdirSync(nested)
    expect(names).toHaveLength(1)
    expect(names[0]).toMatch(/^execution-records-\d{4}-\d{2}-\d{2}\.jsonl$/)
  })

  it('写失败只计数不抛（chmod 只读空目录模拟新建失败；旁路观测绝不影响主链路）', () => {
    // 目录必须为空：向已存在文件追加只需文件写权限，目录只读拦不住——
    // 本用例要制造的是「新建当日分片文件被拒」。
    const before = executionRecordWriteFailures()
    chmodSync(dir, 0o500)
    try {
      expect(() =>
        appendExecutionRecord({ kind: 'coding-run', runId: 'r3', outcome: 'failed', startedAt: Date.now() }, env),
      ).not.toThrow()
      expect(executionRecordWriteFailures()).toBeGreaterThan(before)
    } finally {
      chmodSync(dir, 0o700)
    }
  })
})

describe('readExecutionRecords', () => {
  it('按 runId 幂等取末行（后行胜），且按 startedAt 时间倒序', () => {
    appendExecutionRecord({ kind: 'coding-run', runId: 'r1', outcome: 'success', startedAt: Date.now() - 2_000 }, env)
    appendExecutionRecord({ kind: 'coding-run', runId: 'r1', outcome: 'failed', exitCode: 1, startedAt: Date.now() - 1_000 }, env)
    appendExecutionRecord({ kind: 'delegate', runId: 'r2', outcome: 'timeout', startedAt: Date.now() }, env)
    const all = readExecutionRecords({ env })
    expect(all).toHaveLength(2)
    expect(all.map((r) => r.runId)).toEqual(['r2', 'r1'])
    expect(all[1].outcome).toBe('failed')
    expect(all[1].exitCode).toBe(1)
  })

  it('坏行跳过不炸读端（与 AgentTeams parseRunsIndex 同语义）', () => {
    seedDayFile(0, ['{not json', '', validLine({ runId: 'good' }), JSON.stringify({ no: 'runId' })])
    const all = readExecutionRecords({ env })
    expect(all.map((r) => r.runId)).toEqual(['good'])
  })

  it('days 窗口过滤：窗口外文件整片忽略，不猜数', () => {
    seedDayFile(5, [validLine({ runId: 'recent' })])
    seedDayFile(20, [validLine({ runId: 'old' })])
    expect(readExecutionRecords({ env }).map((r) => r.runId)).toEqual(['recent'])
    expect(readExecutionRecords({ days: 30, env }).map((r) => r.runId).sort()).toEqual(['old', 'recent'])
  })

  it('目录缺失返回空数组（fail-soft，不抛）', () => {
    expect(readExecutionRecords({ env: { EXECUTION_RECORDS_DIR: join(dir, 'missing') } })).toEqual([])
  })
})

describe('pruneExecutionRecords', () => {
  it('裁剪 RETAIN_DAYS 窗口外文件，保留窗口内文件；失败静默', () => {
    const old = seedDayFile(30, [validLine({ runId: 'old' })])
    const keep = seedDayFile(1, [validLine({ runId: 'keep' })])
    pruneExecutionRecords(env)
    expect(existsSync(join(dir, old))).toBe(false)
    expect(existsSync(join(dir, keep))).toBe(true)
    pruneExecutionRecords({ EXECUTION_RECORDS_DIR: join(dir, 'missing') }) // 不抛即通过
  })
})

describe('executionRecordsDir', () => {
  it('显式 env 优先（trim 后非空），缺省落 web-ui 根', () => {
    expect(executionRecordsDir({ EXECUTION_RECORDS_DIR: `  ${dir}  ` })).toBe(dir)
    const fallback = executionRecordsDir({})
    expect(fallback).toMatch(/execution-records$/)
    expect(fallback).not.toBe(dir)
  })
})

// 【标记断言】补丁 736 真值在补丁文件与 vendor 注入态，测试面只做存在性标记：
// 记录出口 appendExecutionRecord 的接线（import 行 + 两处调用：run 级/launch 级
// helper）不得在后续 vendor 升级/补丁重排中静默丢失。行为级验证见上方 record.ts
// 真值用例；run-manager 出口语义（pty close/print close/早退 blocked）由补丁评审
// 与 evidence 走查承载（依赖注入态运行时，单测不可达）。
describe('patch 736 标记断言（run-manager 出口落痕接线存在）', () => {
  const patchPath = resolve(__dirname, '../../../../patches/736-server-coding-run-records.patch')

  it('补丁含 import 行与 appendExecutionRecord 调用≥2 处', () => {
    expect(existsSync(patchPath), `补丁文件缺失：${patchPath}`).toBe(true)
    const text = readFileSync(patchPath, 'utf8')
    expect(text).toContain("import { appendExecutionRecord } from '../../../../custom/execution-records/record'")
    const calls = text.match(/appendExecutionRecord\(/g) ?? []
    expect(calls.length, 'run 级 + launch 级 helper 两处调用').toBeGreaterThanOrEqual(2)
    // 关键出口接线标记：pty close 与 print close 分支各有落痕调用
    expect(text).toContain('appendCodingRunRecord(run, exitCode === 0 ? \'success\' : \'failed\'')
    expect(text).toMatch(/appendCodingRunRecord\(run, 'success', \{ exitCode: 0 \}\)/)
    // 启动前拒绝 → blocked 短码
    expect(text).toContain("appendCodingLaunchRejected(launch, 'agent-update-locked')")
    expect(text).toContain("appendCodingLaunchRejected(launch, 'pty-unavailable')")
    expect(text).toContain("'cli-missing'")
  })
})
