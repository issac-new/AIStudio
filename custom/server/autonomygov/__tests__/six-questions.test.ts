// 六问完成判据：unknown 必须带 gap；不产出任何排序/评分字段。
import { describe, expect, it } from 'vitest'
import { sixQuestions } from '../six-questions'
import type { Person } from '../../agentidentity/people'
import type { ResponsibilityCard } from '../../agentidentity/responsibility'

const people: Person[] = [
  { id: 'p-1', name: 'alice', emails: [], active: true, source: 'manual', createdAt: 1 },
]
const card: ResponsibilityCard = {
  deliveryStandard: 'x', riskTier: 'low', primaryOwner: 'p-1',
  escalation: ['e'], pauseConditions: ['p'], takerOver: 'p-1',
  testCaseVersion: 'tc', costBudget: { limit: 1, unit: 'u' }, maintainer: 'p-1', deploymentLocation: 'loc',
}

describe('sixQuestions', () => {
  it('全空数据面：q1/q2 unknown 带 gap，q6 no，q3/q5 固定 unknown', () => {
    const out = sixQuestions({})
    expect(out.map((a) => a.id)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5', 'q6'])
    for (const a of out) {
      if (a.answer === 'unknown') expect(a.gap, `${a.id} unknown 必须带 gap`).toBeTruthy()
    }
    expect(out.find((a) => a.id === 'q6')?.answer).toBe('no')
    expect(out.find((a) => a.id === 'q3')?.gap).toContain('净贡献')
    expect(out.find((a) => a.id === 'q5')?.gap).toContain('基线')
  })

  it('齐备数据面：q1/q2/q4/q6 全 yes', () => {
    const out = sixQuestions({
      decisions: [
        { id: 'd1', category: 'x', scenario: null, outcome: 'approved', confidence: 1, decidedBy: 'p-1', stage: 'design' },
      ] as never,
      identities: [
        { id: 'aid-1', name: 'u', owner: 'o', responsibilityCard: card } as never,
      ],
      people,
      judgments: [
        { id: 'j1', unitId: 'aid-1', kind: 'acceptance', subjectRef: 's', rationale: 'r', evidenceRefs: [], signedBy: 'p-1', signedAt: 1, source: 'human-entry' },
      ],
      evalRuns: [
        { attempts: [{ judgeMeta: { outputStability: { rounds: 2, checked: 10, flips: 0 } } }] } as never,
      ],
    })
    const by = Object.fromEntries(out.map((a) => [a.id, a.answer]))
    expect(by).toEqual({ q1: 'yes', q2: 'yes', q3: 'unknown', q4: 'yes', q5: 'unknown', q6: 'yes' })
  })

  it('无主单元 q2=no 且列出名字', () => {
    const out = sixQuestions({
      identities: [{ id: 'aid-1', name: 'orphan-unit', owner: 'o' } as never],
      people,
    })
    const q2 = out.find((a) => a.id === 'q2')!
    expect(q2.answer).toBe('no')
    expect(q2.gap).toContain('orphan-unit')
  })

  it('结果不含排序、评分、权重字段', () => {
    const raw = JSON.stringify(sixQuestions({}))
    expect(raw).not.toMatch(/score|rank|weight|rating/i)
  })
})
