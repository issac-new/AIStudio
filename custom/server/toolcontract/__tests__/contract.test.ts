// toolcontract 域单测：契约解析、错误分类、退避、脱敏、幂等键、重复调用追踪
// （2026-10-18 Harness 可靠性轮）。
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  argDigest,
  CallSignatureTracker,
  classifyToolError,
  computeBackoffMs,
  computeIdempotencyKey,
  DEFAULT_CONTRACT,
  redactSensitive,
  resolveToolContract,
  stableStringify,
  summarizeArgs,
} from '../contract'
import { IdempotencyStore } from '../idempotency-store'

const cleanup: string[] = []
afterEach(() => {
  for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tmpStore(): { store: IdempotencyStore; path: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'toolcontract-'))
  cleanup.push(dir)
  const path = join(dir, 'idem.json')
  return { store: new IdempotencyStore({ path }), path, dir }
}

describe('resolveToolContract', () => {
  it('精确匹配优先于通配', () => {
    expect(resolveToolContract('read_file').sideEffect).toBe('read')
    expect(resolveToolContract('kanban_create').sideEffect).toBe('external')
  })

  it('同前缀取最长通配', () => {
    // browser_* 与 desktop_* 都是通配；browser_click 只命中前者
    expect(resolveToolContract('browser_click').match).toBe('browser_*')
    expect(resolveToolContract('desktop_preview').match).toBe('desktop_*')
  })

  it('未声明工具落兜底：外部副作用且不重试', () => {
    const c = resolveToolContract('mystery_tool')
    expect(c).toBe(DEFAULT_CONTRACT)
    expect(c.retry.maxAttempts).toBe(0)
    expect(c.idempotency.mode).toBe('key')
  })

  it('空名落兜底', () => {
    expect(resolveToolContract('').match).toBe('*')
  })
})

describe('classifyToolError', () => {
  const contract = resolveToolContract('read_file')

  it('按 HTTP 状态码分类', () => {
    expect(classifyToolError({ status: 429, message: 'x' }).category).toBe('rate_limit')
    expect(classifyToolError({ status: 401 }).category).toBe('auth')
    expect(classifyToolError({ status: 403 }).category).toBe('permission')
    expect(classifyToolError({ status: 404 }).category).toBe('not_found')
    expect(classifyToolError({ status: 422 }).category).toBe('validation')
    expect(classifyToolError({ status: 503 }).category).toBe('transient')
  })

  it('按错误文本分类（SDK 没有状态码时）', () => {
    expect(classifyToolError(new Error('request timed out')).category).toBe('transient')
    expect(classifyToolError(new Error('ECONNRESET')).category).toBe('transient')
    expect(classifyToolError(new Error('permission denied by policy')).category).toBe('permission')
    expect(classifyToolError(new Error('no such file or directory ENOENT')).category).toBe('not_found')
    expect(classifyToolError(new Error('invalid argument: path')).category).toBe('validation')
    expect(classifyToolError(new Error('boom')).category).toBe('unknown')
  })

  it('权限/认证/校验类不可重试，瞬时/限流可重试', () => {
    expect(classifyToolError({ status: 403 }, contract).retryable).toBe(false)
    expect(classifyToolError({ status: 401 }, contract).retryable).toBe(false)
    expect(classifyToolError({ status: 422 }, contract).retryable).toBe(false)
    expect(classifyToolError({ status: 429 }, contract).retryable).toBe(true)
    expect(classifyToolError({ status: 502 }, contract).retryable).toBe(true)
  })

  it('外部副作用工具最多一次重试', () => {
    const term = resolveToolContract('terminal')
    expect(term.retry.maxAttempts).toBe(1)
    expect(classifyToolError({ status: 503 }, term).retryable).toBe(true)
    // 第二次重试由调用方按 maxAttempts 截断，分类层只回答“这一类可不可重试”
  })

  it('读取 Retry-After（秒/毫秒/HTTP 日期）', () => {
    const now = Date.parse('2026-10-18T00:00:00Z')
    expect(classifyToolError({ retryAfter: 12 }, undefined, now).retryAfterMs).toBe(12_000)
    expect(classifyToolError({ retryAfterMs: 3456 }, undefined, now).retryAfterMs).toBe(3456)
    expect(classifyToolError({ 'retry-after': '5' }, undefined, now).retryAfterMs).toBe(5_000)
    const at = new Date(now + 7_000).toUTCString()
    expect(classifyToolError({ 'retry-after': at }, undefined, now).retryAfterMs).toBe(7_000)
  })
})

