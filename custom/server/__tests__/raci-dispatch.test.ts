import { describe, it, expect } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { evaluateRules, BlockPolicyCategory } from '../loop/engine/architecture-engine'
import { RACIDispatchService } from '../services/kanban/raci-dispatch'

let dedupePath = ''
async function freshDedupePath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'aipaydev-raci-'))
  dedupePath = join(dir, 'dispatch.json')
  return dedupePath
}

describe('Architecture Rules', () => {
  const baseTask = (overrides: Record<string, unknown> = {}) => ({
    id: 'task-001',
    title: 'Test task',
    body: null,
    assignee: null,
    status: 'todo',
    priority: 1,
    created_by: null,
    created_at: Date.now(),
    started_at: null,
    completed_at: null,
    workspace_kind: 'local',
    workspace_path: null,
    tenant: null,
    project_id: null,
    result: null,
    skills: null,
    ...overrides,
  })

  describe('Rule 1: Dependency Integrity', () => {
    it('BLOCKs when depends_on is declared but upstream is not done', async () => {
      const task = baseTask({ body: JSON.stringify({ depends_on: ['task-upstream'] }) })
      const result = await evaluateRules(task)
      expect(result).not.toBeNull()
      expect(result?.type).toBe('BLOCKED_BY_POLICY')
      expect(result?.ruleId).toBe('arch-rule-001')
    })

    it('does not trigger when no depends_on', async () => {
      // depends_on 为空 + RACI 完整 → 不应命中任何规则
      const task = baseTask({ body: JSON.stringify({ depends_on: [], raci: { responsible: ['@bob:localhost'], approver: [], consulted: [], informed: [] } }) })
      const result = await evaluateRules(task)
      expect(result).toBeNull()
    })
  })

  describe('Rule 2: Role Assignment', () => {
    it('BLOCKs when responsible is missing', async () => {
      const task = baseTask({ body: JSON.stringify({ raci: { responsible: [], approver: [], consulted: [], informed: [] } }) })
      const result = await evaluateRules(task)
      expect(result).not.toBeNull()
      expect(result?.type).toBe('BLOCKED_BY_POLICY')
      expect(result?.ruleId).toBe('arch-rule-002')
    })

    it('passes when responsible is present', async () => {
      const task = baseTask({ body: JSON.stringify({ raci: { responsible: ['@bob:localhost'], approver: [], consulted: [], informed: [] } }) })
      const result = await evaluateRules(task)
      expect(result).toBeNull()
    })
  })

  describe('Rule 3: Approver Uniqueness', () => {
    it('AUTO_FIXes when multiple approvers are present', async () => {
      const task = baseTask({ body: JSON.stringify({ raci: { responsible: ['@bob:localhost'], approver: ['@carol:localhost', '@eve:localhost'], consulted: [], informed: [] } }) })
      const result = await evaluateRules(task)
      expect(result).not.toBeNull()
      expect(result?.type).toBe('AUTO_FIXED')
      expect(result?.ruleId).toBe('arch-rule-003')
    })
  })

  describe('Rule 4: Concurrent Quota', () => {
    it('does not block when under quota (currentRunning=0 < maxConcurrent=3)', async () => {
      const task = baseTask({ body: JSON.stringify({ depends_on: [], raci: { responsible: ['@bob:localhost'], approver: [], consulted: [], informed: [] } }) })
      const result = await evaluateRules(task)
      expect(result).toBeNull()
    })
  })
})

describe('RACI Dispatch', () => {
  it('rejects when responsible is empty', async () => {
    const task = {
      id: 'task-empty',
      title: 'Empty RACI',
      body: JSON.stringify({ raci: { responsible: [], approver: [], consulted: [], informed: [] } }),
      status: 'todo',
      assignee: null,
    }
    const result = await RACIDispatchService.dispatch(task as any)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/responsible/)
  })

  it('rejects when approver has more than 1 person', async () => {
    const task = {
      id: 'task-multi-approver',
      title: 'Multi Approver',
      body: JSON.stringify({ raci: { responsible: ['@bob:localhost'], approver: ['@carol:localhost', '@eve:localhost'], consulted: [], informed: [] } }),
      status: 'todo',
      assignee: '@bob:localhost',
    }
    const result = await RACIDispatchService.dispatch(task as any)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/approver/)
  })

  it('succeeds in simulation mode with valid RACI', async () => {
    const task = {
      id: 'task-valid',
      title: 'Valid RACI Task',
      body: JSON.stringify({ raci: { responsible: ['@bob:localhost'], approver: ['@carol:localhost'], consulted: ['@grace:localhost'], informed: ['@ivy:localhost'] } }),
      status: 'todo',
      assignee: '@bob:localhost',
    }
    const result = await RACIDispatchService.dispatch(task as any, await freshDedupePath())
    expect(result.ok).toBe(true)
    expect(result.roomId).toMatch(/^!sim-\d+:localhost/)
    await rm(dedupePath, { force: true }).catch(() => {})
  })

  it('dedupes repeat dispatch for the same task (patch 366 assign 幂等)', async () => {
    const task = {
      id: 'task-dedupe',
      title: 'Dedupe Task',
      body: JSON.stringify({ raci: { responsible: ['@bob:localhost'], approver: ['@carol:localhost'], consulted: [], informed: [] } }),
      status: 'todo',
      assignee: '@bob:localhost',
    }
    const path = await freshDedupePath()
    const first = await RACIDispatchService.dispatch(task as any, path)
    expect(first.ok).toBe(true)
    expect(first.deduped).toBeFalsy()
    const second = await RACIDispatchService.dispatch(task as any, path)
    expect(second.ok).toBe(true)
    expect(second.deduped).toBe(true)
    expect(second.roomId).toBe(first.roomId)
    await rm(dedupePath, { force: true }).catch(() => {})
  })
})
