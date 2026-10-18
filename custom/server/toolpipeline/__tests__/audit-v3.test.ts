// tool-hooks v3（2026-10-18 Harness 可靠性轮）单测：耗时配对、错误分类、
// 重复调用标记、幂等键命中、查询面过滤与聚合。
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface HookShape {
  preExecute(name: string, input: Record<string, unknown>, context?: Record<string, string>): Promise<unknown>
  postExecute(name: string, input: Record<string, unknown>, result: { ok?: boolean; error?: string }, context?: Record<string, string>): Promise<unknown>
}

interface AuditEntryShape {
  ts: number
  phase: 'pre' | 'post'
  tool: string
  durationMs?: number
  errorCategory?: string
  retryable?: boolean
  duplicateStreak?: number
  duplicate?: boolean
  idempotencyHit?: boolean
  sessionId?: string
  argSummary?: Record<string, unknown>
}

interface AuditQueryResultShape {
  entries: AuditEntryShape[]
  total: number
  byTool: Array<{ tool: string; count: number; errors: number; avgDurationMs: number | null }>
  byOutcome: { ok: number; error: number; unknown: number }
}

interface LoadedHooks {
  hooks: HookShape[]
  readToolExecAudit(limit?: number): AuditEntryShape[]
  queryToolExecAudit(q?: Record<string, unknown>): AuditQueryResultShape
  reset(): void
}

const dirs: string[] = []

beforeEach(() => {
  vi.resetModules()
  const dir = mkdtempSync(join(tmpdir(), 'tool-audit-v3-'))
  dirs.push(dir)
  process.env.TOOL_EXEC_AUDIT_DIR = join(dir, 'audit')
  process.env.TOOL_IDEMPOTENCY_STORE = join(dir, 'idem.json')
})

