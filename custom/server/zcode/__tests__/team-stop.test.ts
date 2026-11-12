import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { evaluateTeamStop, DEFAULT_TEAM_STOP_LIMITS } from '../team-stop'
import { collectTeamStopFacts } from '../team-stop-facts'
import { planDispatch, type PlanFacts } from '../mention-dispatch'
import { DISPATCH_REASON_CODES } from '../dispatch-reasons'
import { appendDispatchOutcome } from '../../governance/dispatch-ledger'
import { recordEvaluation } from '../squad-protocol'

describe('团队级停止条件（handbook 多 Agent 关）', () => {
  it('四类阈值命中；缺事实不猜', () => {
    expect(evaluateTeamStop({ depth: DEFAULT_TEAM_STOP_LIMITS.maxDepth })).toMatchObject({ stop: true, code: 'delegation_depth' })
    expect(evaluateTeamStop({ dispatched: 12 })).toMatchObject({ stop: true, code: 'derived_tasks' })
    expect(evaluateTeamStop({ reworkRounds: 2 })).toMatchObject({ stop: true, code: 'rework_rounds' })
    expect(evaluateTeamStop({ noProgressTurns: 3 })).toMatchObject({ stop: true, code: 'no_progress' })
    expect(evaluateTeamStop({})).toEqual({ stop: false })
    expect(evaluateTeamStop({ dispatched: 11, depth: 2, reworkRounds: 1, noProgressTurns: 2 })).toEqual({ stop: false })
  })

  it('只注入部分事实时只按该事实判定（不因缺数据误停）', () => {
    expect(evaluateTeamStop({ reworkRounds: 1 })).toEqual({ stop: false })
    expect(evaluateTeamStop({ depth: 2 })).toEqual({ stop: false })
  })

  it('planDispatch：enforce 才 reject；否则只带 warnings 起跑', () => {
    const base: PlanFacts = {
      knownAgents: new Set(['zcode']),
      deferredAgents: new Set(),
      pendingSince: new Map(),
      pendingTtlMs: 30 * 60_000,
      now: 1_000_000,
    }
    const req = { token: { target: 'zcode', kind: 'agent' as const }, workspacePath: '/w', engineOnline: true }
    const enforced = planDispatch(req, { ...base, team: { dispatched: 12, enforce: true } })
    expect(enforced.action).toBe('reject')
    expect(enforced.reason).toBe('team_stop')
    expect(DISPATCH_REASON_CODES).toContain('team_stop')

    const warned = planDispatch(req, { ...base, team: { dispatched: 12, enforce: false } })
    expect(warned.action).toBe('start')
    expect(warned.warnings?.[0]).toContain('团队停止条件')
  })
})

describe('collectTeamStopFacts（只采可推导事实）', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'team-stop-'))
    process.env.GOVERNANCE_DISPATCH_LEDGER = join(dir, 'ledger.jsonl')
    process.env.HERMES_SQUAD_DIR = join(dir, 'squad')
  })
  afterEach(() => {
    delete process.env.GOVERNANCE_DISPATCH_LEDGER
    delete process.env.HERMES_SQUAD_DIR
    rmSync(dir, { recursive: true, force: true })
  })

  it('派生数按目标计数、返工按 failed 评估计数；深度不猜', () => {
    const now = Date.now()
    for (let i = 0; i < 12; i++) {
      appendDispatchOutcome({ ts: now, kind: 'mention', target: 'squad-a', reason: 'queued' })
    }
    appendDispatchOutcome({ ts: now, kind: 'mention', target: 'squad-b', reason: 'queued' })
    recordEvaluation({ squad: 'squad-a', leader: 'lead', verdict: 'failed', reason: 'x', at: now })
    recordEvaluation({ squad: 'squad-a', leader: 'lead', verdict: 'action', reason: 'y', at: now })

    const facts = collectTeamStopFacts({ teamId: 'squad-a', now })
    expect(facts).toMatchObject({ dispatched: 12, reworkRounds: 1 })
    expect(facts.depth).toBeUndefined()
    expect(evaluateTeamStop(facts)).toMatchObject({ stop: true, code: 'derived_tasks' })
  })
})
