// custom/server/outcome/team-validate.ts
// OutcomeTeam 约束校验纯函数（批三 T1；spec 2026-11-21-ai-native-orgworkbench-batch3.md §一、决策 D5/D8）。
// 纯函数：不读盘、不取时钟、不抛异常——activePersonIds 与 rosterOk 由调用方解析注入
// （people.activePersonIds() / agentidentity rosterStatus），测试用回调注入避免真名册依赖。
//
// 约束语义（D8：团队不设独立 accountable/reviewer 字段）：
// - 合同 ownerPersonId 与 verificationOwnerId（若合同有）必须各有一名对应 person 成员——
//   责任归属以成员 role 承载（如 accountable/reviewer），复制成字段必然双正本漂移；
// - riskTier==='high' 时 owner 与 verifier 必须不同自然人（合同侧 validate.ts 创建时已拦同人，
//   此处是团队面的纵深防御）；
// - person 成员必须 active（people 域权威）；agent 成员 rosterOk(subjectId) 必须真
//   （D5：rosterStatus==='complete' 判据=name/can/cannot 三字段，不发明「可用阶段」新枚举）；
// - agent 成员在 roster 齐备后还须过派单门（2026-11-24 数字员工批一，第 5 参 unitGateOk
//   可选）：已绑定单元在未准入/变更中/已退役/责任卡失效时不可接单，未绑定（skipped）不拦；
// - members 非空且逐成员 subjectKind/subjectId/role/responsibility 齐备。
// status 不在本函数职责内（store confirmTeam 已校验枚举）；draft 提案与 active 确认
// 适用同一套成员约束——候选不因 draft 降门槛。
import type { OutcomeContract, OutcomeTeamMember } from './types'
import { TEAM_SUBJECT_KINDS } from './types'

/** 校验所需合同事实（只取三字段，测试与 T2 端点无需构造整份合同）。 */
export type TeamContractFacts = Pick<
  OutcomeContract,
  'ownerPersonId' | 'verificationOwnerId' | 'riskTier'
>

/** 派单门判据（2026-11-24 数字员工批一）：agentId 是否可接单（true=可）。由调用方注入：
 *  端点用 agentidentity 真实现求门（未绑定/读数 unknown 返回 true），测试注入回调。 */
export type UnitGateOk = (agentId: string) => boolean

export interface TeamValidation {
  /** 空=团队约束满足。problems 点名具体成员/责任人，供端点 422 invalid_input 回传。 */
  problems: string[]
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

/** 团队约束校验。team 收 unknown（端点输入先验后用）；语义门槛外的结构校验与 store 层
 *  自防御重叠是有意冗余——本函数是 T2 端点的完整门，store 只拦垃圾输入。 */
export function validateTeam(
  contract: TeamContractFacts,
  team: unknown,
  activePersonIds: Set<string>,
  rosterOk: (agentId: string) => boolean,
  unitGateOk?: UnitGateOk,
): TeamValidation {
  const problems: string[] = []
  const t = (team ?? {}) as { members?: unknown }
  const members = Array.isArray(t.members) ? t.members : null
  if (!members || members.length === 0) return { problems: ['members 须为非空数组'] }

  const persons: string[] = []
  const agents: string[] = []
  members.forEach((m, idx) => {
    if (m === null || typeof m !== 'object') {
      problems.push(`members[${idx}] 须为对象`)
      return
    }
    const mm = m as Partial<OutcomeTeamMember>
    if (!(TEAM_SUBJECT_KINDS as readonly string[]).includes(mm.subjectKind as string))
      problems.push(`members[${idx}].subjectKind 须为 person|agent`)
    if (!nonEmpty(mm.subjectId)) {
      problems.push(`members[${idx}].subjectId 必填`)
      return
    }
    if (!nonEmpty(mm.role)) problems.push(`members[${idx}].role 必填`)
    if (!nonEmpty(mm.responsibility)) problems.push(`members[${idx}].responsibility 必填`)
    if (mm.subjectKind === 'person') persons.push(mm.subjectId)
    else if (mm.subjectKind === 'agent') agents.push(mm.subjectId)
  })

  // owner/verifier 到位性（D8）：只认 person 成员——合同责任人是自然人坐标
  if (nonEmpty(contract.ownerPersonId) && !persons.includes(contract.ownerPersonId))
    problems.push(`合同结果责任人（${contract.ownerPersonId}）必须是团队 person 成员`)
  if (nonEmpty(contract.verificationOwnerId) && !persons.includes(contract.verificationOwnerId))
    problems.push(`合同验证责任人（${contract.verificationOwnerId}）必须是团队 person 成员`)

  // 高风险分离：owner 与 verifier 必须不同 active 自然人（合同侧已拦，纵深防御）
  if (
    contract.riskTier === 'high' &&
    nonEmpty(contract.ownerPersonId) &&
    nonEmpty(contract.verificationOwnerId) &&
    contract.ownerPersonId === contract.verificationOwnerId
  )
    problems.push('高风险合同 owner 与 verifier 不得为同一自然人')

  // person 必须 active（people 域权威）；agent 必须 roster complete（D5）；
  // roster 齐备后再过派单门（2026-11-24 数字员工批一，第 5 参可选）
  for (const id of persons) {
    if (!activePersonIds.has(id)) problems.push(`person 成员 ${id} 不是 active 自然人`)
  }
  for (const id of agents) {
    if (!rosterOk(id)) problems.push(`agent 成员 ${id} 名册未齐备（rosterStatus=blocked）`)
    else if (unitGateOk && !unitGateOk(id)) problems.push(`agent 成员 ${id} 不可接单（unit_gate）`)
  }

  return { problems }
}
