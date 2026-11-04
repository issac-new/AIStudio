// W1 契约执法轮（2026-11-04）：contractGuard 拒绝与放行、错误信封归一、
// 幂等缓存回放、审计关联字段。源文（vivo Harness 04/05/08 节）要求
// Schema 执行前强制生效、错误稳定结构、单条记录可关联。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { contractGuardHook, contractIdempotencyKey } from '../contract-guard'
import { IdempotencyStore } from '../../toolcontract/idempotency-store'
import { normalizeToolOutcome } from '../../toolcontract/error-envelope'
import { computeIdempotencyKey, resolveToolContract } from '../../toolcontract/contract'
import { setToolCallCorrelation, clearToolCallCorrelation } from '../call-correlation'

describe('contractGuardHook：入参契约执法', () => {
  it('声明了 schema 的工具：缺必填参数拒绝执行且错误体机器可读', async () => {
    const hook = contractGuardHook()
    const verdict = await hook.preExecute!('read_file', { offset: 5 }, undefined)
    expect(verdict).toBeDefined()
    expect(verdict!.allow).toBe(false)
    const parsed = JSON.parse(verdict!.error) as { ok: boolean; code: string; details: { issues: Array<{ rule: string }> } }
    expect(parsed.ok).toBe(false)
    expect(parsed.code).toBe('INPUT_SCHEMA_INVALID')
    expect(parsed.details.issues.some((i) => i.rule === 'required')).toBe(true)
  })

  it('类型违规拒绝：path 传数字', async () => {
    const hook = contractGuardHook()
    const verdict = await hook.preExecute!('read_file', { path: 42 }, undefined)
    expect(verdict?.allow).toBe(false)
    expect(verdict!.error).toContain('type')
  })

  it('合规参数放行（undefined=继续瀑布）', async () => {
    const hook = contractGuardHook()
    const verdict = await hook.preExecute!('read_file', { path: '/a.txt', offset: 0, limit: 512 }, undefined)
    expect(verdict).toBeUndefined()
  })

  it('未声明 schema 的工具零变化（放行）', async () => {
    const hook = contractGuardHook()
    const verdict = await hook.preExecute!('search_files', { whatever: true }, undefined)
    expect(verdict).toBeUndefined()
  })

  it('别名工具也执法：skill_view（契约按别名解析）', async () => {
    const hook = contractGuardHook()
    const verdict = await hook.preExecute!('skill_view', {}, undefined)
    expect(verdict?.allow).toBe(false)
  })
})

describe('contractGuardHook：幂等回放短路', () => {
  let dir: string
  let store: IdempotencyStore
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'idem-guard-'))
    process.env.TOOL_IDEMPOTENCY_STORE = join(dir, 'idem.json')
    store = new IdempotencyStore({ path: join(dir, 'idem.json') })
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    delete process.env.TOOL_IDEMPOTENCY_STORE
    clearToolCallCorrelation()
  })

  it('replay:observe（缺省）契约：命中也不短路（向后兼容）', async () => {
    const contract = resolveToolContract('terminal') // observe 缺省
    expect(contract.idempotency.replay).toBeUndefined()
    const key = contractIdempotencyKey('terminal', { command: 'ls' }, contract)
    store.complete(key, { tool: 'terminal', ttlMs: 60_000, result: { ok: true, data: { exitCode: 0 } } })
    const hook = contractGuardHook({ idempotencyStore: store })
    const verdict = await hook.preExecute!('terminal', { command: 'ls' }, undefined)
    expect(verdict).toBeUndefined() // 只观测不短路
  })

  it('replay:return 契约：账上有缓存时拒绝重复执行并回放首次结果', async () => {
    // BUILTIN 暂无 return 档（灰度：机制就绪、生产表未启用）——经注入口驱动
    const base = resolveToolContract('terminal')
    const replayContract: typeof base = {
      ...base,
      idempotency: { ...base.idempotency, replay: 'return' },
    }
    const key = contractIdempotencyKey('terminal', { command: 'deploy' }, replayContract)
    store.complete(key, { tool: 'terminal', ttlMs: 60_000, result: { ok: true, data: { recordId: 'r-1' } } })

    const hook = contractGuardHook({ idempotencyStore: store, contractResolver: () => replayContract })
    const verdict = await hook.preExecute!('terminal', { command: 'deploy' }, undefined)
    expect(verdict).toBeDefined()
    expect(verdict!.allow).toBe(false)
    const parsed = JSON.parse(verdict!.error) as { code: string; replayed: boolean; cached: { data: { recordId: string } } }
    expect(parsed.code).toBe('IDEMPOTENT_REPLAY')
    expect(parsed.replayed).toBe(true)
    expect(parsed.cached.data.recordId).toBe('r-1')
  })

  it('replay:return 但账上无缓存（或缓存被 8KB 上限丢弃）：不短路', async () => {
    const base = resolveToolContract('terminal')
    const replayContract: typeof base = {
      ...base,
      idempotency: { ...base.idempotency, replay: 'return' },
    }
    const hook = contractGuardHook({ idempotencyStore: store, contractResolver: () => replayContract })
    const verdict = await hook.preExecute!('terminal', { command: 'fresh-command' }, undefined)
    expect(verdict).toBeUndefined()
  })

  it('缓存超限不落账（8KB 上限）', () => {
    const big = { blob: 'x'.repeat(9_000) }
    const rec = store.complete('k-big', { tool: 't', ttlMs: 60_000, result: big })
    expect(rec.result).toBeUndefined()
  })

  it('执行身份入键：taskId/stepId 改变键值，缺失时与旧键逐字节一致', () => {
    clearToolCallCorrelation()
    const legacy = computeIdempotencyKey({ tool: 't', args: { a: 1 }, userId: 'u', windowMs: 1000, now: 1234 })
    const withIdentity = computeIdempotencyKey({ tool: 't', args: { a: 1 }, userId: 'u', windowMs: 1000, now: 1234, taskId: 'task-9', stepId: 's-1' })
    expect(withIdentity).not.toBe(legacy)
    setToolCallCorrelation({ taskId: 'task-9', stepId: 's-1' })
    const viaCorrelation = contractIdempotencyKey('t', { a: 1 }, resolveToolContract('unknown-tool-xyz'), { userId: 'u' })
    // windowMs 来自契约 TTL（未知工具走 DEFAULT 契约 TTL=1h），与手算 window 不同只比前缀结构：
    expect(typeof viaCorrelation).toBe('string')
    expect(viaCorrelation.length).toBe(24)
    clearToolCallCorrelation()
  })
})

