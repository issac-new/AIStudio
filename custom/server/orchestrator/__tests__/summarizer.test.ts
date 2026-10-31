// custom/server/orchestrator/__tests__/summarizer.test.ts
// 汇总器五条规则（2026-10-31 C 批 spec §4.1）。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetOrchestratorForTests, insertDigest, listDigests, markDigestDelivered } from '../store'
import { insertTrigger, upsertThread } from '../store'
import { summarize } from '../summarizer'
import type { Trigger } from '../types'

let dir: string
let prevDb: string | undefined

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'orch-sum-'))
  prevDb = process.env.ORCHESTRATOR_DB
  process.env.ORCHESTRATOR_DB = join(dir, 'orch.sqlite')
  resetOrchestratorForTests()
})

afterEach(() => {
  resetOrchestratorForTests()
  if (prevDb === undefined) delete process.env.ORCHESTRATOR_DB
  else process.env.ORCHESTRATOR_DB = prevDb
  rmSync(dir, { recursive: true, force: true })
})

function trig(over: Partial<Trigger> & { externalId: string }): Trigger {
  return {
    id: `trg_${over.externalId}`,
    sourceId: 'kanban:default',
    sourceKind: 'kanban',
    threadKey: 'task:default:t-1',
    actor: 'kanban:test',
    addressed: true,
    payload: {},
    status: 'pending',
    receivedAt: 1000,
    ...over,
  }
}

describe('summarize', () => {
  it('终态事件保留任务标题', () => {
    const d = summarize('thr_1', 'worker:t-1', [
      trig({ externalId: 'a', payload: { kind: 'completed', taskId: 't-1' }, receivedAt: 1000 }),
    ])
    expect(d?.body).toContain('t-1 完成')
    expect(d?.eventCount).toBe(1)
  })

  it('纯列变更静默（返回 null）', () => {
    const d = summarize('thr_1', 'worker:t-1', [
      trig({ externalId: 'a', payload: { kind: 'column_transition', taskId: 't-1' }, receivedAt: 1000 }),
      trig({ externalId: 'b', payload: { kind: 'column_transition', taskId: 't-2' }, receivedAt: 1100 }),
    ])
    expect(d).toBeNull()
  })

  it('混合事件：终态列标题、列变更只给计数', () => {
    const d = summarize('thr_1', 'worker:t-1', [
      trig({ externalId: 'a', payload: { kind: 'column_transition', taskId: 't-1' }, receivedAt: 1000 }),
      trig({ externalId: 'b', payload: { kind: 'blocked', taskId: 't-2' }, receivedAt: 1100 }),
      trig({ externalId: 'c', payload: { kind: 'column_transition', taskId: 't-3' }, receivedAt: 1200 }),
    ])
    expect(d?.body).toContain('t-2 阻塞')
    expect(d?.body).toContain('另 2 条列变更')
    expect(d?.eventCount).toBe(3)
  })

  it('时间窗之外的事件被丢弃', () => {
    const d = summarize('thr_1', 'worker:t-1', [
      trig({ externalId: 'old', payload: { kind: 'completed', taskId: 't-old' }, receivedAt: 0 }),
      trig({ externalId: 'new', payload: { kind: 'blocked', taskId: 't-new' }, receivedAt: 10 * 60_000 }),
    ], { windowMs: 5 * 60_000 })
    expect(d?.body).toContain('t-new 阻塞')
    expect(d?.body).not.toContain('t-old')
    expect(d?.eventCount).toBe(1)
  })

  it('超出上限折叠为「等 N 项有结果」', () => {
    const events = Array.from({ length: 8 }, (_, i) => trig({
      externalId: `e-${i}`, payload: { kind: 'completed', taskId: `t-${i}` }, receivedAt: 1000 + i,
    }))
    const d = summarize('thr_1', 'worker:t-1', events, { maxListed: 3 })
    expect(d?.body).toContain('等 8 项有结果')
  })
})

describe('digest 持久化', () => {
  it('写入与投递标记幂等', () => {
    const t = upsertThread('kanban:default', 'task:default:t-1', 1000)
    const { trigger } = insertTrigger({
      sourceId: 'kanban:default', sourceKind: 'kanban', externalId: 'x-1',
      threadKey: t.threadKey, actor: 'kanban:test', addressed: true,
      payload: { kind: 'completed', taskId: 't-1' }, receivedAt: 1000,
    })
    const d = summarize(t.id, 'worker:t-1', [trigger], {})
    expect(d).not.toBeNull()
    insertDigest(d!)
    expect(listDigests(t.id).length).toBe(1)
    expect(markDigestDelivered(d!.id)).toBe(true)
    expect(markDigestDelivered(d!.id)).toBe(false)
    expect(listDigests(t.id)[0]!.delivered).toBe(true)
  })
})
