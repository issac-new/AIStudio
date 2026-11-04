// W3 execution-join：四源归并、单源缺失 fail-soft、执行记录 v2 字段读写。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { executionJoin } from '../execution-join'
const today = new Date()
const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

import { appendExecutionRecord, readExecutionRecords, EXECUTION_RECORDS_VERSION } from '../../execution-records/record'

describe('ExecutionRecord v2（W3 字段贯通）', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'exec-rec-')); process.env.EXECUTION_RECORDS_DIR = dir })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); delete process.env.EXECUTION_RECORDS_DIR })

  it('v2 新字段写入并读回；v1 旧档读取兼容（缺字段=未知）', () => {
    // 先手写 v1 旧档再 append——同日文件 writeFileSync 会覆写 append 的行
    writeFileSync(
      join(dir, `execution-records-${day}.jsonl`),
      JSON.stringify({ v: 1, kind: 'delegate', runId: 'r-v1', outcome: 'failed', startedAt: 2 }) + '\n',
    )
    appendExecutionRecord({
      kind: 'coding-run', runId: 'r-v2', outcome: 'success', startedAt: 1,
      traceId: 'tr-1', stepId: 's-1', workflowVersion: 'g@1', promptVersion: 'p-1',
      inputRef: 'in://1', outputRef: 'out://1', retryCount: 2, approvalId: 'ap-1',
    })
    const recs = readExecutionRecords({ days: 90 })
    const v2 = recs.find((r) => r.runId === 'r-v2')!
    expect(v2.v).toBe(EXECUTION_RECORDS_VERSION)
    expect(v2.traceId).toBe('tr-1')
    expect(v2.retryCount).toBe(2)
    expect(v2.approvalId).toBe('ap-1')
    const v1 = recs.find((r) => r.runId === 'r-v1')!
    expect(v1.v).toBe(1)
    expect(v1.traceId).toBeUndefined() // 缺字段=未知，不炸不猜
  })
})

describe('executionJoin（W3 单点归并）', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'exec-join-'))
    process.env.EXECUTION_RECORDS_DIR = dir
    process.env.TOOL_EXEC_AUDIT_DIR = join(dir, 'audit')
    process.env.HERMES_ENFORCE_APPROVALS_DIR = join(dir, 'enf')
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    delete process.env.EXECUTION_RECORDS_DIR
    delete process.env.TOOL_EXEC_AUDIT_DIR
    delete process.env.HERMES_ENFORCE_APPROVALS_DIR
  })

  it('四源齐：记录/审计/批单按 runId 归并，resultContract 按 taskId fail-soft', async () => {
    appendExecutionRecord({ kind: 'coding-run', runId: 'run-1', taskId: 'task-1', outcome: 'success', startedAt: 1, traceId: 'tr-9' })
    // 审计行
    mkdirSync(join(dir, 'audit'), { recursive: true })
    writeFileSync(join(dir, 'audit', `tool-exec-${day}.jsonl`), JSON.stringify({
      ts: Date.now(), phase: 'pre', tool: 'read_file', runId: 'run-1',   // ts 须在查询窗口内
    }) + '\n')
    // 执法批单（W2 批记录形状：runId 挂单）
    mkdirSync(join(dir, 'enf'), { recursive: true })
    writeFileSync(join(dir, 'enf', 'enforce-approvals.json'), JSON.stringify({
      seq: 1,
      records: { 'enf:abc': { id: 'enf:abc', callHash: 'h', tool: 'terminal_exec', inputPreview: 'x', profileId: 'p', rule: 'r', risk: 'high', status: 'pending', createdAt: 5, runId: 'run-1' } },
    }))

    const r = await executionJoin({ runId: 'run-1', taskId: 'task-1' })
    expect(r.ok).toBe(true)
    expect(r.executionRecords.available).toBe(true)
    expect(r.executionRecords.entries![0].traceId).toBe('tr-9')
    expect(r.toolAudit.available).toBe(true)
    expect(r.enforceApprovals.available).toBe(true)
    expect(r.enforceApprovals.entries![0].id).toBe('enf:abc')
    // W2 未合入本分支 → resultContract fail-soft 缺席（不 500）
    expect(r.resultContract.available).toBe(false)
  })

  it('无匹配：各源 available:false 带 reason（不猜不炸）', async () => {
    const r = await executionJoin({ runId: 'run-none' })
    expect(r.ok).toBe(true)
    expect(r.executionRecords.available).toBe(false)
    expect(r.toolAudit.available).toBe(false)
    expect(r.enforceApprovals.available).toBe(false)
  })

  it('批单旧档无 runId：按 runId 查不到=如实呈现 unknown 面', async () => {
    mkdirSync(join(dir, 'enf'), { recursive: true })
    writeFileSync(join(dir, 'enf', 'enforce-approvals.json'), JSON.stringify({
      seq: 1,
      records: { 'enf:old': { id: 'enf:old', callHash: 'h', tool: 't', inputPreview: 'x', profileId: 'p', rule: 'r', risk: 'low', status: 'approved', createdAt: 1 } },
    }))
    const r = await executionJoin({ runId: 'run-x' })
    expect(r.enforceApprovals.available).toBe(false)
    expect(r.enforceApprovals.reason).toContain('旧档未记 runId')
  })
})
