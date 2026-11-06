import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  _useStoreDirForTests, getCardView, registerIdentity, transitionIdentity, updateResponsibilityCard,
} from '../agent-identity'
import { _usePeopleStoreForTests, activatePerson, upsertPerson } from '../people'
import type { ResponsibilityCard } from '../responsibility'

let dir: string
let p1 = ''
let p2 = ''
let unitId = ''

function card(primaryOwner: string, reviewer?: string): ResponsibilityCard {
  return {
    deliveryStandard: '交付可复现的测试报告与证据链',
    riskTier: 'medium',
    primaryOwner,
    ...(reviewer ? { reviewer } : {}),
    escalation: ['关键规则无法验证时升级'],
    pauseConditions: ['出现越权调用时暂停'],
    takerOver: p2,
    testCaseVersion: 'tc-2026-11-06',
    costBudget: { limit: 100, unit: 'CNY/轮' },
    maintainer: p1,
    deploymentLocation: 'studio:8802',
    businessOwnerSign: { signedBy: p1, signedAt: Date.now() },
    admissionEvidence: { representativeTasks: ['t1'], edgeCases: ['e1'], dataPermissionReview: ['d1'], recordedAt: Date.now() },
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ident-card-'))
  _useStoreDirForTests(dir)
  _usePeopleStoreForTests(dir)
  const a = upsertPerson({ name: 'alice', emails: ['a@x'], source: 'git' }, 't')
  const b = upsertPerson({ name: 'bob', emails: ['b@x'], source: 'git' }, 't')
  if (a.ok) { activatePerson(a.person.id, 't'); p1 = a.person.id }
  if (b.ok) { activatePerson(b.person.id, 't'); p2 = b.person.id }
  const r = registerIdentity({ name: 'worker', kind: 'agent', owner: 'team', toolAllowlist: [] }, 't')
  if (r.ok) unitId = r.identity.id
})

afterEach(() => {
  _usePeopleStoreForTests(null)
  delete process.env.AGENT_IDENTITY_STORE
  process.env.AGENT_IDENTITY_NO_EVENTS = '0'
  rmSync(dir, { recursive: true, force: true })
})

describe('identity card + lifecycle', () => {
  it('已有身份无卡时缺口可见且按 registered', () => {
    const view = getCardView(unitId)
    expect(view?.stage).toBe('registered')
    expect(view?.gaps.length).toBeGreaterThan(0)
  })

  it('完整卡无缺口，可准入并运行', () => {
    expect(updateResponsibilityCard(unitId, card(p1), 't').ok).toBe(true)
    expect(getCardView(unitId)?.gaps).toEqual([])
    expect(transitionIdentity(unitId, { to: 'admitted', by: p1, reason: '卡与准入证据齐备' }, 't').ok).toBe(true)
    expect(transitionIdentity(unitId, { to: 'running', by: p1, reason: '启动' }, 't').ok).toBe(true)
    expect(getCardView(unitId)?.stage).toBe('running')
  })

  it('主责任人变更强制进入 changing', () => {
    expect(updateResponsibilityCard(unitId, card(p1), 't').ok).toBe(true)
    expect(transitionIdentity(unitId, { to: 'admitted', by: p1, reason: 'ok' }, 't').ok).toBe(true)
    expect(transitionIdentity(unitId, { to: 'running', by: p1, reason: 'ok' }, 't').ok).toBe(true)
    expect(updateResponsibilityCard(unitId, card(p2), 't').ok).toBe(true)
    expect(getCardView(unitId)?.stage).toBe('changing')
  })

  it('非法迁移被拒（running 不能回 admitted）', () => {
    updateResponsibilityCard(unitId, card(p1), 't')
    transitionIdentity(unitId, { to: 'admitted', by: p1, reason: 'ok' }, 't')
    transitionIdentity(unitId, { to: 'running', by: p1, reason: 'ok' }, 't')
    const r = transitionIdentity(unitId, { to: 'admitted', by: p1, reason: '回退' }, 't')
    expect(r.ok).toBe(false)
  })

  it('高风险未登记复核人不可准入', () => {
    const c = { ...card(p1), riskTier: 'high' as const }
    expect(updateResponsibilityCard(unitId, c, 't').ok).toBe(false)
  })
})
