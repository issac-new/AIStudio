// 执行日志行投影守门（multica：一行一 run/结论三态/倒序/筛选）。
import { describe, it, expect } from 'vitest'
import { runLogLine, runLogView, type RunRecord } from '../run-log'

const run = (id: string, over: Partial<RunRecord> = {}): RunRecord => ({
  runId: id, startedAt: 1000, durationMs: 2500, exitCode: 0, timedOut: false,
  command: 'npm test', ...over,
})

describe('runLogLine（一行一 run）', () => {
  it('结论三态：0=success、非 0=failed、超时优先 timeout', () => {
    expect(runLogLine(run('a')).outcome).toBe('success')
    expect(runLogLine(run('b', { exitCode: 1 })).outcome).toBe('failed')
    expect(runLogLine(run('c', { timedOut: true, exitCode: null })).outcome).toBe('timeout')
  })
  it('摘要含结论+秒耗+命令截断 40 字', () => {
    const line = runLogLine(run('a', { command: 'x'.repeat(50) }))
    expect(line.summary.startsWith('success 2.5s ')).toBe(true)
    expect(line.summary.length).toBeLessThanOrEqual('success 2.5s '.length + 40)
    expect(line.summary.endsWith('…')).toBe(true)
  })
})

describe('runLogView（倒序+筛选）', () => {
  it('时间倒序；filter=failed 只留失败', () => {
    const runs = [
      run('old', { startedAt: 100 }),
      run('new', { startedAt: 900, exitCode: 2 }),
    ]
    expect(runLogView(runs).map((l) => l.runId)).toEqual(['new', 'old'])
    expect(runLogView(runs, 'failed').map((l) => l.runId)).toEqual(['new'])
    expect(runLogView(runs, 'success').map((l) => l.runId)).toEqual(['old'])
  })
})

describe('费用列（multica）', () => {
  it('未记账不带费用段；记账带 $x.xx', () => {
    expect(runLogLine(run('a')).summary).not.toContain('$')
    const paid = runLogLine(run('b', { costUsd: 0.125 }))
    expect(paid.summary).toContain('$0.13')
    expect(paid.costUsd).toBe(0.125)
  })
})
