// W1 执法轮：审计行关联字段（traceId/taskId/stepId/...经 call-correlation 透传）
// 与出参契约观测（OUTPUT_SCHEMA_INVALID 落 errorCode，不改写结果）。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('W1 审计关联字段与出参观测', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'audit-w1-'))
    process.env.TOOL_EXEC_AUDIT_DIR = dir
    process.env.TOOL_IDEMPOTENCY_STORE = join(dir, 'idem.json')
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    delete process.env.TOOL_EXEC_AUDIT_DIR
    delete process.env.TOOL_IDEMPOTENCY_STORE
  })

  it('关联上下文设置后 pre/post 审计行携带 traceId/taskId/stepId/workflowVersion', async () => {
    const { ekkoToolExecuteHooks, readToolExecAudit, _resetAuditStateForTests } = await import('../tool-hooks')
    const { setToolCallCorrelation, clearToolCallCorrelation } = await import('../call-correlation')
    _resetAuditStateForTests()
    setToolCallCorrelation({
      traceId: 'tr-1', taskId: 'task-7', stepId: 'step-2',
      workflowVersion: 'graph@1.3.0', promptVersion: 'p-9', retryCount: 1, approvalId: 'ap-3',
    })
    try {
      const audit = ekkoToolExecuteHooks[0]!
      await audit.preExecute!('search_files', { q: 'x' })
      await audit.postExecute!('search_files', { q: 'x' }, { ok: true })
      const entries = readToolExecAudit()
      expect(entries).toHaveLength(2)
      for (const e of entries) {
        expect(e.traceId).toBe('tr-1')
        expect(e.taskId).toBe('task-7')
        expect(e.stepId).toBe('step-2')
        expect(e.workflowVersion).toBe('graph@1.3.0')
        expect(e.promptVersion).toBe('p-9')
        expect(e.retryCount).toBe(1)
        expect(e.approvalId).toBe('ap-3')
      }
    } finally {
      clearToolCallCorrelation()
      _resetAuditStateForTests()
    }
  })

  it('未设关联时字段缺省（旧账本形状兼容）', async () => {
    const { ekkoToolExecuteHooks, readToolExecAudit, _resetAuditStateForTests } = await import('../tool-hooks')
    const { clearToolCallCorrelation } = await import('../call-correlation')
    clearToolCallCorrelation()
    _resetAuditStateForTests()
    const audit = ekkoToolExecuteHooks[0]!
    await audit.preExecute!('search_files', { q: 'x' })
    await audit.postExecute!('search_files', { q: 'x' }, { ok: true })
    const [pre, post] = readToolExecAudit()
    expect(pre.traceId).toBeUndefined()
    expect(post.taskId).toBeUndefined()
    _resetAuditStateForTests()
  })

  it('出参契约观测：read_file 结果 data 违规时 post 落 errorCode=OUTPUT_SCHEMA_INVALID 且 errorCategory=validation（不改写）', async () => {
    const { ekkoToolExecuteHooks, readToolExecAudit, _resetAuditStateForTests } = await import('../tool-hooks')
    _resetAuditStateForTests()
    const audit = ekkoToolExecuteHooks[0]!
    await audit.preExecute!('read_file', { path: '/a' })
    await audit.postExecute!('read_file', { path: '/a' }, {
      ok: true,
      data: { path: '/a', bytes: 'not-a-number', totalBytes: 1, offset: 0, nextOffset: 1, truncated: false },
    })
    const entries = readToolExecAudit()
    const post = entries.find((e) => e.phase === 'post')!
    expect(post.ok).toBe(true) // 不改写结局（audit 档）
    expect(post.errorCode).toBe('OUTPUT_SCHEMA_INVALID')
    expect(post.errorCategory).toBe('validation')
    expect(post.retryable).toBe(false)
    _resetAuditStateForTests()
  })

  it('失败调用落统一 errorCode（类别兜底码）', async () => {
    const { ekkoToolExecuteHooks, readToolExecAudit, _resetAuditStateForTests } = await import('../tool-hooks')
    _resetAuditStateForTests()
    const audit = ekkoToolExecuteHooks[0]!
    await audit.preExecute!('browser_click', { x: 1 })
    await audit.postExecute!('browser_click', { x: 1 }, { error: 'HTTP 403 forbidden' })
    const post = readToolExecAudit().find((e) => e.phase === 'post')!
    expect(post.errorCode).toBe('TOOL_PERMISSION')
    expect(post.errorCategory).toBe('permission')
    _resetAuditStateForTests()
  })

  it('成功且合规：无 errorCode 字段', async () => {
    const { ekkoToolExecuteHooks, readToolExecAudit, _resetAuditStateForTests } = await import('../tool-hooks')
    _resetAuditStateForTests()
    const audit = ekkoToolExecuteHooks[0]!
    await audit.preExecute!('read_file', { path: '/a' })
    await audit.postExecute!('read_file', { path: '/a' }, {
      ok: true,
      data: { path: '/a', bytes: 3, totalBytes: 3, offset: 0, nextOffset: 3, truncated: false },
    })
    const post = readToolExecAudit().find((e) => e.phase === 'post')!
    expect(post.errorCode).toBeUndefined()
    _resetAuditStateForTests()
  })
})
