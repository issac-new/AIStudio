// 批四 T3 接线守门（spec 2026-11-21-ai-native-orgworkbench-batch4.md §三）：
// confirmTeam 权威写（team_confirmed 事件＋team.json）成功 → 决策图谱 recordTeamDecision
// 被调（统一决策引用）；确认未生效（校验失败/版本冲突）不落账；recorder 抛异常不阻断
// 确认主链路（fire-and-forget）。
// mock 模式照 autonomy-ladder 先例：vi.hoisted + vi.mock 拦截 decision-recorder。
// 合同/团队夹具与 outcome-store.test.ts 同款基底（本域测试文件各自持夹具的既有约定）。
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ConfirmTeamInput, CreateContractInput, _useOutcomeStoreForTests, confirmTeam, createContract,
} from '../outcome-store'

const recordTeamDecision = vi.hoisted(() => vi.fn())
vi.mock('../../decisiongraph/decision-recorder', () => ({ recordTeamDecision }))

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'outcome-dg-'))
  _useOutcomeStoreForTests(dir)
  recordTeamDecision.mockReset()
})

afterAll(() => {
  _useOutcomeStoreForTests(null)
  rmSync(dir, { recursive: true, force: true })
})

/** 合法最小合同（outcome-store.test.ts 同款基底：1 measure＋owner/verifier 分离）。 */
function makeContract(outcomeId: string, rootTaskId: string): CreateContractInput {
  return {
    schemaVersion: 1,
    outcomeId,
    rootTaskId,
    version: 1,
    title: '发布事故率下降',
    valueStatement: '降低发布流程引发的生产事故',
    ownerPersonId: 'p-1',
    measures: [
      {
        measureId: 'm-1',
        name: '发布事故数',
        definition: '滚动 30 天内由发布直接引发的故障次数',
        unit: '次',
        operator: 'lte',
        baseline: null,
        target: 0,
        sourceRef: 'incidents://release',
      },
    ],
    acceptance: { statements: [], requiredEvidenceKinds: [] },
    scope: { included: ['发布流程'], excluded: [] },
    riskTier: 'medium',
    defaultReversibility: 'reversible',
    verificationOwnerId: 'p-2',
    contextPolicy: { allowedScopes: ['project'], excludedSourceKinds: [] },
    learningOptIn: false,
    status: 'draft',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  }
}

/** 合法最小团队输入（owner/verifier 两个 person 成员）。 */
function makeTeamInput(expectedVersion: number, patch: Record<string, unknown> = {}): ConfirmTeamInput {
  return {
    expectedVersion,
    members: [
      { subjectKind: 'person', subjectId: 'p-1', role: 'accountable', responsibility: '对结果指标负责' },
      { subjectKind: 'person', subjectId: 'p-2', role: 'reviewer', responsibility: '独立复核' },
    ],
    status: 'active',
    changeReason: '初始成队',
    ...patch,
  } as ConfirmTeamInput
}

describe('confirmTeam → 决策图谱接线（批四 T3）', () => {
  it('确认成功 → recorder 被调，入参带 version/changeReason/updatedBy；每版本确认独立落账', () => {
    createContract(makeContract('oc-1', 'task-1'), 'p-1')
    const first = confirmTeam('oc-1', makeTeamInput(0), 'p-1')
    expect(first.ok).toBe(true)
    expect(recordTeamDecision).toHaveBeenCalledTimes(1)
    expect(recordTeamDecision).toHaveBeenCalledWith({
      outcomeId: 'oc-1', version: 1, changeReason: '初始成队', updatedBy: 'p-1',
    })

    const second = confirmTeam('oc-1', makeTeamInput(1, { changeReason: '补充执行 agent' }), 'p-9')
    expect(second.ok).toBe(true)
    expect(recordTeamDecision).toHaveBeenCalledTimes(2)
    expect(recordTeamDecision).toHaveBeenLastCalledWith({
      outcomeId: 'oc-1', version: 2, changeReason: '补充执行 agent', updatedBy: 'p-9',
    })
  })

  it('确认未生效不落账：invalid_input 与 version_conflict 均 → recorder 不被调', () => {
    createContract(makeContract('oc-1', 'task-1'), 'p-1')
    const bad = confirmTeam('oc-1', makeTeamInput(0, { changeReason: '' }), 'p-1')
    expect(bad.ok).toBe(false)
    const conflict = confirmTeam('oc-1', makeTeamInput(7), 'p-1')
    expect(conflict.code).toBe('version_conflict')
    expect(recordTeamDecision).not.toHaveBeenCalled()
  })

  it('recorder 抛异常 → 确认主链路不受影响（fire-and-forget：ok:true 且 team.json 照常落盘）', () => {
    recordTeamDecision.mockImplementation(() => { throw new Error('KG bridge down') })
    createContract(makeContract('oc-2', 'task-2'), 'p-1')
    const r = confirmTeam('oc-2', makeTeamInput(0), 'p-1')
    expect(r.ok).toBe(true)
    expect(r.team?.version).toBe(1)
  })
})
