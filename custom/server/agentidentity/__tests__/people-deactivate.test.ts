// 自然人停用（数字员工批一 Task 1）：置 active=false 并记停用时间、操作者与理由，重复停用幂等。
// 停用后凡引用此人的责任卡即失效（validateCard 只认在岗自然人）；派单门按这个缺口拦截已绑定单元，
// 由批一后续任务接线，本文件只断言到责任卡失效为止。
// 夹具：_useStoreDirForTests 指向 mkdtemp（身份册与自然人名单同目录）；afterEach 清 env。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  _useStoreDirForTests, getIdentity, registerIdentity, transitionIdentity, updateResponsibilityCard,
} from '../agent-identity'
import { cardGaps, type ResponsibilityCard } from '../responsibility'
import { activatePerson, deactivatePerson, getPerson, listPeople, upsertPerson } from '../people'

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentidentity-deactivate-'))
  _useStoreDirForTests(dir)
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.AGENT_IDENTITY_STORE
  delete process.env.AGENT_IDENTITY_NO_EVENTS
})

/** 登记并启用一个自然人（id 即登录名）。 */
function seedPerson(id: string): void {
  const r = upsertPerson({ id, name: id, source: 'manual' }, 'tester')
  if (!r.ok || !r.person) throw new Error(`夹具登记失败：${id}（${r.problems.join('；')}）`)
  const a = activatePerson(r.person.id, 'tester')
  if (!a.ok) throw new Error(`夹具启用失败：${id}（${a.problems.join('；')}）`)
}

/** 缺省由 alice 主责与维护、bob 接管的有效责任卡。 */
const card = (over: Partial<ResponsibilityCard> = {}): ResponsibilityCard => ({
  deliveryStandard: '可复现', riskTier: 'medium', primaryOwner: 'alice', escalation: ['出错升级'], pauseConditions: ['出错即停'],
  takerOver: 'bob', testCaseVersion: 'tc-1', costBudget: { limit: 1, unit: 'CNY' }, maintainer: 'alice', deploymentLocation: '本机',
  ...over,
})

/** 建一个带责任卡的执行单元（已登记态），返回其 id。 */
function seedUnit(name: string, over: Partial<ResponsibilityCard> = {}): string {
  const r = registerIdentity({ name, kind: 'agent', owner: 'alice', toolAllowlist: ['read_file'] }, 'tester')
  if (!r.ok) throw new Error(`夹具登记失败：${name}（${r.problems.join('；')}）`)
  const saved = updateResponsibilityCard(r.identity.id, card(over), 'tester')
  if (!saved.ok) throw new Error(`夹具保存责任卡失败：${name}（${saved.problems.join('；')}）`)
  return r.identity.id
}

