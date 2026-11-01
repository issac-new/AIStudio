// custom/server/orchestrator/__tests__/tick.test.ts
// 编排轮（2026-10-31 定时轮批）：桥接/评估/汇总/投递四步与游标推进。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultCells, setAdmission } from '../admission'
import { evalOnTick, generateDigests, runOrchestratorTick, tickIntervalMs } from '../tick'
import { insertDigest, insertTrigger, listDigests, resetOrchestratorForTests, upsertThread } from '../store'
import { subscribe, pendingFor } from '../thread'

let dir: string
let prevDb: string | undefined
let prevAdmissions: string | undefined

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'orch-tick-'))
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

function seedTrigger(externalId: string, kind = 'completed', at = 1000): void {
  insertTrigger({
    sourceId: 'kanban:default', sourceKind: 'kanban', externalId,
    threadKey: 'task:default:t-1', actor: 'kanban:' + kind, addressed: true,
    payload: { kind, taskId: 't-1' }, receivedAt: at,
  })
}

describe('tickIntervalMs / evalOnTick', () => {
  it('间隔默认 0（关），低于 10s 视为关', () => {
    expect(tickIntervalMs({})).toBe(0)
    expect(tickIntervalMs({ ORCHESTRATOR_TICK_INTERVAL_MS: '5000' })).toBe(0)
    expect(tickIntervalMs({ ORCHESTRATOR_TICK_INTERVAL_MS: '60000' })).toBe(60_000)
  })

  it('评估默认开，显式 0 才关', () => {
    expect(evalOnTick({})).toBe(true)
    expect(evalOnTick({ ORCHESTRATOR_EVAL_ON_TICK: '0' })).toBe(false)
  })
})

describe('generateDigests', () => {
  it('有订阅且有待处理事件：生成汇总并推进游标', () => {
    const thread = upsertThread('kanban:default', 'task:default:t-1', 1000)
    subscribe({ threadId: thread.id, subscriber: 'worker:t-1', mode: 'context' })
    seedTrigger('e-1', 'completed')
    const r = generateDigests()
    expect(r.digests).toBe(1)
    expect(listDigests(thread.id).length).toBe(1)
    // 游标推进后不再有待处理
    expect(pendingFor(thread.id, 'worker:t-1').length).toBe(0)
  })

  it('只有列变更：不生成 digest，但游标照样推进', () => {
    const thread = upsertThread('kanban:default', 'task:default:t-1', 1000)
    subscribe({ threadId: thread.id, subscriber: 'worker:t-1', mode: 'context' })
    seedTrigger('c-1', 'column_transition')
    const r = generateDigests()
    expect(r.digests).toBe(0)
    expect(listDigests(thread.id).length).toBe(0)
    expect(pendingFor(thread.id, 'worker:t-1').length).toBe(0)
  })

  it('无订阅：不生成', () => {
    upsertThread('kanban:default', 'task:default:t-1', 1000)
    seedTrigger('n-1', 'completed')
    expect(generateDigests().digests).toBe(0)
  })
})

describe('runOrchestratorTick', () => {
  it('四步串起来：桥接 0（无库）+ 评估 + 汇总 + 投递跳过', async () => {
    setAdmission({ sourceId: 'kanban:default', mode: 'observe', allowedSenders: ['kanban:completed'], cells: defaultCells() }, 't')
    const thread = upsertThread('kanban:default', 'task:default:t-1', 1000)
    subscribe({ threadId: thread.id, subscriber: 'worker:t-1', mode: 'context' })
    seedTrigger('t-1', 'completed')

    const evaluate = vi.fn().mockResolvedValue({ verdict: 'accept', reasons: ['ok'], confidence: null })
    const r = await runOrchestratorTick({
      dbPaths: [join(dir, 'no-such-kanban.db')],
      evaluate: evaluate as unknown as (t: never, c: never) => Promise<never>,
      fetchImpl: (async () => new Response('{}')) as unknown as typeof fetch,
      env: {},
    })
    expect(r.bridged).toBe(0)
    expect(r.digests).toBe(1)
    // observe 下评估 accept 不推进，但 Decision 已记
    expect(r.evaluated).toBe(1)
    expect(Array.isArray(r.errors)).toBe(true)
  })

  it('关闭评估：只桥接与投递', async () => {
    const r = await runOrchestratorTick({
      dbPaths: [join(dir, 'no-such-kanban.db')],
      evalEnabled: false,
      fetchImpl: (async () => new Response('{}')) as unknown as typeof fetch,
      env: {},
    })
    expect(r.evaluated).toBe(0)
    expect(Array.isArray(r.errors)).toBe(true)
  })
})
