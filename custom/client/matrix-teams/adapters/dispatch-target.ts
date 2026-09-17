// overlay/custom/client/matrix-teams/adapters/dispatch-target.ts
// 指派目标解析（spec §6.2 三级回退）与 kanban→receipt 状态映射。
import type { ReceiptStatus } from '../protocol'
import type { TeamAccountView } from './accounts'

export function resolveTargetProfile(
  target: { account: string; agentTeam?: string; profile?: string },
  accounts: TeamAccountView[],
): string | null {
  const account = accounts.find(a => a.userId === target.account)
  if (!account) return null
  const team = target.agentTeam
    ? account.agentTeams.find(t => t.slug === target.agentTeam)
    : account.agentTeams[0]
  if (!team) return null
  return target.profile ?? team.defaultProfile ?? team.profiles[0] ?? null
}

export function mapKanbanStatusToReceipt(status: string): ReceiptStatus {
  if (status === 'done' || status === 'archived') return 'done'
  if (status === 'blocked') return 'failed'
  if (status === 'triage' || status === 'todo' || status === 'scheduled' || status === 'ready') return 'created'
  return 'running' // running|review 及未知状态兜底（简报接口契约：未知 → 'running'）
}
