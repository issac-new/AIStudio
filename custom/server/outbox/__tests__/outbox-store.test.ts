// 发件箱存储守门（Always-on Agents 吸收 P2）：校验/dedupeKey 幂等/排序/退避/环形/统计。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  enqueueOutbox, listOutbox, loadOutbox, nextAttemptState, outboxPath, outboxStats, pendingDue,
  type OutboxMessage,
} from '../outbox-store'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'outbox-'))
  process.env.OUTBOX_PATH = join(dir, 'outbox.json')
})
afterEach(() => {
  delete process.env.OUTBOX_PATH
  rmSync(dir, { recursive: true, force: true })
})

const base = {
  recipient: { kind: 'member' as const, name: 'owner' },
  body: 'hello', source: 'test',
}

describe('入队校验与幂等', () => {
  it('缺 recipient/body/source 拒绝；词表外 channel/priority 拒绝', () => {
    expect(enqueueOutbox({ ...base, body: '' }).enqueued).toBe(false)
    expect(enqueueOutbox({ ...base, source: '' }).enqueued).toBe(false)
    expect(enqueueOutbox({ ...base, channel: 'sms' as never }).enqueued).toBe(false)
    expect(enqueueOutbox({ ...base, priority: 'urgent' as never }).enqueued).toBe(false)
    expect(loadOutbox()).toHaveLength(0)
  })

  it('dedupeKey 在 TTL 内幂等；6h 后可再入队', () => {
    const now = 1_000_000
    expect(enqueueOutbox({ ...base, dedupeKey: 'k1', at: now }).enqueued).toBe(true)
    const dup = enqueueOutbox({ ...base, dedupeKey: 'k1', at: now + 1000 })
    expect(dup.enqueued).toBe(false)
    expect(dup.reason).toBe('duplicate')
    expect(enqueueOutbox({ ...base, dedupeKey: 'k1', at: now + 6 * 3_600_000 + 1 }).enqueued).toBe(true)
  })

  it('环形 500 条', () => {
    for (let i = 0; i < 505; i += 1) enqueueOutbox({ ...base, body: `m${i}`, at: 1 + i })
    expect(loadOutbox()).toHaveLength(500)
    const lines = JSON.parse(readFileSync(outboxPath(), 'utf8')) as OutboxMessage[]
    expect(lines[lines.length - 1].body).toBe('m504')
  })
})

describe('到期候选与退避', () => {
  it('pendingDue 按 critical→high→normal 再按入队序；notBefore 未到不取', () => {
    const now = 10_000
    enqueueOutbox({ ...base, body: 'n1', at: 1 })
    enqueueOutbox({ ...base, body: 'c1', priority: 'critical', at: 2 })
    enqueueOutbox({ ...base, body: 'h1', priority: 'high', at: 3 })
    enqueueOutbox({ ...base, body: 'future', notBefore: now + 1000, at: 4 })
    expect(pendingDue(now).map((m) => m.body)).toEqual(['c1', 'h1', 'n1'])
    expect(pendingDue(now + 2000).map((m) => m.body)).toContain('future')
  })

  it('失败退避 30s→120s→failed（三次转死信）', () => {
    const m: OutboxMessage = {
      id: 'x', recipient: { kind: 'member', name: 'o' }, channel: 'inbox', body: 'b',
      priority: 'normal', source: 't', status: 'pending', attempts: 0, createdAt: 0,
    }
    const a1 = nextAttemptState(m, 1000, 'boom')
    expect(a1.status).toBe('pending')
    expect(a1.notBefore).toBe(31_000)
    const a2 = nextAttemptState(a1, 2000, 'boom')
    expect(a2.status).toBe('pending')
    expect(a2.notBefore).toBe(122_000)
    const a3 = nextAttemptState(a2, 3000, 'boom')
    expect(a3.status).toBe('failed')
    expect(a3.attempts).toBe(3)
  })
})

describe('读数', () => {
  it('stats 分布与最老 pending 年龄', () => {
    enqueueOutbox({ ...base, at: 1000 })
    enqueueOutbox({ ...base, at: 2000, channel: 'matrix' })
    const s = outboxStats(5000)
    expect(s.total).toBe(2)
    expect(s.byStatus.pending).toBe(2)
    expect(s.byChannel).toEqual({ inbox: 1, matrix: 1 })
    expect(s.pendingOldestAgeMs).toBe(4000)
    expect(listOutbox({ channel: 'matrix' })).toHaveLength(1)
  })
})