describe('computeBackoffMs', () => {
  const retry = { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 2_000, jitterRatio: 0, strategy: 'exponential' as const, retryOn: [] }

  it('指数增长', () => {
    expect(computeBackoffMs({ attempt: 1, retry })).toBe(100)
    expect(computeBackoffMs({ attempt: 2, retry })).toBe(200)
    expect(computeBackoffMs({ attempt: 3, retry })).toBe(400)
  })

  it('线性增长', () => {
    const linear = { ...retry, strategy: 'linear' as const }
    expect(computeBackoffMs({ attempt: 1, retry: linear })).toBe(100)
    expect(computeBackoffMs({ attempt: 3, retry: linear })).toBe(300)
  })

  it('抖动落在 ±比例内', () => {
    const jittered = { ...retry, jitterRatio: 0.5 }
    const low = computeBackoffMs({ attempt: 2, retry: jittered, random: () => 0 })
    const high = computeBackoffMs({ attempt: 2, retry: jittered, random: () => 1 })
    expect(low).toBe(100)
    expect(high).toBe(300)
  })

  it('Retry-After 优先且封顶', () => {
    expect(computeBackoffMs({ attempt: 1, retry, retryAfterMs: 1_500 })).toBe(1_500)
    expect(computeBackoffMs({ attempt: 1, retry, retryAfterMs: 60_000 })).toBe(2_000)
  })
})

describe('stableStringify / argDigest', () => {
  it('键序不影响指纹', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }))
    expect(argDigest({ b: 1, a: 2 })).toBe(argDigest({ a: 2, b: 1 }))
  })

  it('值变化会改变指纹', () => {
    expect(argDigest({ a: 1 })).not.toBe(argDigest({ a: 2 }))
  })

  it('深度/宽度有界，不因大对象爆栈', () => {
    let deep: Record<string, unknown> = { leaf: 1 }
    for (let i = 0; i < 20; i++) deep = { nested: deep }
    expect(stableStringify(deep)).toContain('"[depth]"')
  })

  it('redactSensitive：敏感值不进入指纹原文，但非敏感值仍可区分', () => {
    const a = redactSensitive({ path: '/a', apiKey: 'sk-1' })
    const b = redactSensitive({ path: '/b', apiKey: 'sk-1' })
    expect(JSON.stringify(a)).not.toContain('sk-1')
    expect(argDigest(a)).not.toBe(argDigest(b))
    // 仅密钥变化不影响指纹（避免低熵密钥哈希落盘）
    expect(argDigest(redactSensitive({ path: '/a', apiKey: 'sk-1' })))
      .toBe(argDigest(redactSensitive({ path: '/a', apiKey: 'sk-2' })))
  })
})

describe('summarizeArgs 脱敏', () => {
  it('默认只落键名与值形状，不落入参值', () => {
    const s = summarizeArgs({ path: '/tmp/a', command: 'rm -rf /secret', count: 2, nested: { a: 1, b: 2 } })
    expect(s.path).toBe('string(6)')
    expect(s.command).toBe('string(14)')
    expect(s.count).toBe('number')
    expect(s.nested).toBe('object(2)')
    expect(JSON.stringify(s)).not.toContain('/secret')
  })

  it('敏感键始终整体替换（即使开启值摘要）', () => {
    const s = summarizeArgs(
      { path: '/tmp/a', apiKey: 'sk-secret', authorization: 'Bearer x', cookie: 'a=b' },
      { includeValues: true },
    )
    expect(s.path).toBe('/tmp/a')
    expect(s.apiKey).toBe('***')
    expect(s.authorization).toBe('***')
    expect(s.cookie).toBe('***')
  })

  it('显式 includeValues 时嵌套对象与 redactKeys 生效', () => {
    const s = summarizeArgs(
      { nested: { password: 'p', keep: 'v' }, prompt: 'long text' },
      { redactKeys: ['prompt'], includeValues: true },
    )
    expect(s.nested).toEqual({ password: '***', keep: 'v' })
    expect(s.prompt).toBe('***')
  })

  it('长字符串截断', () => {
    const s = summarizeArgs({ body: 'x'.repeat(500) }, { maxChars: 50, includeValues: true })
    expect(String(s.body)).toHaveLength(51)
    expect(String(s.body).endsWith('…')).toBe(true)
  })
})

