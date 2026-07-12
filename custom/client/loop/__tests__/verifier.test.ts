// overlay/custom/client/loop/__tests__/verifier.test.ts
import { describe, it, expect, vi } from 'vitest'
import { Verifier } from '../../../server/loop/engine/verifier'
import type { TaskContract, LoopInstance, VerificationRecord } from '../types'

function makeContract(overrides: Partial<TaskContract> = {}): TaskContract {
  return {
    id: 'task/test-001', loopId: 'l',
    source: { type: 'github-issue', ref: '#1', summary: 'test', rawPayload: {} },
    readPlan: { requiredReads: [] },
    writeBoundary: ['packages/**'],
    verificationIntent: { programmatic: [], judge: null, human: null },
    resultTemplate: { artifactType: 'patch', requiredFiles: [] },
    worktreeId: null, assignee: 'maker', status: 'in-progress', attempts: 0, maxAttempts: 3,
    ...overrides,
  }
}

function makeLoop(level: 'L1' | 'L2' | 'L3' = 'L1'): LoopInstance {
  return {
    id: 'l', name: 'n', goal: 'g', stopCondition: 's', pattern: 'daily-triage',
    schedule: { mode: 'manual', timezone: 'UTC' }, stage: 'validation', status: 'running',
    autonomyLevel: level, stateAdapter: 'local', createdAt: '', updatedAt: '',
    lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
  }
}

describe('Verifier', () => {
  it('passes with empty verification spec and guard', async () => {
    const v = new Verifier()
    // finalResponseGuard returns false when no worktreeId, so set requiredFiles=[]
    const contract = makeContract({ worktreeId: null, resultTemplate: { artifactType: 'report', requiredFiles: [] } })
    const record = await v.verify(contract, makeLoop())
    expect(record.overall).toBe('passed')
  })

  it('fails when programmatic check fails', async () => {
    const v = new Verifier()
    const contract = makeContract({
      verificationIntent: {
        programmatic: [{ command: 'false', expectedExitCode: 0, timeout: 5000 }],
        judge: null, human: null,
      },
      resultTemplate: { artifactType: 'report', requiredFiles: [] },
    })
    const record = await v.verify(contract, makeLoop())
    expect(record.overall).toBe('failed')
    expect(record.results.programmatic[0].passed).toBe(false)
  })

  it('short-circuits judge when programmatic fails', async () => {
    const callJudge = vi.fn().mockResolvedValue({ score: 90, reasoning: 'good' })
    const v = new Verifier({ callJudge })
    const contract = makeContract({
      verificationIntent: {
        programmatic: [{ command: 'false', expectedExitCode: 0, timeout: 5000 }],
        judge: { model: 'gpt-4', rubric: 'correctness', minScore: 80 },
        human: null,
      },
      resultTemplate: { artifactType: 'report', requiredFiles: [] },
    })
    const record = await v.verify(contract, makeLoop())
    expect(record.results.judge).toBeNull()
    expect(callJudge).not.toHaveBeenCalled()
  })

  it('L1 always needs human gate even on pass', async () => {
    const requestApproval = vi.fn().mockResolvedValue('approved' as const)
    const v = new Verifier({ requestHumanApproval: requestApproval })
    const contract = makeContract({
      verificationIntent: {
        programmatic: [],
        judge: null,
        human: { gate: 'on-fail', approvers: ['alice'] },
      },
      resultTemplate: { artifactType: 'report', requiredFiles: [] },
    })
    const record = await v.verify(contract, makeLoop('L1'))
    expect(requestApproval).toHaveBeenCalled()
    expect(record.results.human).not.toBeNull()
    expect(record.results.human!.decision).toBe('approved')
  })

  it('L3 skips human gate on pass when gate=on-fail', async () => {
    const requestApproval = vi.fn()
    const v = new Verifier({ requestHumanApproval: requestApproval })
    const contract = makeContract({
      verificationIntent: {
        programmatic: [],
        judge: null,
        human: { gate: 'on-fail', approvers: ['alice'] },
      },
      resultTemplate: { artifactType: 'report', requiredFiles: [] },
    })
    const record = await v.verify(contract, makeLoop('L3'))
    expect(requestApproval).not.toHaveBeenCalled()
    expect(record.results.human).toBeNull()
    expect(record.overall).toBe('passed')
  })

  it('gate=always requires human even in L3', async () => {
    const requestApproval = vi.fn().mockResolvedValue('approved' as const)
    const v = new Verifier({ requestHumanApproval: requestApproval })
    const contract = makeContract({
      verificationIntent: {
        programmatic: [],
        judge: null,
        human: { gate: 'always', approvers: ['alice'] },
      },
      resultTemplate: { artifactType: 'report', requiredFiles: [] },
    })
    await v.verify(contract, makeLoop('L3'))
    expect(requestApproval).toHaveBeenCalled()
  })

  it('returns pending when human approval is pending', async () => {
    const requestApproval = vi.fn().mockResolvedValue('pending' as const)
    const v = new Verifier({ requestHumanApproval: requestApproval })
    const contract = makeContract({
      verificationIntent: {
        programmatic: [],
        judge: null,
        human: { gate: 'always', approvers: ['alice'] },
      },
      resultTemplate: { artifactType: 'report', requiredFiles: [] },
    })
    const record = await v.verify(contract, makeLoop('L3'))
    expect(record.overall).toBe('pending')
  })
})
