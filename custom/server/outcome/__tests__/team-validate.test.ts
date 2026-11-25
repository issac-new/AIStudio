// OutcomeTeam 约束校验纯函数测试（批三 T1；spec 2026-11-21-ai-native-orgworkbench-batch3.md §一、决策 D5/D8）。
// 负面全集：高风险同人 / inactive person / roster blocked agent / owner 缺席 / 成员空 / draft 语义。
// activePersonIds 与 rosterOk 全部注入，不依赖真名册与真 outcome 存储（纯函数边界）。
import { describe, expect, it } from 'vitest'
import { validateTeam } from '../team-validate'
import type { TeamContractFacts } from '../team-validate'
import { UNIT_GATE_REASON, DISPATCH_REASON_CODES } from '../../zcode/dispatch-reasons'

const baseContract: TeamContractFacts = {
  ownerPersonId: 'p-1',
  verificationOwnerId: 'p-2',
  riskTier: 'medium',
}

const active = new Set(['p-1', 'p-2', 'p-3'])
/** rosterOk 注入：ag-ok-* 视为 rosterStatus=complete，其余 blocked。 */
const rosterOk = (id: string): boolean => id.startsWith('ag-ok')

/** 合法成员骨架：默认 owner 本人的 person 成员（D8：责任语义由成员 role 承载）。 */
const member = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  subjectKind: 'person',
  subjectId: 'p-1',
  role: 'accountable',
  responsibility: '对结果指标负责',
  ...patch,
})

/** 合法最小团队：owner＋verifier 两名 person 成员。 */
const validTeam = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  status: 'active',
  members: [member(), member({ subjectId: 'p-2', role: 'reviewer', responsibility: '独立复核' })],
  ...patch,
})

describe('validateTeam 合法面', () => {
  it('owner/verifier 各有对应 person 成员＋agent 成员 roster complete → 通过', () => {
    const team = validTeam({
      members: [
        member(),
        member({ subjectId: 'p-2', role: 'reviewer', responsibility: '独立复核' }),
        member({ subjectKind: 'agent', subjectId: 'ag-ok-1', role: 'executor', responsibility: '执行发布' }),
      ],
    })
    expect(validateTeam(baseContract, team, active, rosterOk).problems).toEqual([])
  })

  it('合同无 verifier（空串防御分支）时不要求 verifier 成员', () => {
    const noVerifier = { ...baseContract, verificationOwnerId: '' }
    expect(validateTeam(noVerifier, validTeam({ members: [member()] }), active, rosterOk).problems).toEqual([])
  })

  it('draft 提案适用同一套约束：结构合法的 draft 通过（status 不是本函数职责）', () => {
    expect(validateTeam(baseContract, validTeam({ status: 'draft' }), active, rosterOk).problems).toEqual([])
  })
})

