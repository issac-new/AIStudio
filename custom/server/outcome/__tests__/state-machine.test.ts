// outcome 状态机与重开语义测试（spec 2026-11-19-ai-native-operating-model-design.md
// §3.2；Task 3）。迁移表/守卫/错误码逐字来自任务简报。
import { describe, expect, it } from 'vitest'
import { applyReopen, transitionGuards } from '../state-machine'
import type { OutcomeContract, OutcomeStatus } from '../types'

/** 合法最小合同（Task 1 validate.test 同款），status 可变以构造各态。 */
const at = (status: OutcomeStatus): OutcomeContract => ({
  schemaVersion: 1,
  outcomeId: 'oc-1',
  rootTaskId: 'task-1',
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
  status,
  createdAt: 1,
  updatedAt: 1,
})

describe('transitionGuards 合法迁移路径', () => {
  it('draft→active：合同过 Task 1 校验即放行（allTasksTerminal 与此边无关）', () => {
    expect(transitionGuards(at('draft'), 'active', { allTasksTerminal: false })).toEqual({ ok: true })
  })

  it('active→observing：allTasksTerminal=true 放行', () => {
    expect(transitionGuards(at('active'), 'observing', { allTasksTerminal: true })).toEqual({
      ok: true,
    })
  })

  it('draft/active/observing→cancelled：reason 非空放行', () => {
    for (const from of ['draft', 'active', 'observing'] as const) {
      expect(
        transitionGuards(at(from), 'cancelled', { allTasksTerminal: false, reason: '需求取消' }),
      ).toEqual({ ok: true })
    }
  })
})

describe('transitionGuards 拒绝路径', () => {
  it('draft 缺 measure（且无验收陈述）阻断 active，problems 透传 Task 1 校验器', () => {
    const bare: OutcomeContract = {
      ...at('draft'),
      measures: [],
      acceptance: { statements: [], requiredEvidenceKinds: [] },
    }
    const r = transitionGuards(bare, 'active', { allTasksTerminal: false })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.problems.join()).toContain('同时为空')
      expect(r.code).toBe('invalid_contract')
    }
  })

  it('active→observing 带 allTasksTerminal=false 拒（code tasks_unfinished）', () => {
    const r = transitionGuards(at('active'), 'observing', { allTasksTerminal: false })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('tasks_unfinished')
  })

  it('observing→settled 仅经结算端点（code needs_settlement）', () => {
    const r = transitionGuards(at('observing'), 'settled', { allTasksTerminal: true })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('needs_settlement')
  })

  it('settled→任意拒（code settled_terminal；重开走 applyReopen）', () => {
    for (const to of ['draft', 'active', 'observing', 'settled', 'cancelled'] as const) {
      const r = transitionGuards(at('settled'), to, { allTasksTerminal: true, reason: '任意理由' })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.code).toBe('settled_terminal')
    }
  })

  it('cancelled→任意拒（终态无出边）', () => {
    for (const to of ['draft', 'active', 'observing', 'settled', 'cancelled'] as const) {
      const r = transitionGuards(at('cancelled'), to, { allTasksTerminal: true, reason: '理由' })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.code).toBe('cancelled_terminal')
    }
  })

  it('→cancelled 的 reason 空/空白/缺省拒（reason_required）', () => {
    for (const reason of [undefined, '', '   ']) {
      const r = transitionGuards(at('active'), 'cancelled', { allTasksTerminal: false, reason })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.code).toBe('reason_required')
    }
  })

  it('迁移表外路径拒（跳级/逆行/自迁移/未知目标态均 illegal_transition）', () => {
    const cases: ReadonlyArray<readonly [OutcomeStatus, OutcomeStatus]> = [
      ['draft', 'observing'],
      ['draft', 'settled'],
      ['active', 'draft'],
      ['observing', 'active'], // observing→active 只走 applyReopen，不经迁移表
      ['observing', 'draft'],
      ['active', 'active'],
      ['draft', 'draft'],
      // 'done' 不在 OUTCOME_STATUSES 内，as 收窄类型以保留「未知目标态拒」的用例意图
      ['active', 'done' as OutcomeStatus],
    ]
    for (const [from, to] of cases) {
      const r = transitionGuards(at(from), to, { allTasksTerminal: true, reason: '理由' })
      expect(r.ok, `${from}->${to}`).toBe(false)
      if (!r.ok) expect(r.code, `${from}->${to}`).toBe('illegal_transition')
    }
  })

  it('guards 缺省按 fail-closed 拒（视为任务未终结）', () => {
    const r = transitionGuards(at('active'), 'observing', undefined as unknown as {
      allTasksTerminal: boolean
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('tasks_unfinished')
  })

  it('合同对象缺 status 拒（防御输入，不抛异常）', () => {
    const broken = {} as OutcomeContract
    const r = transitionGuards(broken, 'active', { allTasksTerminal: false })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problems.length).toBeGreaterThan(0)
  })
})

describe('applyReopen 重开语义', () => {
  it('settled→active 且返回被取代结算 id；返回新对象、入参不被就地修改', () => {
    const settled = at('settled')
    const r = applyReopen(settled, 'settle-7')
    expect(r).not.toBeNull()
    expect(r?.contract.status).toBe('active')
    expect(r?.contract).not.toBe(settled)
    expect(settled.status).toBe('settled')
    expect(r?.supersededSettlementId).toBe('settle-7')
    // 纯函数无时间依赖：时间戳由调用方注入，本函数不改 updatedAt/version
    expect(r?.contract.updatedAt).toBe(settled.updatedAt)
    expect(r?.contract.version).toBe(settled.version)
  })

  it('observing→active 同样生效（根任务重开退回执行态）', () => {
    const r = applyReopen(at('observing'), 'settle-3')
    expect(r?.contract.status).toBe('active')
    expect(r?.supersededSettlementId).toBe('settle-3')
  })

  it('非重开态（draft/active/cancelled）返回 null', () => {
    for (const from of ['draft', 'active', 'cancelled'] as const) {
      expect(applyReopen(at(from), 'settle-7')).toBeNull()
    }
  })
})
