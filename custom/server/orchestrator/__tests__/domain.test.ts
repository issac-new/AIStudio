// custom/server/orchestrator/__tests__/domain.test.ts
// 编排域核心：存储幂等、归线程、订阅游标、摄入三态（2026-10-31 A+B 批 spec §5.1）。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getTrigger, insertTrigger, listThreads, listTriggers, resetOrchestratorForTests, setTriggerStatus,
} from '../store'
import { ingestTrigger } from '../ingest'
import { markRead, pendingFor, subscribe } from '../thread'
import { defaultCells, setAdmission } from '../admission'

let dir: string
let prevDb: string | undefined
let prevAdmissions: string | undefined

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'orch-domain-'))
  prevDb = process.env.ORCHESTRATOR_DB
  prevAdmissions = process.env.ORCHESTRATOR_ADMISSIONS
  process.env.ORCHESTRATOR_DB = join(dir, 'orch.sqlite')
  process.env.ORCHESTRATOR_ADMISSIONS = join(dir, 'admissions.json')
  resetOrchestratorForTests()
})

afterEach(() => {
  resetOrchestratorForTests()
  if (prevDb === undefined) delete process.env.ORCHESTRATOR_DB
  else process.env.ORCHESTRATOR_DB = prevDb
  if (prevAdmissions === undefined) delete process.env.ORCHESTRATOR_ADMISSIONS
  else process.env.ORCHESTRATOR_ADMISSIONS = prevAdmissions
  rmSync(dir, { recursive: true, force: true })
})

const base = {
  sourceId: 'kanban:default',
  sourceKind: 'kanban' as const,
  externalId: 'e-1',
  threadKey: 'task:default:t-1',
  actor: 'kanban:column_transition',
  addressed: true,
  payload: { kind: 'column_transition' },
}

describe('store', () => {
  it('Trigger 幂等：同 source+external 返回既有行', () => {
    const a = insertTrigger({ ...base, receivedAt: 1000 })
    const b = insertTrigger({ ...base, receivedAt: 2000 })
    expect(a.duplicated).toBe(false)
    expect(b.duplicated).toBe(true)
    expect(b.trigger.id).toBe(a.trigger.id)
    expect(b.trigger.receivedAt).toBe(1000)
    expect(listTriggers().length).toBe(1)
  })

  it('Thread 归组与订阅游标', () => {
    ingestTrigger({ ...base, externalId: 'e-1', receivedAt: 1000 })
    ingestTrigger({ ...base, externalId: 'e-2', receivedAt: 2000 })
    const threads = listThreads()
    expect(threads.length).toBe(1)
    expect(threads[0]!.threadKey).toBe('task:default:t-1')
    expect(threads[0]!.lastEventAt).toBe(2000)

    subscribe({ threadId: threads[0]!.id, subscriber: 'worker:t-1', mode: 'context' })
    const first = pendingFor(threads[0]!.id, 'worker:t-1')
    expect(first.map(t => t.externalId)).toEqual(['e-1', 'e-2'])

    expect(markRead(threads[0]!.id, 'worker:t-1', first[0]!.id)).toBe(true)
    const second = pendingFor(threads[0]!.id, 'worker:t-1')
    expect(second.map(t => t.externalId)).toEqual(['e-2'])
  })

  it('未知订阅者按最近 N 条交付', () => {
    for (let i = 0; i < 5; i++) {
      ingestTrigger({ ...base, externalId: `e-${i}`, receivedAt: 1000 + i })
    }
    const threadId = listThreads()[0]!.id
    const rows = pendingFor(threadId, 'nobody', { initialLimit: 2 })
    expect(rows.map(t => t.externalId)).toEqual(['e-3', 'e-4'])
  })

  it('状态迁移可查', () => {
    const { trigger } = insertTrigger({ ...base, receivedAt: 1000 })
    setTriggerStatus(trigger.id, 'routed')
    expect(getTrigger(trigger.id)?.status).toBe('routed')
  })
})

describe('ingest（准入三态）', () => {
  it('未建档源：默认 observe + unlisted ignore，不接单但留决策', () => {
    const r = ingestTrigger({ ...base, externalId: 'u-1' })
    expect(r.accepted).toBe(false)
    expect(r.reason).toBe('observe_ignore')
    expect(r.decision.verdict).toBe('ignore')
    expect(r.trigger.status).toBe('ignored')
  })

  it('observe + 名单内明确指向：记录本可接单，不实际接单', () => {
    setAdmission({
      sourceId: 'kanban:default', mode: 'observe',
      allowedSenders: ['kanban:column_transition'], cells: defaultCells(),
    }, 'test')
    const r = ingestTrigger({ ...base, externalId: 'o-1' })
    expect(r.accepted).toBe(false)
    expect(r.reason).toBe('observe_would_accept')
    expect(r.decision.verdict).toBe('accept')
    expect(r.decision.strength).toBe('explicit')
    // observe 下 Trigger 保持 pending，等待人工确认，而不是 routed
    expect(r.trigger.status).toBe('pending')
  })

  it('auto + 名单内明确指向：实际接单', () => {
    setAdmission({
      sourceId: 'kanban:default', mode: 'auto',
      allowedSenders: ['kanban:column_transition'], cells: defaultCells(),
    }, 'test')
    const r = ingestTrigger({ ...base, externalId: 'a-1' })
    expect(r.accepted).toBe(true)
    expect(r.reason).toBe('auto_accept')
    expect(r.trigger.status).toBe('routed')
  })

  it('auto + 名单内未指向：inferred 强度', () => {
    setAdmission({
      sourceId: 'kanban:default', mode: 'auto',
      allowedSenders: ['kanban:column_transition'], cells: defaultCells(),
    }, 'test')
    const r = ingestTrigger({ ...base, externalId: 'a-2', addressed: false })
    expect(r.accepted).toBe(true)
    expect(r.decision.strength).toBe('inferred')
  })

  it('名单外明确指向：ignore（缺省表宁可漏接不可越权）', () => {
    setAdmission({
      sourceId: 'kanban:default', mode: 'auto',
      allowedSenders: ['someone-else'], cells: defaultCells(),
    }, 'test')
    const r = ingestTrigger({ ...base, externalId: 'x-1' })
    expect(r.accepted).toBe(false)
    expect(r.decision.verdict).toBe('ignore')
  })

  it('重复摄入不产生第二次接单', () => {
    setAdmission({
      sourceId: 'kanban:default', mode: 'auto',
      allowedSenders: ['kanban:column_transition'], cells: defaultCells(),
    }, 'test')
    const first = ingestTrigger({ ...base, externalId: 'dup-1' })
    const second = ingestTrigger({ ...base, externalId: 'dup-1' })
    expect(first.accepted).toBe(true)
    expect(second.duplicated).toBe(true)
    expect(second.accepted).toBe(false)
    expect(second.reason).toBe('duplicate')
  })
})
