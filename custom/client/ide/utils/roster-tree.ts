// overlay：名册树视图投影（routa §七#15 P2 吸收，矩阵 §3.6 routa P2）。
//
// routa 语义（team-page-client.tsx:20-30 团队名册树视图：team-agent-lead 聚合+
// delegates/descendants 计数）：名册以**树**呈现——lead 聚合其成员，每节点带
// 子代理计数（delegates=直接委派数，descendants=全部后代数）。数据源=squad 名册
// （squads.yaml）+ 在场数据；本模块=树投影纯函数（渲染层消费）。
export interface RosterNode {
  id: string
  /** lead=true 是 squad leader（树根层）。 */
  lead: boolean
  members: string[]
  delegates: number
  descendants: number
}

export interface RosterFacts {
  /** squad→leader+members（squads.yaml 形状）。 */
  squads: Record<string, { leader: string; members: string[] }>
  /** agent→活跃委派数（delegates 计数）。 */
  delegateCounts: Record<string, number>
}

/** 名册→树（每 squad 一 lead 节点；delegates 直接计数；descendants=子树总和）。 */
export function buildRosterTree(facts: RosterFacts): RosterNode[] {
  return Object.entries(facts.squads).map(([squad, def]) => {
    const leaderDelegates = facts.delegateCounts[def.leader] ?? 0
    const memberDelegates = def.members.reduce((s, m) => s + (facts.delegateCounts[m] ?? 0), 0)
    return {
      id: squad,
      lead: true,
      members: def.members,
      delegates: leaderDelegates,
      // descendants=该 squad 全部后代（leader+成员的委派总数）。
      descendants: leaderDelegates + memberDelegates,
    }
  }).sort((a, b) => b.descendants - a.descendants)
}
