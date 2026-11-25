// custom/server/agentidentity/dispatch-gate.ts
// 派单门（2026-11-24 数字员工批一 Task 2）：给定派单目标，判定其绑定的执行单元此刻能否接活
// ——阶段是否准入或运行、责任卡是否有效。本模块只做判定与读盘，不接线任何派单链路（接线属 Task 4）。
//
// 判定顺序（规格第二节）：mode → 绑定查找 → 台账可读性 → 阶段 → 责任卡。
// fail-soft：身份台账读不到时不拦截，decision 记 'unknown'，绝不显示为通过。
// 绑定查找用可选链对 null 安全：读不到台账是 unknown 而不是 not_bound——读不到不等于没绑定。
import { listIdentities, type AgentIdentity } from './agent-identity'
import { listPeople, type Person } from './people'
import { stageOf } from './lifecycle'
import { cardGaps } from './responsibility'

export type UnitGateDecision = 'pass' | 'block' | 'unknown' | 'skipped'

export interface UnitGateVerdict {
  target: string
  /** 本门是否适用于该目标（目标已绑定执行单元）。台账不可读时无法确定，记 false。 */
  applicable: boolean
  identityId?: string
  decision: UnitGateDecision
  reasons: string[]
}

export interface UnitGateFacts {
  target: string
  targetKind: 'agent' | 'matrix-account'
  /** 身份台账快照；null=台账读失败（unknown，不拦截） */
  identities: AgentIdentity[] | null
  people: Person[]
  mode: 'on' | 'off'
}

/** 派单门开关的环境变量名：值为 'off' 时门关闭（skipped / gate_off）。 */
export const DISPATCH_GATE_MODE_ENV = 'WORKUNIT_DISPATCH_GATE'

/** 纯函数判定，不读盘。判定顺序即规格第二节，任一环节出局即返回，不继续评估后续环节。 */
export function assessUnitDispatchGate(facts: UnitGateFacts): UnitGateVerdict {
  const { target } = facts
  if (facts.mode === 'off') {
    return { target, applicable: false, decision: 'skipped', reasons: ['gate_off'] }
  }
  // 绑定查找：targetKind 决定查哪个数组——派单目标名与 Matrix 账号全形是两套目标（同 Task 1 唯一性口径）
  const bound = facts.identities?.find((i) =>
    (facts.targetKind === 'agent' ? i.runtimeBindings?.agents : i.runtimeBindings?.matrixAccounts)?.includes(target))
  if (facts.identities === null) {
    return { target, applicable: false, decision: 'unknown', reasons: ['ledger_unavailable'] }
  }
  if (!bound) {
    return { target, applicable: false, decision: 'skipped', reasons: ['not_bound'] }
  }
  const stage = stageOf(bound)
  if (stage !== 'admitted' && stage !== 'running') {
    return { target, applicable: true, identityId: bound.id, decision: 'block', reasons: [`unit_${stage}`] }
  }
  // 责任卡按非准入口径（不带 forAdmission）：准入证据是准入闸的事，派单门只看卡面要素与责任人在岗；
  // 缺口明细附在 card_invalid 之后，便于派单被拒绝时直接看到缺什么
  const gaps = cardGaps(bound.responsibilityCard, facts.people)
  if (gaps.length) {
    return {
      target, applicable: true, identityId: bound.id, decision: 'block',
      reasons: ['card_invalid', ...gaps.map((g) => g.detail)],
    }
  }
  return { target, applicable: true, identityId: bound.id, decision: 'pass', reasons: [] }
}

/** 读盘包装：mode 缺省读 WORKUNIT_DISPATCH_GATE（'off' 关闭，其余与未设均开）。
 *  身份台账与自然人名单同目录，任一不可读都按台账不可读处理（identities=null → unknown，不拦截）。 */
export function readUnitGateFacts(
  target: string,
  targetKind: 'agent' | 'matrix-account',
  mode?: 'on' | 'off',
): UnitGateFacts {
  const resolvedMode = mode ?? (process.env[DISPATCH_GATE_MODE_ENV] === 'off' ? 'off' : 'on')
  let identities: AgentIdentity[] | null
  let people: Person[]
  try {
    identities = listIdentities()
    people = listPeople()
  } catch {
    identities = null
    people = []
  }
  return { target, targetKind, identities, people, mode: resolvedMode }
}
