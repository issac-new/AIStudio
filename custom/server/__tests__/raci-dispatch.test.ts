import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { evaluateRules, BlockPolicyCategory, RULE_APPROVER_UNIQUENESS } from '../loop/engine/architecture-engine'
import { RACIDispatchService } from '../services/kanban/raci-dispatch'
import { getUserMemberships } from '../matrix/simulation'

let dedupePath = ''
async function freshDedupePath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'aipaydev-raci-'))
  dedupePath = join(dir, 'dispatch.json')
  return dedupePath
}

// 本文件断言模拟派发行为（房间 id !sim-*）：必须隔离真实 Matrix 凭据，
// 否则宿主机 ~/.hermes 有配置时会走真实 client-server（room-invite-gap 修复后行为）。
beforeEach(() => {
  process.env.HERMES_HOME = join(tmpdir(), 'raci-dispatch-no-creds')
  delete process.env.LOOP_MATRIX_PROFILE
})
afterEach(() => {
  delete process.env.HERMES_HOME
})

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
    it('BLOCKs when depends_on is declared and upstream is not done（状态查询注入）', async () => {
      const task = baseTask({ body: JSON.stringify({ depends_on: ['task-upstream'] }) })
      const result = await evaluateRules(task, { getTaskStatus: async () => 'in-progress' })
      expect(result).not.toBeNull()
      expect(result?.type).toBe('BLOCKED_BY_POLICY')
      expect(result?.ruleId).toBe('arch-rule-001')
    })

    it('BLOCKs when upstream dep does not exist（查询返回 null 视为未完成）', async () => {
      const task = baseTask({ body: JSON.stringify({ depends_on: ['task-ghost'] }) })
      const result = await evaluateRules(task, { getTaskStatus: async () => null })
      expect(result?.type).toBe('BLOCKED_BY_POLICY')
      expect(result?.ruleId).toBe('arch-rule-001')
    })

    it('passes when all upstream deps are done（真实核验后放行）', async () => {
      const task = baseTask({ body: JSON.stringify({ depends_on: ['task-a', 'task-b'] }) })
      const result = await evaluateRules(task, { getTaskStatus: async () => 'done' })
      expect(result).toBeNull()
    })

    it('does not block when status lookup is not injected（引擎无 upstream 通道，不凭空阻断）', async () => {
      const task = baseTask({ body: JSON.stringify({ depends_on: ['task-upstream'] }) })
      const result = await evaluateRules(task)
      expect(result).toBeNull()
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

    it('passes plain-text task（无 raci 块的普通任务不归规则 002 管——assignTask 全产品路径回归）', async () => {
      const plain = baseTask({ body: '普通文字任务描述，不带 RACI' })
      expect(await evaluateRules(plain)).toBeNull()
      const jsonNoRaci = baseTask({ body: JSON.stringify({ desc: 'JSON body but no raci key' }) })
      expect(await evaluateRules(jsonNoRaci)).toBeNull()
    })
  })

  describe('Rule 3: Approver Uniqueness', () => {
    it('flags LEADER_INTERVENTION without claiming write-back（引擎无 store 通道不得假 AUTO_FIXED）', async () => {
      const task = baseTask({ body: JSON.stringify({ raci: { responsible: ['@bob:localhost'], approver: ['@carol:localhost', '@eve:localhost'], consulted: [], informed: [] } }) })
      const action = await RULE_APPROVER_UNIQUENESS.executor(task)
      expect(action.type).toBe('LEADER_INTERVENTION')
      expect(action.ruleId).toBe('arch-rule-003')
      expect(action.message).toContain('2 位')
    })

    it('not surfaced as blocking verdict by evaluateRules（不阻断派发）', async () => {
      const task = baseTask({ body: JSON.stringify({ raci: { responsible: ['@bob:localhost'], approver: ['@carol:localhost', '@eve:localhost'], consulted: [], informed: [] } }) })
      expect(await evaluateRules(task)).toBeNull()
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

  // 数字员工批一 Task 4：责任人过执行单元派单门。身份 u-ret 绑定 @ret-agent:localhost、
  // 阶段 retired；AGENT_IDENTITY_STORE 指到临时目录（不读开发机真实台账），经真实门判定。
  describe('派单门（数字员工批一）', () => {
    let idDir = ''
    beforeEach(async () => {
      idDir = await mkdtemp(join(tmpdir(), 'raci-gate-id-'))
      process.env.AGENT_IDENTITY_STORE = idDir
      const retiredUnit = {
        id: 'aid-ret', name: 'u-ret', kind: 'agent', owner: 'alice', toolAllowlist: [],
        credentials: [], delegations: [], createdAt: 1, updatedAt: 1,
        runtimeBindings: { matrixAccounts: ['@ret-agent:localhost'] },
        responsibilityCard: {
          deliveryStandard: '可复现', riskTier: 'medium', primaryOwner: 'alice', escalation: ['e'],
          pauseConditions: ['p'], takerOver: 'bob', testCaseVersion: 'tc-1',
          costBudget: { limit: 1, unit: 'CNY' }, maintainer: 'alice', deploymentLocation: 'x',
        },
        lifecycle: { stage: 'retired', history: [] },
      }
      const personRow = (pid: string) => ({ id: pid, name: pid, emails: [], active: true, source: 'manual', createdAt: 1 })
      await writeFile(join(idDir, 'identities.json'), JSON.stringify({ identities: [retiredUnit], nextSeq: 2, nextDelegationSeq: 1 }))
      await writeFile(join(idDir, 'people.json'), JSON.stringify({ people: [personRow('alice'), personRow('bob')], nextSeq: 3 }))
    })
    afterEach(async () => {
      delete process.env.AGENT_IDENTITY_STORE
      await rm(idDir, { recursive: true, force: true })
    })

    const gateTask = (id: string, responsible: string[]) => ({
      id,
      title: 'Gate Task',
      body: JSON.stringify({ raci: { responsible, approver: [], consulted: [], informed: [] } }),
      status: 'todo',
      assignee: null,
    })

    it('责任人账号全被派单门拦截 → 抛错，不建房、不写去重记录', async () => {
      const path = await freshDedupePath()
      await expect(RACIDispatchService.dispatch(gateTask('task-gate-all', ['@ret-agent:localhost']) as any, path))
        .rejects.toThrow(/unit_retired/)
      await expect(readFile(path, 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
      // 被拦账号没进房间（模拟通道成员关系为空）
      expect(getUserMemberships('@ret-agent:localhost')).toHaveLength(0)
    })

    it('部分被拦 → 未被拦的账号照常派发，返回 ok 与 !sim- 房间号', async () => {
      const result = await RACIDispatchService.dispatch(
        gateTask('task-gate-partial', ['@ret-agent:localhost', '@ok-g2:localhost']) as any,
        await freshDedupePath(),
      )
      expect(result.ok).toBe(true)
      expect(result.roomId).toMatch(/^!sim-/)
      // 被拦账号没进房间；未被拦的账号在房内
      expect(getUserMemberships('@ret-agent:localhost')).toHaveLength(0)
      expect(getUserMemberships('@ok-g2:localhost')).toHaveLength(1)
    })

    // 未绑定账号 → 行为不变：既有「succeeds in simulation mode with valid RACI」用例覆盖
  })
})
