// overlay/custom/client/matrix-teams/adapters/accounts.ts
// 账号树纯函数投影：视图不自算（先例 ia2/adapters/manage.ts）。
import {
  TEAM_EVENT_TYPES, parseAccountContent, agentTeamGlobalId,
  type AgentTeam, type DutyContent,
} from '../protocol'

export interface RawStateEvent {
  type: string
  stateKey: string
  sender: string
  content: unknown
}

export interface TeamAccountView {
  userId: string
  displayName: string
  agentTeams: AgentTeam[]
  isLeader: boolean
  declared: true
}

export function projectAccounts(events: RawStateEvent[], leaders: string[]): TeamAccountView[] {
  const byUser = new Map<string, TeamAccountView>()
  for (const ev of events) {
    if (ev.type !== TEAM_EVENT_TYPES.account) continue
    if (ev.sender !== ev.stateKey) continue // 应用层归属校验（spec §4.2）
    const parsed = parseAccountContent(ev.content)
    if (!parsed) continue
    byUser.set(ev.stateKey, {
      userId: ev.stateKey,
      displayName: parsed.displayName,
      agentTeams: parsed.agentTeams,
      isLeader: leaders.includes(ev.stateKey),
      declared: true,
    })
  }
  return [...byUser.values()].sort((a, b) => a.userId.localeCompare(b.userId))
}

export function undeclaredMembers(events: RawStateEvent[], leaders: string[], memberIds: string[]): string[] {
  const declared = new Set(
    events
      .filter(e => e.type === TEAM_EVENT_TYPES.account && e.sender === e.stateKey && parseAccountContent(e.content))
      .map(e => e.stateKey),
  )
  return [...new Set([...memberIds, ...leaders])].filter(id => !declared.has(id)).sort()
}

export function dutyAppliesToUser(duty: DutyContent, userId: string, accounts: TeamAccountView[]): boolean {
  if (duty.assigneeKind === 'account') return duty.assigneeId === userId
  const own = accounts.find(a => a.userId === userId)
  if (!own) return false
  return own.agentTeams.some(t => agentTeamGlobalId(userId, t.slug) === duty.assigneeId)
}

/** 当前用户命中的值守房间集合（Task 7）：房间列表徽标与后续值班台共用。
 *  委托 dutyAppliesToUser（归属判定单一事实源），userId 为空（未登录）恒空集。 */
export function onDutyRoomIds(
  duties: Record<string, DutyContent>,
  userId: string | null,
  accounts: TeamAccountView[],
): Set<string> {
  const out = new Set<string>()
  if (!userId) return out
  for (const [roomId, duty] of Object.entries(duties)) {
    if (dutyAppliesToUser(duty, userId, accounts)) out.add(roomId)
  }
  return out
}
