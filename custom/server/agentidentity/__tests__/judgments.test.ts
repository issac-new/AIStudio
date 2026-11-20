import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _useJudgmentStoreForTests, appendContributionReview, appendJudgment, listContributionReviews, listJudgments } from '../judgments'
import type { Person } from '../people'

const people: Person[] = [{ id: 'p-1', name: 'alice', emails: [], active: true, source: 'manual', createdAt: 1 }]
let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'judg-')); _useJudgmentStoreForTests(dir) })
afterEach(() => { _useJudgmentStoreForTests(null); rmSync(dir, { recursive: true, force: true }) })

describe('judgment records', () => {
  it('正常署名记录', () => {
    const r = appendJudgment({ unitId: 'aid-1', kind: 'acceptance', subjectRef: 'card-1', rationale: '复核了三条边界用例，结论正确，并核对了数据与权限评估', evidenceRefs: ['ev-1'] }, 'p-1', people)
    expect(r.ok).toBe(true)
    expect(listJudgments('aid-1')).toHaveLength(1)
    if (r.ok) expect(r.record.source).toBe('human-entry')
  })

  it('理由不足 20 字拒绝', () => {
    expect(appendJudgment({ unitId: 'aid-1', kind: 'acceptance', subjectRef: 'x', rationale: '太短', evidenceRefs: [] }, 'p-1', people).ok).toBe(false)
  })

  it('非在岗自然人拒绝', () => {
    expect(appendJudgment({ unitId: 'aid-1', kind: 'override', subjectRef: 'x', rationale: '业务方绕过审批扩大场景，依责任卡升级条件行使推翻权并留痕', evidenceRefs: [] }, 'p-x', people).ok).toBe(false)
  })

  it('subjectRef 必填', () => {
    expect(appendJudgment({ unitId: 'aid-1', kind: 'rejection', subjectRef: ' ', rationale: '打回原因：交付物未覆盖边界情况，要求补充用例后重交', evidenceRefs: [] }, 'p-1', people).ok).toBe(false)
  })

  it('append-only：再次追加不覆盖首条', () => {
    appendJudgment({ unitId: 'aid-2', kind: 'escalation', subjectRef: 'a', rationale: '第一条升级理由：关键规则无法验证，按升级条件上报值班负责人', evidenceRefs: [] }, 'p-1', people)
    appendJudgment({ unitId: 'aid-2', kind: 'pause', subjectRef: 'b', rationale: '第二条暂停理由：出现越权调用，按暂停条件立即停止并撤权', evidenceRefs: [] }, 'p-1', people)
    expect(listJudgments('aid-2')).toHaveLength(2)
  })
})

// ---- 批三 T5：contribution_review 判别联合（spec 2026-11-21 批三 §五） ----

/** 贡献评审所需的合同最小面（owner/verifier 判权＋outcomeId 锚定）。 */
const reviewContract = { outcomeId: 'oc-r1', ownerPersonId: 'p-1', verificationOwnerId: 'p-2' }
/** 在岗自然人集合：owner p-1、verifier p-2、第三人 p-3；p-4 名单在册但停用。 */
const activeIds = new Set(['p-1', 'p-2', 'p-3'])

const reviewInput = (patch: Record<string, unknown> = {}) => ({
  signedBy: 'p-1',
  subject: { subjectKind: 'person', subjectId: 'p-3' },
  assessment: 'effective',
  rationale: '复核人在观察期独立核验了指标口径与证据链，贡献判定为有效。',
  evidenceRefs: ['evidence://task-9/1'],
  ...patch,
})