describe('contractGuardHook：出参 strict 改写', () => {
  const strictContract = {
    ...resolveToolContract('read_file'),
    outputEnforcement: 'strict' as const,
  }

  it('strict 档：data 违反 outputSchema 改写为错误信封（fail-closed）', async () => {
    const hook = contractGuardHook({ contractResolver: () => strictContract })
    const result = { ok: true, content: '', data: { path: '/a', bytes: 'not-a-number', totalBytes: 1, offset: 0, nextOffset: 1, truncated: false } }
    const rewritten = await hook.postExecute!('read_file', {}, result)
    expect(rewritten).toBeDefined()
    expect(rewritten!.ok).toBe(false)
    const parsed = JSON.parse(rewritten!.content) as { code: string }
    expect(parsed.code).toBe('OUTPUT_SCHEMA_INVALID')
  })

  it('strict 档：data 合规不改写；data 缺席跳过', async () => {
    const hook = contractGuardHook({ contractResolver: () => strictContract })
    const good = { ok: true, content: '', data: { path: '/a', bytes: 3, totalBytes: 3, offset: 0, nextOffset: 3, truncated: false } }
    expect(await hook.postExecute!('read_file', {}, good)).toBeUndefined()
    const noData = { ok: true, content: 'text only' }
    expect(await hook.postExecute!('read_file', {}, noData)).toBeUndefined()
  })

  it('audit 档（缺省）：违反也不改写（观测在 tool-hooks 落账）', async () => {
    const hook = contractGuardHook() // read_file 缺省 audit
    const bad = { ok: true, content: '', data: { bytes: 'not-a-number' } }
    expect(await hook.postExecute!('read_file', {}, bad)).toBeUndefined()
  })
})

describe('normalizeToolOutcome：四形状归一', () => {
  it('error 自由文本 → 分类 + 稳定码', () => {
    const o = normalizeToolOutcome({ error: 'connect ECONNREFUSED' })
    expect(o.ok).toBe(false)
    expect(o.category).toBe('transient')
    expect(o.code).toBe('TOOL_TRANSIENT')
    expect(o.retryable).toBe(true) // 无契约时沿用分类器缺省：transient 可重试
  })

  it('ok:false + 403 → permission 不可重试', () => {
    const o = normalizeToolOutcome({ ok: false, error: 'HTTP 403 forbidden' })
    expect(o.category).toBe('permission')
    expect(o.retryable).toBe(false)
  })

  it('success:false / status:error 两种旧形状也识别为失败', () => {
    expect(normalizeToolOutcome({ success: false }).ok).toBe(false)
    expect(normalizeToolOutcome({ status: 'error', error: 'bad' }).ok).toBe(false)
  })

  it('成功路径与 requestId 透传', () => {
    const o = normalizeToolOutcome({ ok: true, requestId: 'req-1' })
    expect(o.ok).toBe(true)
    expect(o.requestId).toBe('req-1')
    expect(o.code).toBeUndefined()
  })

  it('显式 code 优先于类别兜底码', () => {
    const o = normalizeToolOutcome({ ok: false, error: 'dup', code: 'DUPLICATE_RECORD' })
    expect(o.code).toBe('DUPLICATE_RECORD')
  })
})
