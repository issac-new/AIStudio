import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IdempotencyStore, sharedIdempotencyStore, _resetSharedIdempotencyStoreForTests } from '../idempotency-store'

let dir: string
let path: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'idem-status-'))
  path = join(dir, 'idem.json')
  _resetSharedIdempotencyStoreForTests()
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  _resetSharedIdempotencyStoreForTests()
})

describe('幂等账本三态（handbook 吸收）', () => {
  it('intent→sent→confirmed 全链，未结算可查询', () => {
    let now = 1_000
    const store = new IdempotencyStore({ path, now: () => now })
    const key = 'k1'
    const first = store.beginIntent(key, { tool: 'refund', ttlMs: 60_000 })
    expect(first.reused).toBe(false)
    expect(first.record).toMatchObject({ status: 'intended', attempts: 1 })
    expect(store.unsettled()).toHaveLength(1)

    now += 10
    const sent = store.markSent(key, { tool: 'refund', ttlMs: 60_000, externalRef: 'refund-1' })
    expect(sent).toMatchObject({ status: 'sent', externalRef: 'refund-1' })
    expect(store.unsettled()).toHaveLength(1)

    now += 10
    const confirmed = store.confirm(key, { tool: 'refund', ttlMs: 60_000, resultDigest: 'sha', externalRef: 'refund-1' })
    expect(confirmed.status).toBe('confirmed')
    expect(confirmed.settledAt).toBe(now)
    expect(store.unsettled()).toHaveLength(0)
  })

  it('已 sent/confirmed 不被 beginIntent 降级；failed 允许重试累加', () => {
    let now = 1_000
    const store = new IdempotencyStore({ path, now: () => now })
    const key = 'k2'
    store.markSent(key, { tool: 'refund', ttlMs: 60_000 })
    const reused = store.beginIntent(key, { tool: 'refund', ttlMs: 60_000 })
    expect(reused.reused).toBe(true)
    expect(reused.record.status).toBe('sent')

    store.confirm(key, { tool: 'refund', ttlMs: 60_000 })
    expect(store.beginIntent(key, { tool: 'refund', ttlMs: 60_000 }).reused).toBe(true)

    const key3 = 'k3'
    store.beginIntent(key3, { tool: 'refund', ttlMs: 60_000 })
    store.fail(key3, { tool: 'refund', errorClass: 'transient' })
    const retry = store.beginIntent(key3, { tool: 'refund', ttlMs: 60_000 })
    expect(retry.reused).toBe(false)
    expect(retry.record).toMatchObject({ status: 'intended', attempts: 2 })
  })

  it('complete 保留旧语义=confirmed；blocked 不计入未结算', () => {
    const store = new IdempotencyStore({ path, now: () => 1_000 })
    const rec = store.complete('legacy', { tool: 'x', ttlMs: 60_000, resultDigest: 'd' })
    expect(rec.status).toBe('confirmed')
    expect(store.unsettled()).toHaveLength(0)
    store.blocked('b1', { tool: 'x' })
    expect(store.unsettled()).toHaveLength(0)
  })

  it('共享单例：同进程两次取到同一实例；重置后新建', () => {
    process.env.TOOL_IDEMPOTENCY_STORE = path
    const a = sharedIdempotencyStore()
    const b = sharedIdempotencyStore()
    expect(a).toBe(b)
    _resetSharedIdempotencyStoreForTests()
    expect(sharedIdempotencyStore()).not.toBe(a)
    delete process.env.TOOL_IDEMPOTENCY_STORE
  })
})
