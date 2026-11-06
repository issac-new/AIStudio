import { describe, expect, it } from 'vitest'
import { canTransition, initialLifecycle, stageOf } from '../lifecycle'
import type { ResponsibilityCard } from '../responsibility'
import type { Person } from '../people'

const people: Person[] = [
  { id: 'p-1', name: 'alice', emails: [], active: true, source: 'manual', createdAt: 1 },
  { id: 'p-2', name: 'bob', emails: [], active: true, source: 'manual', createdAt: 1 },
]
const card: ResponsibilityCard = {
  deliveryStandard: 'x', riskTier: 'medium', primaryOwner: 'p-1',
  escalation: ['e'], pauseConditions: ['p'], takerOver: 'p-2',
  testCaseVersion: 'tc-1', costBudget: { limit: 1, unit: 'CNY/轮' },
  maintainer: 'p-1', deploymentLocation: 'loc',
  businessOwnerSign: { signedBy: 'p-1', signedAt: 1 },
  admissionEvidence: { representativeTasks: ['t'], edgeCases: ['e'], dataPermissionReview: ['d'], recordedAt: 1 },
}
const base = { name: 'u', owner: 'o', toolAllowlist: [], responsibilityCard: card, lifecycle: initialLifecycle() }

describe('lifecycle', () => {
  it('无生命周期按 registered', () => {
    expect(stageOf({ name: 'u', owner: 'o', toolAllowlist: [] } as never)).toBe('registered')
  })

  it('registered→admitted 需卡与准入证据', () => {
    expect(canTransition(base as never, { to: 'admitted', by: 'p-1', reason: 'ok' }, people).ok).toBe(true)
    expect(canTransition({ ...base, responsibilityCard: undefined } as never, { to: 'admitted', by: 'p-1', reason: 'ok' }, people).ok).toBe(false)
  })

  it('changing→running 需两条证据', () => {
    const changing = { ...base, lifecycle: { stage: 'changing' as const, history: [] } }
    expect(canTransition(changing as never, { to: 'running', by: 'p-1', reason: 'ok', evidenceRefs: ['a'] }, people).ok).toBe(false)
    expect(canTransition(changing as never, { to: 'running', by: 'p-1', reason: 'ok', evidenceRefs: ['a', 'b'] }, people).ok).toBe(true)
  })

  it('退役需交接项与确认人', () => {
    const running = { ...base, lifecycle: { stage: 'running' as const, history: [] } }
    expect(canTransition(running as never, { to: 'retired', by: 'p-1', reason: 'x', exit: { kind: 'pause', items: [] } }, people).ok).toBe(false)
    expect(canTransition(running as never, { to: 'retired', by: 'p-1', reason: 'x', exit: { kind: 'pause', items: ['交接待办'], confirmedBy: 'p-2' } }, people).ok).toBe(true)
  })

  it('迁移人必须 active 且理由非空', () => {
    expect(canTransition(base as never, { to: 'admitted', by: 'p-x', reason: 'ok' }, people).ok).toBe(false)
    expect(canTransition(base as never, { to: 'admitted', by: 'p-1', reason: ' ' }, people).ok).toBe(false)
  })

  it('非法迁移拒绝（registered 不能直接 running）', () => {
    expect(canTransition(base as never, { to: 'running', by: 'p-1', reason: 'ok' }, people).ok).toBe(false)
  })
})