describe('contribution_review 判别联合（批三 T5）', () => {
  it('判别读写旧兼容：旧六 kind 与 contribution_review 同账共存；unitId 过滤只命中旧形态；listContributionReviews 按 outcomeId 反查', () => {
    const legacy = appendJudgment({ unitId: 'aid-9', kind: 'acceptance', subjectRef: 'card-9', rationale: '旧形态照常写入：复核边界用例通过并核对数据与权限', evidenceRefs: ['ev-9'] }, 'p-1', people)
    expect(legacy.ok).toBe(true)
    const r = appendContributionReview(reviewInput(), reviewContract, activeIds)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.record.kind).toBe('contribution_review')
    expect(r.record.outcomeId).toBe('oc-r1')
    expect(r.record.subject).toEqual({ subjectKind: 'person', subjectId: 'p-3' })
    expect(r.record.assessment).toBe('effective')
    expect(r.record.source).toBe('human-entry')
    expect(r.record.signedBy).toBe('p-1')
    expect('unitId' in r.record).toBe(false) // 新形态免 unitId

    // 同账共存：全量两行；unitId 过滤只命中旧形态（新形态无 unitId 不混入）
    const all = listJudgments()
    expect(all).toHaveLength(2)
    expect(listJudgments('aid-9')).toHaveLength(1)
    expect(listJudgments('aid-9')[0].kind).toBe('acceptance')
    expect(listContributionReviews('oc-r1')).toEqual([r.record])
    expect(listContributionReviews('oc-other')).toEqual([])
  })

  it('签署人必须是合同 owner/verifier 且 active：第三人拒、名单外拒、停用的 owner 拒', () => {
    // 第三人（在岗但不在合同责任位）
    const third = appendContributionReview(reviewInput({ signedBy: 'p-3' }), reviewContract, activeIds)
    expect(third.ok).toBe(false)
    expect(third.problems?.join()).toContain('owner')
    // 名单外
    expect(appendContributionReview(reviewInput({ signedBy: 'p-x' }), reviewContract, activeIds).ok).toBe(false)
    // owner 在册但停用（activeIds 不含 p-4）
    const inactive = appendContributionReview(
      reviewInput({ signedBy: 'p-4' }),
      { ...reviewContract, ownerPersonId: 'p-4' },
      activeIds,
    )
    expect(inactive.ok).toBe(false)
    expect(inactive.problems?.join()).toContain('在岗')
    expect(listContributionReviews('oc-r1')).toEqual([]) // 全拒收：零落账
  })

  it('person 自评拒：subjectKind=person 且 subjectId=签署人', () => {
    const self = appendContributionReview(reviewInput({ subject: { subjectKind: 'person', subjectId: 'p-1' } }), reviewContract, activeIds)
    expect(self.ok).toBe(false)
    expect(self.problems?.join()).toContain('自评')
    // agent/team 主体同 id 不触发自评门
    const agentSelf = appendContributionReview(reviewInput({ subject: { subjectKind: 'agent', subjectId: 'p-1' } }), reviewContract, activeIds)
    expect(agentSelf.ok).toBe(true)
  })

  it('字段校验：rationale<20 字、evidenceRefs 空、assessment 非法、subjectKind 非法、subjectId 空各拒', () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['rationale 过短', reviewInput({ rationale: '太短' }), 'rationale'],
      ['evidenceRefs 空', reviewInput({ evidenceRefs: [] }), 'evidenceRefs'],
      ['assessment 非法', reviewInput({ assessment: 'great' }), 'assessment'],
      ['subjectKind 非法', reviewInput({ subject: { subjectKind: 'robot', subjectId: 'p-3' } }), 'subjectKind'],
      ['subjectId 空', reviewInput({ subject: { subjectKind: 'team', subjectId: ' ' } }), 'subjectId'],
    ]
    for (const [label, input, keyword] of cases) {
      const r = appendContributionReview(input as never, reviewContract, activeIds)
      expect(r.ok, label).toBe(false)
      expect(r.problems?.join(), label).toContain(keyword)
    }
    expect(listContributionReviews('oc-r1')).toEqual([]) // 全拒收：零落账
  })

  it('幂等 reviewId：重复追加返回已有记录不新增行（重放值不同也不覆盖）', () => {
    const first = appendContributionReview(reviewInput({ reviewId: 'rev-1' }), reviewContract, activeIds)
    expect(first.ok).toBe(true)
    const replay = appendContributionReview(
      reviewInput({ reviewId: 'rev-1', assessment: 'ineffective', rationale: '重放携带不同值也不得覆盖首条评审记录内容' }),
      reviewContract,
      activeIds,
    )
    expect(replay.ok).toBe(true)
    expect(replay.replayed).toBe(true)
    expect(replay.record).toEqual(first.record)
    expect(listContributionReviews('oc-r1')).toEqual([first.record]) // 账上仍只有一条
  })
})