describe('deactivatePerson：自然人停用', () => {
  it('deactivatePerson 置 active=false 并记 deactivatedAt/By/Reason', async () => {
    seedPerson('alice')
    const before = Date.now()
    const r = await deactivatePerson('alice', 'ops', '离职')
    expect(r).toMatchObject({ ok: true, problems: [], referencedBy: [] })
    expect(r.person).toMatchObject({
      active: false, deactivatedAt: expect.any(Number), deactivatedBy: 'ops', deactivatedReason: '离职',
    })
    expect(r.person?.deactivatedAt).toBeGreaterThanOrEqual(before)
    // 落盘，且不再是在岗自然人
    expect(getPerson('alice')).toMatchObject({ active: false, deactivatedBy: 'ops', deactivatedReason: '离职' })
    expect(listPeople().filter((p) => p.active).map((p) => p.id)).toEqual([])
  })

  it('重复停用幂等：第二次 ok 且不报错', async () => {
    seedPerson('alice')
    const first = await deactivatePerson('alice', 'ops', '离职')
    expect(first.ok).toBe(true)
    expect(first.person).toMatchObject({ active: false, deactivatedBy: 'ops', deactivatedReason: '离职' })
    // 换操作者与理由重放：停用记录保持首次那次，不被改写
    const second = await deactivatePerson('alice', 'mallory', '另一个理由')
    expect(second).toMatchObject({ ok: true, problems: [] })
    expect(second.person).toEqual(first.person)
    expect(getPerson('alice')).toEqual(first.person)
  })

  it('停用不存在的自然人 → ok=false', async () => {
    const r = await deactivatePerson('nobody', 'ops', '离职')
    expect(r.ok).toBe(false)
    expect(r.problems.join()).toContain('自然人不存在')
    expect(r.person).toBeUndefined()
    expect(r.referencedBy).toEqual([])
  })

  it('referencedBy 列出仍引用此人的未退役单元', async () => {
    seedPerson('alice')
    seedPerson('bob')
    // alice 是 unit-a 的 primaryOwner（兼 maintainer）
    const unitA = seedUnit('unit-a')
    const r = await deactivatePerson('alice', 'ops', '离职')
    expect(r.ok).toBe(true)
    expect(r.referencedBy).toContainEqual({ id: unitA, name: 'unit-a', stage: 'registered' })
  })

  it('已退役单元不计入 referencedBy', async () => {
    seedPerson('alice')
    seedPerson('bob')
    const unitA = seedUnit('unit-a')
    const unitB = seedUnit('unit-b', { primaryOwner: 'bob', maintainer: 'alice' })
    const retired = transitionIdentity(unitB, {
      to: 'retired', by: 'bob', reason: '单元下线',
      exit: { kind: 'decommission', items: ['交接完成'], confirmedBy: 'bob' },
    }, 'tester')
    expect(retired.ok).toBe(true)
    const r = await deactivatePerson('alice', 'ops', '离职')
    expect(r.ok).toBe(true)
    expect(r.referencedBy).toEqual([{ id: unitA, name: 'unit-a', stage: 'registered' }])
  })

  it('复核人、接管人、维护人命中同样列出；同一单元兼任多职只列一次', async () => {
    seedPerson('alice')
    seedPerson('bob')
    const asOwner = seedUnit('unit-owner', { maintainer: 'bob' })
    const asReviewer = seedUnit('unit-reviewer', { primaryOwner: 'bob', reviewer: 'alice', maintainer: 'bob' })
    const asTaker = seedUnit('unit-taker', { primaryOwner: 'bob', maintainer: 'bob', takerOver: 'alice' })
    const asMaintainer = seedUnit('unit-maintainer', { primaryOwner: 'bob', takerOver: 'bob' })
    const twice = seedUnit('unit-both')
    seedUnit('unit-none', { primaryOwner: 'bob', takerOver: 'bob', maintainer: 'bob' })
    const r = await deactivatePerson('alice', 'ops', '离职')
    expect(r.ok).toBe(true)
    expect(r.referencedBy.map((u) => u.id).sort())
      .toEqual([asOwner, asReviewer, asTaker, asMaintainer, twice].sort())
  })

  it('停用后引用此人的责任卡即失效（派单门按此缺口拦截）', async () => {
    seedPerson('alice')
    seedPerson('bob')
    const unitA = seedUnit('unit-a')
    expect(cardGaps(getIdentity(unitA)?.responsibilityCard, listPeople())).toEqual([])
    await deactivatePerson('alice', 'ops', '离职')
    const gaps = cardGaps(getIdentity(unitA)?.responsibilityCard, listPeople())
    expect(gaps.map((g) => g.detail)).toContain('primaryOwner 必须是在岗自然人')
  })

  it('从未启用过的人首次被停用也落停用记录', async () => {
    const made = upsertPerson({ id: 'carol', name: 'carol', source: 'git' }, 'tester')
    expect(made.ok).toBe(true)
    const r = await deactivatePerson('carol', 'ops', '清理')
    expect(r.ok).toBe(true)
    expect(r.person).toMatchObject({
      active: false, deactivatedAt: expect.any(Number), deactivatedBy: 'ops', deactivatedReason: '清理',
    })
  })

  it('重新启用后再次停用会刷新停用记录', async () => {
    seedPerson('alice')
    await deactivatePerson('alice', 'ops', '离职')
    expect(activatePerson('alice', 'tester').ok).toBe(true)
    const again = await deactivatePerson('alice', 'ops2', '二次离职')
    expect(again.person).toMatchObject({ active: false, deactivatedBy: 'ops2', deactivatedReason: '二次离职' })
    expect(getPerson('alice')).toMatchObject({ active: false, deactivatedBy: 'ops2' })
  })
})
