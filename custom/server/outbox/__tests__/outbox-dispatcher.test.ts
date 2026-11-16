// 发件箱派发守门（Always-on Agents 吸收 P2）：安静时段/预算/合并/重试/收口账本。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dispatchDue, inQuietHours, mergeBodies } from '../outbox-dispatcher'
import { enqueueOutbox, loadOutbox } from '../outbox-store'
import { loadInbox } from '../../inbox/inbox-store'
import { readRunOutcomes } from '../../notify/run-outcome'
import { DEFAULT_ATTENTION_PREFS, type AttentionPrefs } from '../../proactivity/intervention-governor'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'outbox-dispatch-'))
  process.env.OUTBOX_PATH = join(dir, 'outbox.json')
  process.env.HERMES_INBOX_DIR = join(dir, 'inbox')
  process.env.RUN_OUTCOME_LEDGER_PATH = join(dir, 'run-outcomes.jsonl')
  process.env.ATTENTION_PREFS_PATH = join(dir, 'attention.json')
  delete process.env.OUTBOX_MATRIX_ROOM
  delete process.env.MATRIX_HOMESERVER_URL
  delete process.env.MATRIX_ACCESS_TOKEN
  delete process.env.MATRIX_USER_ID
})
afterEach(() => {
  for (const k of ['OUTBOX_PATH', 'HERMES_INBOX_DIR', 'RUN_OUTCOME_LEDGER_PATH', 'ATTENTION_PREFS_PATH']) delete process.env[k]
  rmSync(dir, { recursive: true, force: true })
})

/** 本地时区某日 h:30（安静时段判定按本地小时）。 */
const at = (h: number) => new Date(2026, 0, 15, h, 30, 0).getTime()
const prefs = (over: Partial<AttentionPrefs> = {}): AttentionPrefs => ({ ...DEFAULT_ATTENTION_PREFS, ...over })

describe('纯函数', () => {
  it('安静时段含跨午夜', () => {
    expect(inQuietHours(23, 22, 8)).toBe(true)
    expect(inQuietHours(7, 22, 8)).toBe(true)
    expect(inQuietHours(8, 22, 8)).toBe(false)
    expect(inQuietHours(12, 22, 8)).toBe(false)
    expect(inQuietHours(12, 9, 17)).toBe(true)
    expect(inQuietHours(17, 9, 17)).toBe(false)
    expect(inQuietHours(5, 0, 0)).toBe(false)
  })

  it('合并正文：≤10 条截断并注明余量', () => {
    const msgs = Array.from({ length: 12 }, (_, i) => ({
      id: `m${i}`, recipient: { kind: 'member' as const, name: 'o' }, channel: 'inbox' as const,
      body: `body${i}`, priority: 'normal' as const, source: 't', status: 'pending' as const,
      attempts: 0, createdAt: i,
    }))
    const body = mergeBodies(msgs)
    expect(body).toContain('12 条更新')
    expect(body).toContain('另有 2 条')
    expect(body).toContain('body0')
    expect(body).not.toContain('body11')
  })
})

