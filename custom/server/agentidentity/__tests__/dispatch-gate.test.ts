// custom/server/agentidentity/__tests__/dispatch-gate.test.ts
// 派单门纯函数（数字员工批一 Task 2）：判定顺序 mode → 绑定查找 → 台账可读性 → 阶段 → 责任卡。
// assessUnitDispatchGate 是纯函数（夹具直接构造 facts）；readUnitGateFacts 用例把
// AGENT_IDENTITY_STORE 指到临时目录，不读开发机真实台账。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentIdentity } from '../agent-identity'
import type { Person } from '../people'
import type { ResponsibilityCard } from '../responsibility'
import type { Lifecycle } from '../lifecycle'
import { assessUnitDispatchGate, readUnitGateFacts, type UnitGateFacts } from '../dispatch-gate'

const person = (id: string, active = true): Person => ({ id, name: id, emails: [], active, source: 'manual', createdAt: 1 })
const unit = (over: Partial<AgentIdentity> = {}): AgentIdentity => ({
  id: 'aid-001', name: 'u1', kind: 'agent', owner: 'alice', toolAllowlist: ['read_file'],
  credentials: [], delegations: [], createdAt: 1, updatedAt: 1,
  runtimeBindings: { agents: ['zcode'] }, ...over,
})
const card = (over: Partial<ResponsibilityCard> = {}): ResponsibilityCard => ({
  deliveryStandard: '可复现', unitType: 'assistant', riskTier: 'tier2', primaryOwner: 'alice', escalation: ['e'], pauseConditions: ['p'],
  takerOver: 'bob', testCaseVersion: 'tc-1', costBudget: { limit: 1, unit: 'CNY' }, maintainer: 'alice', deploymentLocation: 'x', ...over,
})
const admitted = (over: Partial<AgentIdentity> = {}): AgentIdentity =>
  unit({ responsibilityCard: card(), lifecycle: { stage: 'admitted', history: [] }, ...over })
const base = (over: Partial<UnitGateFacts> = {}): UnitGateFacts =>
  ({ target: 'zcode', targetKind: 'agent', identities: [admitted()], people: [person('alice'), person('bob')], mode: 'on', ...over })

describe('assessUnitDispatchGate：判定顺序与原因码', () => {
  it('mode=off → skipped，applicable=false', () => {
    expect(assessUnitDispatchGate(base({ mode: 'off' }))).toMatchObject({ decision: 'skipped', applicable: false, reasons: ['gate_off'] })
  })
  it('无身份绑定该目标 → skipped / not_bound', () => {
    expect(assessUnitDispatchGate(base({ target: 'other' }))).toMatchObject({ decision: 'skipped', reasons: ['not_bound'] })
  })
  it('台账不可读（identities=null）→ unknown，不判通过', () => {
    const v = assessUnitDispatchGate(base({ identities: null }))
    expect(v.decision).toBe('unknown'); expect(v.reasons.join()).toContain('ledger_unavailable')
  })
  it.each([
    ['registered', 'unit_registered'], ['changing', 'unit_changing'], ['retired', 'unit_retired'],
  ])('阶段 %s → block / %s', (stage, reason) => {
    const v = assessUnitDispatchGate(base({ identities: [admitted({ lifecycle: { stage, history: [] } as Lifecycle })] }))
    expect(v).toMatchObject({ decision: 'block', applicable: true, identityId: 'aid-001' })
    expect(v.reasons).toContain(reason)
  })
  it.each(['admitted', 'running'])('阶段 %s 且卡有效 → pass', (stage) => {
    expect(assessUnitDispatchGate(base({ identities: [admitted({ lifecycle: { stage, history: [] } as Lifecycle })] }))).toMatchObject({ decision: 'pass' })
  })
  it('责任卡按非准入口径有缺口 → block / card_invalid', () => {
    const v = assessUnitDispatchGate(base({ identities: [admitted({ responsibilityCard: undefined })] }))
    expect(v.decision).toBe('block'); expect(v.reasons).toContain('card_invalid')
  })
  it('主责任人已停用 → card_invalid（责任人停用使卡失效）', () => {
    const v = assessUnitDispatchGate(base({ people: [person('alice', false), person('bob')] }))
    expect(v.reasons).toContain('card_invalid')
  })
  it('matrix-account 目标按 runtimeBindings.matrixAccounts 匹配', () => {
    const v = assessUnitDispatchGate(base({
      target: '@u1-agent:sv', targetKind: 'matrix-account',
      identities: [admitted({ runtimeBindings: { matrixAccounts: ['@u1-agent:sv'] } })],
    }))
    expect(v).toMatchObject({ decision: 'pass', identityId: 'aid-001' })
  })
})

describe('readUnitGateFacts：读盘包装与 env 开关', () => {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dispatch-gate-'))
    process.env.AGENT_IDENTITY_STORE = dir
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    delete process.env.AGENT_IDENTITY_STORE
    delete process.env.WORKUNIT_DISPATCH_GATE
  })

  it('readUnitGateFacts：env=off 时 mode=off；未设时 mode=on', async () => {
    process.env.WORKUNIT_DISPATCH_GATE = 'off'
    expect((await readUnitGateFacts('zcode', 'agent')).mode).toBe('off')
    delete process.env.WORKUNIT_DISPATCH_GATE
    expect((await readUnitGateFacts('zcode', 'agent')).mode).toBe('on')
  })
})