describe('computeIdempotencyKey', () => {
  const base = { tool: 'kanban_create', args: { title: 't' }, userId: 'u1', windowMs: 60_000, now: 1_000_000 }

  it('同窗口同用户同参数稳定', () => {
    expect(computeIdempotencyKey(base)).toBe(computeIdempotencyKey({ ...base }))
  })

  it('用户/工具/参数/窗口任一变化都换键', () => {
    const key = computeIdempotencyKey(base)
    expect(computeIdempotencyKey({ ...base, userId: 'u2' })).not.toBe(key)
    expect(computeIdempotencyKey({ ...base, tool: 'kanban_comment' })).not.toBe(key)
    expect(computeIdempotencyKey({ ...base, args: { title: 't2' } })).not.toBe(key)
    expect(computeIdempotencyKey({ ...base, now: 1_000_000 + 60_000 })).not.toBe(key)
  })

  it('keyFields 只取声明字段', () => {
    const a = computeIdempotencyKey({ ...base, keyFields: ['title'], args: { title: 't', noise: 1 } })
    const b = computeIdempotencyKey({ ...base, keyFields: ['title'], args: { title: 't', noise: 2 } })
    expect(a).toBe(b)
  })
})

describe('CallSignatureTracker', () => {
  it('连续相同签名达到阈值判重复，且只首次告警', () => {
    const t = new CallSignatureTracker({ threshold: 3 })
    expect(t.observe('run1', 'read_file', { path: 'a' }).duplicate).toBe(false)
    expect(t.observe('run1', 'read_file', { path: 'a' }).duplicate).toBe(false)
    const third = t.observe('run1', 'read_file', { path: 'a' })
    expect(third).toMatchObject({ streak: 3, duplicate: true, firstDuplicate: true })
    const fourth = t.observe('run1', 'read_file', { path: 'a' })
    expect(fourth).toMatchObject({ streak: 4, duplicate: true, firstDuplicate: false })
  })

  it('不同调用打断连续计数', () => {
    const t = new CallSignatureTracker({ threshold: 3 })
    t.observe('run1', 'read_file', { path: 'a' })
    t.observe('run1', 'read_file', { path: 'a' })
    expect(t.observe('run1', 'read_file', { path: 'b' }).streak).toBe(1)
    expect(t.observe('run1', 'read_file', { path: 'a' }).streak).toBe(1)
  })

  it('scope 隔离：不同会话互不影响', () => {
    const t = new CallSignatureTracker({ threshold: 2 })
    t.observe('run1', 'read_file', { path: 'a' })
    expect(t.observe('run2', 'read_file', { path: 'a' }).duplicate).toBe(false)
    expect(t.observe('run1', 'read_file', { path: 'a' }).duplicate).toBe(true)
  })

  it('超过窗口重新开始计数', () => {
    let now = 1_000
    const t = new CallSignatureTracker({ threshold: 2, windowMs: 1_000, now: () => now })
    t.observe('run1', 'read_file', { path: 'a' })
    now += 2_000
    expect(t.observe('run1', 'read_file', { path: 'a' }).streak).toBe(1)
  })
})

describe('IdempotencyStore', () => {
  it('首次查不到，落键后可查且命中计数递增', () => {
    const { store } = tmpStore()
    expect(store.lookup('k1')).toBeNull()
    store.complete('k1', { tool: 'kanban_create', ttlMs: 60_000, resultDigest: 'r1' })
    expect(store.lookup('k1')).toMatchObject({ tool: 'kanban_create', count: 2, resultDigest: 'r1' })
    expect(store.lookup('k1')?.count).toBe(3)
  })

  it('TTL 过期后查不到并清理', () => {
    let now = 1_000
    const dir = mkdtempSync(join(tmpdir(), 'toolcontract-'))
    cleanup.push(dir)
    const timed = new IdempotencyStore({ path: join(dir, 'idem.json'), now: () => now })
    timed.complete('k1', { tool: 't', ttlMs: 5_000 })
    now += 6_000
    expect(timed.lookup('k1')).toBeNull()
    expect(timed.size()).toBe(0)
  })

  it('快照可重载（跨进程语义）', () => {
    const { store, path } = tmpStore()
    store.complete('k1', { tool: 'kanban_create', ttlMs: 60_000, resultDigest: 'r1' })
    const reloaded = new IdempotencyStore({ path })
    expect(reloaded.lookup('k1')?.resultDigest).toBe('r1')
  })

  it('超上限按 lastAt 淘汰最旧记录', () => {
    let now = 1_000
    const dir = mkdtempSync(join(tmpdir(), 'toolcontract-'))
    cleanup.push(dir)
    const store = new IdempotencyStore({ path: join(dir, 'idem.json'), maxRecords: 10, now: () => now })
    for (let i = 0; i < 15; i++) {
      now += 10
      store.complete(`k${i}`, { tool: 't', ttlMs: 60_000 })
    }
    expect(store.size()).toBe(10)
    expect(store.lookup('k0')).toBeNull()
    expect(store.lookup('k14')).not.toBeNull()
  })
})
