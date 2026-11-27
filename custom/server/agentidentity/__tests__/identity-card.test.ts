import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  _useStoreDirForTests, getCardView, registerIdentity, transitionIdentity, updateIdentity, updateResponsibilityCard,
} from '../agent-identity'
import { _usePeopleStoreForTests, activatePerson, upsertPerson } from '../people'
import { cardRevision, type ResponsibilityCard } from '../responsibility'

let dir: string
let p1 = ''
let p2 = ''
let unitId = ''

function card(primaryOwner: string, reviewer?: string, over: Partial<ResponsibilityCard> = {}): ResponsibilityCard {
  const c: ResponsibilityCard = {
    deliveryStandard: '交付可复现的测试报告与证据链',
    unitType: 'assistant',
    riskTier: 'tier2',
    primaryOwner,
    ...(reviewer ? { reviewer } : {}),
    escalation: ['关键规则无法验证时升级'],
    pauseConditions: ['出现越权调用时暂停'],
    takerOver: p2,
    testCaseVersion: 'tc-2026-11-06',
    costBudget: { limit: 100, unit: 'CNY/轮' },
    maintainer: p1,
    deploymentLocation: 'studio:8802',
    admissionEvidence: { representativeTasks: ['t1'], edgeCases: ['e1'], dataPermissionReview: ['d1'], recordedAt: Date.now() },
    ...over,
  }
  // 签署须带版本指纹（2026-11-24 批一）：指纹按卡内容实时计算，准入门才认这份签署
  c.businessOwnerSign = { signedBy: p1, signedAt: Date.now(), cardRevision: cardRevision(c), stale: false }
  return c
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ident-card-'))
  _useStoreDirForTests(dir)
  _usePeopleStoreForTests(dir)
  const a = upsertPerson({ name: 'alice', emails: ['a@x'], source: 'git' }, 't')
  const b = upsertPerson({ name: 'bob', emails: ['b@x'], source: 'git' }, 't')
  if (a.ok) { activatePerson(a.person.id, 't'); p1 = a.person.id }
  if (b.ok) { activatePerson(b.person.id, 't'); p2 = b.person.id }
  const r = registerIdentity({ name: 'worker', kind: 'agent', owner: 'team', toolAllowlist: ['read_file'],
    capabilityBoundary: { can: ['读文件'], cannot: ['改生产配置'] }, auditRequirement: { sampling: 0.1, retentionDays: 30 } }, 't')
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

  it('完整卡无缺口，可准入并运行；每次迁移追加一条历史、不丢既有历史', () => {
    expect(updateResponsibilityCard(unitId, card(p1), 't').ok).toBe(true)
    expect(getCardView(unitId)?.gaps).toEqual([])
    expect(transitionIdentity(unitId, { to: 'admitted', by: p1, reason: '卡与准入证据齐备' }, 't').ok).toBe(true)
    expect(getCardView(unitId)?.lifecycle.history.length).toBe(1)
    expect(transitionIdentity(unitId, { to: 'running', by: p1, reason: '启动' }, 't').ok).toBe(true)
    expect(getCardView(unitId)?.stage).toBe('running')
    // 历史是追加的：第二条迁移后仍有两条（若迁移时把历史回落成空，这里会是 1）
    expect(getCardView(unitId)?.lifecycle.history.map((e) => e.to)).toEqual(['admitted', 'running'])
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

  it('顶岗型未登记复核人不可保存；未声明类型不可保存', () => {
    const { unitType: _omit, ...noType } = card(p1)
    expect(updateResponsibilityCard(unitId, noType as ResponsibilityCard, 't').ok).toBe(false)
    expect(updateResponsibilityCard(unitId, { ...card(p1), unitType: 'post' }, 't').ok).toBe(false)
    expect(updateResponsibilityCard(unitId, { ...card(p1), unitType: 'post', reviewer: p2 }, 't').ok).toBe(true)
  })
})

describe('协作等级 5 的上下文由 IO 层自动读出（落盘路径）', () => {
  const scaleDir = () => join(dir, 'autonomy-gov')
  function writeAl5(ok: boolean): void {
    // 直接落一条自治刻度配置到隔离目录：ok=true 时判定通过（抽样审计 > 0 且有人工扫描）
    mkdirSync(scaleDir(), { recursive: true })
    const fs = require('node:fs') as typeof import('node:fs')
    fs.writeFileSync(join(scaleDir(), 'scale.json'), JSON.stringify({ entries: [{
      target: 'worker', al: 5, dod: { criteria: ['c'], sample: 's', stopCondition: 'sc' },
      auditSampling: ok ? 0.2 : 0, humanScan: ok, reviewedAt: 1,
    }] }))
  }

  it('无 AL5 配置：等级 5 的卡无法保存；有配置后可保存、可准入（transitionIdentity 不需另传上下文）', () => {
    process.env.HERMES_AUTONOMY_GOV_DIR = scaleDir()
    try {
      const lv5 = card(p1, undefined, { collabLevel: 5 })
      // 域层直接调用不传上下文 → 拒绝（上下文由 HTTP 层注入；此处验证的是随后的落盘路径）
      expect(updateResponsibilityCard(unitId, lv5, 't', { al5Configured: false }).ok).toBe(false)
      expect(updateResponsibilityCard(unitId, lv5, 't', { al5Configured: true }).ok).toBe(true)
      writeAl5(true)
      // 关键：准入走真实 transitionIdentity，不另传上下文——IO 层须自己读出 AL5 配置
      const r = transitionIdentity(unitId, { to: 'admitted', by: p1, reason: '准入' }, 't')
      expect(r.problems).toEqual([])
      expect(getCardView(unitId)?.gaps).toEqual([])
    } finally {
      delete process.env.HERMES_AUTONOMY_GOV_DIR
      rmSync(scaleDir(), { recursive: true, force: true })
    }
  })

  it('AL5 配置判定不通过（无抽样审计）：已保存的等级 5 单元准入被拒', () => {
    process.env.HERMES_AUTONOMY_GOV_DIR = scaleDir()
    try {
      expect(updateResponsibilityCard(unitId, card(p1, undefined, { collabLevel: 5 }), 't', { al5Configured: true }).ok).toBe(true)
      writeAl5(false)
      const r = transitionIdentity(unitId, { to: 'admitted', by: p1, reason: '准入' }, 't')
      expect(r.ok).toBe(false)
      expect(r.problems.join()).toContain('自治刻度')
    } finally {
      delete process.env.HERMES_AUTONOMY_GOV_DIR
      rmSync(scaleDir(), { recursive: true, force: true })
    }
  })
})

describe('卡片视图透出类型／风险档／协作等级／就绪度（供台账界面使用）', () => {
  it('无卡单元：四项读数均如实为空或未知，不装绿', () => {
    const v = getCardView(unitId)
    expect(v?.unitType).toBeNull()
    expect(v?.riskTier).toBeNull()
    expect(v?.collabLevel).toBeNull()
    for (const r of v?.readiness ?? []) {
      expect(r.state).not.toBe('yes')
      if (r.state !== 'yes') expect(r.gap).toBeTruthy()
    }
    expect(v?.readiness.map((r) => r.id)).toEqual(['net-contribution', 'correction-channel', 'discretion', 'reliability', 'case-maintenance'])
  })

  it('有卡单元：三项读数取自卡；净贡献恒未知，用例维护因有用例版本而就绪', () => {
    expect(updateResponsibilityCard(unitId, card(p1), 't').ok).toBe(true)
    const v = getCardView(unitId)
    expect(v?.unitType).toBe('assistant')
    expect(v?.riskTier).toBe('tier2')
    expect(v?.collabLevel).toBeNull()
    for (const r of v?.readiness ?? []) {
      if (r.state !== 'yes') expect(r.gap).toBeTruthy()
    }
    expect(v?.readiness.find((r) => r.id === 'net-contribution')).toMatchObject({ state: 'unknown' })
    expect(v?.readiness.find((r) => r.id === 'case-maintenance')).toMatchObject({ state: 'yes' })
  })

  it('存量旧风险档取值在视图里归一为三级，卡面原值不改写（新保存拒旧值，旧数据只能来自存量）', () => {
    // 新保存拒旧值——不给「允许旧值」开后门
    expect(updateResponsibilityCard(unitId, { ...card(p1), riskTier: 'high' as never }, 't').ok).toBe(false)
    // 模拟存量旧数据：直接改身份册文件
    expect(updateResponsibilityCard(unitId, card(p1), 't').ok).toBe(true)
    const file = join(dir, 'identities.json')
    const store = JSON.parse(readFileSync(file, 'utf8'))
    store.identities.find((i: { id: string }) => i.id === unitId).responsibilityCard.riskTier = 'high'
    writeFileSync(file, JSON.stringify(store, null, 2))
    const v = getCardView(unitId)
    expect(v?.riskTier).toBe('tier2')
    expect(v?.card?.riskTier).toBe('high')
  })
})

describe('变更前快照与扩权恢复（落盘路径）', () => {
  function toRunning(): void {
    expect(updateResponsibilityCard(unitId, card(p1), 't').ok).toBe(true)
    expect(transitionIdentity(unitId, { to: 'admitted', by: p1, reason: '准入' }, 't').ok).toBe(true)
    expect(transitionIdentity(unitId, { to: 'running', by: p1, reason: '启动' }, 't').ok).toBe(true)
  }
  const evidence = ['重新验证', '重新授权']

  it('进入变更时在生命周期事件里留下范围快照', () => {
    toRunning()
    expect(transitionIdentity(unitId, { to: 'changing', by: p1, reason: '调整' }, 't').ok).toBe(true)
    const view = getCardView(unitId)
    const last = view?.lifecycle.history.at(-1)
    expect(last?.to).toBe('changing')
    expect(last?.snapshot).toMatchObject({ toolAllowlist: ['read_file'], riskTier: 'tier2' })
  })

  it('范围未变的变更：两条证据即可恢复，不需要豁免', () => {
    toRunning()
    transitionIdentity(unitId, { to: 'changing', by: p1, reason: '调整' }, 't')
    const r = transitionIdentity(unitId, { to: 'running', by: p1, reason: '恢复', evidenceRefs: evidence }, 't')
    expect(r.problems).toEqual([])
  })

  it('主责任人变更自动转入变更态时同样留下范围快照（相邻路径不留快照会让恢复被要求豁免）', () => {
    toRunning()
    expect(updateResponsibilityCard(unitId, card(p2), 't').ok).toBe(true)
    const view = getCardView(unitId)
    expect(view?.stage).toBe('changing')
    expect(view?.lifecycle.history.at(-1)?.reason).toBe('owner-change')
    expect(view?.lifecycle.history.at(-1)?.snapshot).toMatchObject({ toolAllowlist: ['read_file'] })
    // 范围未变：两条证据即可恢复，不需要豁免
    const r = transitionIdentity(unitId, { to: 'running', by: p2, reason: '恢复', evidenceRefs: evidence }, 't')
    expect(r.problems).toEqual([])
  })

  it('变更中扩大了白名单：恢复被拒并点名扩权；带豁免理由后放行且理由随事件留存', () => {
    toRunning()
    transitionIdentity(unitId, { to: 'changing', by: p1, reason: '调整' }, 't')
    const u = updateIdentity(unitId, { toolAllowlist: ['read_file', 'bash'] }, 't')
    expect(u.ok).toBe(true)
    const refused = transitionIdentity(unitId, { to: 'running', by: p1, reason: '恢复', evidenceRefs: evidence }, 't')
    expect(refused.ok).toBe(false)
    expect(refused.problems.join()).toContain('白名单')
    const waived = transitionIdentity(
      unitId, { to: 'running', by: p1, reason: '恢复', evidenceRefs: evidence, expansionWaiver: '试点需要' }, 't',
    )
    expect(waived.problems).toEqual([])
    expect(getCardView(unitId)?.lifecycle.history.at(-1)?.expansionWaiver).toBe('试点需要')
    expect(getCardView(unitId)?.stage).toBe('running')
  })
})