describe('validateTeam 负面全集', () => {
  it('owner 缺席：无 subjectId=ownerPersonId 的 person 成员 → 拒（点名责任人）', () => {
    const team = validTeam({
      members: [member({ subjectId: 'p-2', role: 'reviewer', responsibility: '独立复核' })],
    })
    const r = validateTeam(baseContract, team, active, rosterOk)
    expect(r.problems.join()).toContain('结果责任人')
    expect(r.problems.join()).toContain('p-1')
  })

  it('verifier 缺席 → 拒', () => {
    expect(validateTeam(baseContract, validTeam({ members: [member()] }), active, rosterOk).problems.join()).toContain(
      'p-2',
    )
  })

  it('高风险同人（owner===verifier）→ 拒（合同侧 validate.ts 已拦同人，此处团队面纵深防御）', () => {
    const high = { ...baseContract, riskTier: 'high' as const, verificationOwnerId: 'p-1' }
    const r = validateTeam(high, validTeam({ members: [member()] }), active, rosterOk)
    expect(r.problems.join()).toContain('高风险')
  })

  it('verifier 若只以 agent 主体出现不算到位（到位性只认 person 成员）', () => {
    const team = validTeam({
      members: [
        member(),
        member({ subjectKind: 'agent', subjectId: 'ag-ok-9', role: 'reviewer', responsibility: '复核' }),
      ],
    })
    expect(validateTeam(baseContract, team, active, rosterOk).problems.join()).toContain('p-2')
  })

  it('inactive person 成员 → 拒（点名成员 id；activePersonIds 是 people 域权威）', () => {
    const team = validTeam({
      members: [
        member(),
        member({ subjectId: 'p-2', role: 'reviewer', responsibility: '复核' }),
        member({ subjectId: 'p-9', role: 'support', responsibility: '支援' }),
      ],
    })
    const r = validateTeam(baseContract, team, active, rosterOk)
    expect(r.problems.join()).toContain('p-9')
    expect(r.problems.join()).toContain('active')
  })

  it('roster blocked 的 agent 成员 → 拒（D5：rosterStatus 三字段判据，注入回调为证）', () => {
    const team = validTeam({
      members: [
        member(),
        member({ subjectId: 'p-2', role: 'reviewer', responsibility: '复核' }),
        member({ subjectKind: 'agent', subjectId: 'ag-bad-1', role: 'executor', responsibility: '执行' }),
      ],
    })
    const r = validateTeam(baseContract, team, active, rosterOk)
    expect(r.problems.join()).toContain('ag-bad-1')
    expect(r.problems.join()).toContain('roster')
  })

  it('成员空/非数组/整个 team 非 → 拒', () => {
    expect(validateTeam(baseContract, { members: [] }, active, rosterOk).problems.join()).toContain('members')
    expect(validateTeam(baseContract, { members: 'x' }, active, rosterOk).problems.join()).toContain('members')
    expect(validateTeam(baseContract, {}, active, rosterOk).problems.join()).toContain('members')
  })

  it('成员字段缺陷：subjectKind 非法/subjectId 空/role 空/responsibility 空白 → 拒', () => {
    for (const patch of [
      { subjectKind: 'team' },
      { subjectKind: 'person', subjectId: '' },
      { subjectKind: 'person', subjectId: 'p-2', role: '' },
      { subjectKind: 'person', subjectId: 'p-2', responsibility: '  ' },
    ]) {
      const team = validTeam({ members: [member(), member(patch)] })
      const r = validateTeam(baseContract, team, active, rosterOk)
      expect(r.problems.length).toBeGreaterThan(0)
    }
  })

  it('draft 不豁免约束：draft 提案缺 owner 成员同样拒（候选不因 draft 降门槛）', () => {
    const team = validTeam({
      status: 'draft',
      members: [member({ subjectId: 'p-2', role: 'reviewer', responsibility: '复核' })],
    })
    expect(validateTeam(baseContract, team, active, rosterOk).problems.join()).toContain('结果责任人')
  })
})

// 数字员工批一 Task 4：第 5 参 unitGateOk（执行单元派单门）。传入时对 agent 成员追加
// 「不可接单」校验（roster 齐备但门 block 仍拒）；不传行为不变。
describe('validateTeam 派单门（数字员工批一）', () => {
  it('传入 unitGateOk 时：roster 齐备但不可接单 → 拒并点名原因', () => {
    const team = validTeam({ members: [member(), member({ subjectId: 'p-2', role: 'reviewer', responsibility: '独立复核' }),
      member({ subjectKind: 'agent', subjectId: 'ag-ok-1', role: 'executor', responsibility: '执行' })] })
    const r = validateTeam(baseContract, team, active, rosterOk, (id) => id !== 'ag-ok-1')
    expect(r.problems.join()).toContain('ag-ok-1')
    expect(r.problems.join()).toContain('不可接单')
  })

  it('不传 unitGateOk → 行为不变', () => {
    expect(validateTeam(baseContract, validTeam({ members: [member(), member({ subjectId: 'p-2', role: 'reviewer', responsibility: '独立复核' }), member({ subjectKind: 'agent', subjectId: 'ag-ok-1', role: 'x', responsibility: 'y' })] }), active, rosterOk).problems).toEqual([])
  })

  // 审查挂账2/6：拒绝码此前内联 `unit_gate` 字面量（违反词表冻结条款「禁止私造
  // 表外字符串」的反向面——文案与词表脱钩漂移）。守门两钉：
  // ① UNIT_GATE_REASON 是词表成员（词表删条目→①红；常量被改名/挪走→import 失败即红）；
  // ② 拒绝文案携带的码=UNIT_GATE_REASON（实现改回内联字面量且与词表脱钩→②红）。
  it('拒绝码出自统一词表（UNIT_GATE_REASON ∈ DISPATCH_REASON_CODES）且文案引用该常量', () => {
    expect(DISPATCH_REASON_CODES).toContain(UNIT_GATE_REASON)
    const team = validTeam({ members: [member(), member({ subjectId: 'p-2', role: 'reviewer', responsibility: '独立复核' }),
      member({ subjectKind: 'agent', subjectId: 'ag-ok-1', role: 'executor', responsibility: '执行' })] })
    const r = validateTeam(baseContract, team, active, rosterOk, () => false)
    expect(r.problems.join()).toContain(`不可接单（${UNIT_GATE_REASON}）`)
  })
})