afterEach(() => {
  delete process.env.TOOL_EXEC_AUDIT_DIR
  delete process.env.TOOL_IDEMPOTENCY_STORE
  delete process.env.TOOL_AUDIT_ARG_VALUES
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

async function loadHooks(): Promise<LoadedHooks> {
  const mod = await import('../tool-hooks')
  return {
    hooks: mod.ekkoToolExecuteHooks as unknown as HookShape[],
    readToolExecAudit: mod.readToolExecAudit as unknown as (limit?: number) => AuditEntryShape[],
    queryToolExecAudit: mod.queryToolExecAudit as unknown as (q?: Record<string, unknown>) => AuditQueryResultShape,
    reset: mod._resetAuditStateForTests,
  }
}

function auditHookOf(hooks: HookShape[]): HookShape {
  const hook = hooks[0]
  if (!hook) throw new Error('audit hook missing')
  return hook
}

describe('审计 v3：pre/post 配对与错误分类', () => {
  it('post 记录与 pre 配对的耗时，并按错误分类给出可重试性', async () => {
    const { hooks, readToolExecAudit, reset } = await loadHooks()
    reset()
    const hook = auditHookOf(hooks)
    await hook.preExecute('read_file', { path: '/tmp/a' }, { sessionId: 's1', userId: 'u1' })
    await new Promise((r) => setTimeout(r, 5))
    await hook.postExecute('read_file', { path: '/tmp/a' }, { ok: false, error: 'permission denied' }, { sessionId: 's1', userId: 'u1' })

    const entries = readToolExecAudit()
    const pre = entries.find((e) => e.phase === 'pre')
    const post = entries.find((e) => e.phase === 'post')
    expect(pre?.argSummary).toEqual({ path: 'string(6)' })
    expect(post).toMatchObject({ errorCategory: 'permission', retryable: false })
    expect(typeof post?.durationMs).toBe('number')
    expect(post?.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('瞬时错误标为可重试', async () => {
    const { hooks, readToolExecAudit } = await loadHooks()
    const hook = auditHookOf(hooks)
    await hook.preExecute('read_file', {}, { sessionId: 's2' })
    await hook.postExecute('read_file', {}, { ok: false, error: 'request timed out' }, { sessionId: 's2' })
    const post = readToolExecAudit().find((e) => e.phase === 'post')
    expect(post).toMatchObject({ errorCategory: 'transient', retryable: true })
  })

  it('连续相同调用达到 3 次标 duplicate，且只标记不阻断', async () => {
    const { hooks, readToolExecAudit, reset } = await loadHooks()
    reset()
    const hook = auditHookOf(hooks)
    for (let i = 0; i < 3; i++) {
      await hook.preExecute('read_file', { path: '/same' }, { runId: 'run-1' })
      await hook.postExecute('read_file', { path: '/same' }, { ok: true }, { runId: 'run-1' })
    }
    const pres = readToolExecAudit().filter((e) => e.phase === 'pre')
    expect(pres[0].duplicateStreak).toBe(1)
    expect(pres[1].duplicateStreak).toBe(2)
    expect(pres[2]).toMatchObject({ duplicateStreak: 3, duplicate: true })
  })

  it('外部副作用工具成功后落幂等键，下次同键命中', async () => {
    const { hooks, readToolExecAudit, reset } = await loadHooks()
    reset()
    const hook = auditHookOf(hooks)
    const args = { command: 'deploy', cwd: '/repo' }
    await hook.preExecute('terminal', args, { userId: 'u1', runId: 'r1' })
    await hook.postExecute('terminal', args, { ok: true }, { userId: 'u1', runId: 'r1' })
    await hook.preExecute('terminal', args, { userId: 'u1', runId: 'r1' })
    await hook.postExecute('terminal', args, { ok: true }, { userId: 'u1', runId: 'r1' })

    const pres = readToolExecAudit().filter((e) => e.phase === 'pre')
    expect(pres[0].idempotencyHit).toBeUndefined()
    expect(pres[1].idempotencyHit).toBe(true)
  })

  it('审计目录以 0700 创建', async () => {
    const { hooks, reset } = await loadHooks()
    reset()
    await auditHookOf(hooks).preExecute('read_file', {}, { sessionId: 's3' })
    const dir = process.env.TOOL_EXEC_AUDIT_DIR as string
    expect(existsSync(dir)).toBe(true)
    expect(statSync(dir).mode & 0o777).toBe(0o700)
  })
})

describe('queryToolExecAudit', () => {
  it('按工具/会话/结果过滤，并给出聚合', async () => {
    const { hooks, queryToolExecAudit, reset } = await loadHooks()
    reset()
    const hook = auditHookOf(hooks)
    await hook.preExecute('read_file', { path: '/a' }, { sessionId: 's1' })
    await hook.postExecute('read_file', { path: '/a' }, { ok: true }, { sessionId: 's1' })
    await hook.preExecute('terminal', { command: 'x' }, { sessionId: 's2' })
    await hook.postExecute('terminal', { command: 'x' }, { ok: false, error: '403 forbidden' }, { sessionId: 's2' })

    const all = queryToolExecAudit({ days: 7 })
    expect(all.total).toBe(4)
    expect(all.byOutcome).toEqual({ ok: 1, error: 1, unknown: 0 })
    expect(all.byTool.find((t) => t.tool === 'terminal')).toMatchObject({ count: 2, errors: 1 })

    const onlyErrors = queryToolExecAudit({ outcome: 'error' })
    expect(onlyErrors.total).toBe(1)
    expect(onlyErrors.entries[0].tool).toBe('terminal')

    const bySession = queryToolExecAudit({ sessionId: 's1' })
    expect(bySession.total).toBe(2)
    expect(bySession.entries.every((e) => e.sessionId === 's1')).toBe(true)
  })

  it('坏行与缺失目录 fail-soft 返回空账', async () => {
    const { queryToolExecAudit } = await loadHooks()
    const dir = process.env.TOOL_EXEC_AUDIT_DIR as string
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `tool-exec-${new Date().toISOString().slice(0, 10)}.jsonl`), 'not-json\n')
    expect(queryToolExecAudit({ days: 1 }).total).toBe(0)
  })
})