describe('派发主链', () => {
  it('正常时段：两条入队→各投递到 inbox，收口账记为 outbox/delivered', async () => {
    const now = at(15)
    enqueueOutbox({ recipient: { kind: 'member', name: 'owner' }, body: 'a', source: 'test', at: now })
    enqueueOutbox({ recipient: { kind: 'member', name: 'owner' }, body: 'b', source: 'test', at: now + 1 })
    const r = await dispatchDue({ now, prefs: prefs() })
    expect(r.delivered).toBe(2)
    expect(rFailed(r)).toBe(0)
    const inbox = loadInbox('member', 'owner')
    expect(inbox).toHaveLength(2)
    expect(inbox.every((i) => i.type === 'proactive_notice')).toBe(true)
    const outcomes = readRunOutcomes({ outcome: 'outbox' })
    expect(outcomes.records).toHaveLength(2)
    expect(outcomes.records.every((x) => x.reasonCode === 'delivered')).toBe(true)
  })

  it('同 mergeKey 的 normal 消息合并为一条 digest', async () => {
    const now = at(15)
    enqueueOutbox({ recipient: { kind: 'member', name: 'owner' }, body: 'x', source: 'proactivity', mergeKey: 'pro', at: now })
    enqueueOutbox({ recipient: { kind: 'member', name: 'owner' }, body: 'y', source: 'proactivity', mergeKey: 'pro', at: now + 1 })
    const r = await dispatchDue({ now, prefs: prefs() })
    expect(r.delivered).toBe(1)
    expect(r.merged).toBe(1)
    const inbox = loadInbox('member', 'owner')
    expect(inbox).toHaveLength(1)
    expect(inbox[0].body).toContain('2 条更新')
    const all = loadOutbox()
    expect(all.filter((m) => m.status === 'delivered')).toHaveLength(2)
    expect(all.some((m) => m.mergedInto)).toBe(true)
  })

  it('安静时段：normal 延后并落 deferred/quiet-hours；critical 直通', async () => {
    const now = at(23)
    enqueueOutbox({ recipient: { kind: 'member', name: 'owner' }, body: 'night', source: 'test', at: now })
    enqueueOutbox({ recipient: { kind: 'member', name: 'owner' }, body: 'urgent', source: 'test', priority: 'critical', at: now + 1 })
    const r = await dispatchDue({ now, prefs: prefs() })
    expect(r.deferred).toBe(1)
    expect(r.delivered).toBe(1)
    const night = loadOutbox().find((m) => m.body === 'night')!
    expect(night.status).toBe('pending')
    expect(night.notBefore!).toBeGreaterThan(now)
    const inbox = loadInbox('member', 'owner')
    expect(inbox.map((i) => i.body)).toEqual(['urgent'])
    const deferred = readRunOutcomes({ outcome: 'deferred' })
    expect(deferred.records.some((x) => x.reasonCode === 'quiet-hours')).toBe(true)
  })

  it('日预算触顶：normal 延后 1h；critical 豁免', async () => {
    const now = at(15)
    enqueueOutbox({ recipient: { kind: 'member', name: 'owner' }, body: 'n', source: 'test', at: now })
    enqueueOutbox({ recipient: { kind: 'member', name: 'owner' }, body: 'c', source: 'test', priority: 'critical', at: now + 1 })
    const r = await dispatchDue({ now, prefs: prefs({ dailyBudget: 0 }) })
    expect(r.deferred).toBe(1)
    expect(r.delivered).toBe(1)
    const n = loadOutbox().find((m) => m.body === 'n')!
    expect(n.notBefore).toBe(now + 3_600_000)
    expect(readRunOutcomes({ outcome: 'deferred' }).records.some((x) => x.reasonCode === 'budget-capped')).toBe(true)
  })

  it('matrix 未配置：失败退避，三次后转 failed 死信', async () => {
    const now = at(15)
    enqueueOutbox({ recipient: { kind: 'member', name: 'owner' }, body: 'm', source: 'test', channel: 'matrix', at: now })
    const r1 = await dispatchDue({ now, prefs: prefs() })
    expect(rFailed(r1)).toBe(1)
    expect(loadOutbox()[0]).toMatchObject({ status: 'pending', attempts: 1, notBefore: now + 30_000 })
    await dispatchDue({ now: now + 30_001, prefs: prefs() })
    expect(loadOutbox()[0]).toMatchObject({ status: 'pending', attempts: 2 })
    await dispatchDue({ now: now + 200_000, prefs: prefs() })
    expect(loadOutbox()[0].status).toBe('failed')
    // 死信留档，不再进入候选。
    await dispatchDue({ now: now + 500_000, prefs: prefs() })
    expect(loadOutbox()[0].attempts).toBe(3)
  })
})

/** DispatchResult.failed 在重试场景计为「本轮失败」，与终态 failed 区分。 */
function rFailed(r: { failed: number }): number {
  return r.failed
}
