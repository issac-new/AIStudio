// custom/server/orchestrator/__tests__/pass.test.ts
// 评估轮推进规则（2026-10-31 C 批 spec §4.2）：只有 mode=auto 且 accept 才推进。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultCells, setAdmission } from '../admission'
import { evaluatePending } from '../pass'
import { getTrigger, insertTrigger, resetOrchestratorForTests } from '../store'
import type { SemanticVerdict } from '../types'

let dir: string
let prevDb: string | undefined
let prevAdmissions: string | undefined

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'orch-pass-'))
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

function seed(externalId: string): string {
  const { trigger } = insertTrigger({
    sourceId: 'kanban:default', sourceKind: 'kanban', externalId,
    threadKey: 'task:default:t-1', actor: 'kanban:blocked', addressed: true,
    payload: { kind: 'blocked', taskId: 't-1' }, receivedAt: 1000,
  })
  return trigger.id
}

const accept: SemanticVerdict = { verdict: 'accept', reasons: ['有缺陷'], confidence: null }

describe('evaluatePending', () => {
  it('observe 模式：accept 也只记 Decision，不推进', async () => {
    setAdmission({ sourceId: 'kanban:default', mode: 'observe', allowedSenders: ['kanban:blocked'], cells: defaultCells() }, 't')
    const id = seed('e-1')
    const r = await evaluatePending({ evaluate: async () => accept })
    expect(r.accepted).toBe(1)
    expect(r.recordedOnly).toBe(1)
    expect(getTrigger(id)?.status).toBe('pending')
  })

  it('auto 模式 + accept：推进为 routed', async () => {
    setAdmission({ sourceId: 'kanban:default', mode: 'auto', allowedSenders: ['kanban:blocked'], cells: defaultCells() }, 't')
    const id = seed('e-2')
    const r = await evaluatePending({ evaluate: async () => accept })
    expect(r.accepted).toBe(1)
    expect(r.details[0]!.promoted).toBe(true)
    expect(getTrigger(id)?.status).toBe('routed')
  })

  it('auto 模式 + ignore：置 ignored', async () => {
    setAdmission({ sourceId: 'kanban:default', mode: 'auto', allowedSenders: ['kanban:blocked'], cells: defaultCells() }, 't')
    const id = seed('e-3')
    await evaluatePending({ evaluate: async () => ({ verdict: 'ignore', reasons: ['噪音'], confidence: null }) })
    expect(getTrigger(id)?.status).toBe('ignored')
  })

  it('unavailable：保持 pending，计入 recordedOnly', async () => {
    setAdmission({ sourceId: 'kanban:default', mode: 'auto', allowedSenders: ['kanban:blocked'], cells: defaultCells() }, 't')
    const id = seed('e-4')
    const r = await evaluatePending({ evaluate: async () => ({ verdict: 'unavailable', reasons: ['timeout'], confidence: null }) })
    expect(r.unavailable).toBe(1)
    expect(getTrigger(id)?.status).toBe('pending')
  })

  it('已 routed/ignored 的事件不再送评估', async () => {
    setAdmission({ sourceId: 'kanban:default', mode: 'auto', allowedSenders: ['kanban:blocked'], cells: defaultCells() }, 't')
    const id = seed('e-5')
    await evaluatePending({ evaluate: async () => accept })
    expect(getTrigger(id)?.status).toBe('routed')
    const second = await evaluatePending({ evaluate: async () => accept })
    expect(second.evaluated).toBe(0)
  })
})
