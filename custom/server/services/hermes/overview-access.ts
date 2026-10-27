// 看板聚合的逐账户投影。原始结果可跨账户共享，本模块不得写回 raw。
// 与普通 Kanban 一致：任务只按 assignee 对应当前用户 user_profiles 过滤；
// 空板再按 board.json 团队键决定可见性，profiles 优先、profile_scope 回落。

import type {
  KanbanOverviewBoard,
  KanbanOverviewRawBoard,
  KanbanOverviewRawResult,
  KanbanOverviewResult,
} from './kanban-overview'

export type CanAccessOverviewProfile = (profile: string) => boolean

function assigneeProfile(task: any): string {
  return typeof task?.assignee === 'string' ? task.assignee.trim() || 'default' : 'default'
}

function publicBoard(board: KanbanOverviewRawBoard, total: number): KanbanOverviewBoard {
  return { slug: board.slug, name: board.name, total, archived: Boolean(board.archived) }
}

/** 与 runtime/hermes_cli/board_team_keys.py 同序；present-but-empty 不回落。 */
function boardTeam(board: KanbanOverviewRawBoard): string[] | null {
  const raw = board.profiles ?? board.profile_scope
  if (raw === undefined || raw === null) return null
  const values = Array.isArray(raw) ? raw : String(raw).split(',')
  return [...new Set(values
    .map(value => String(value).trim().toLowerCase())
    .filter(Boolean))]
}

/** 非超级管理员投影：任务、计数与空板都源自同一份过滤后任务集。
 *  与普通 Kanban（注入后 kanban.ts）同判据：未指派卡不滤（补丁 547——认领围栏
 *  在 board.json 层，列表可见性不拦未指派）；visible 集为空=不限制（补丁 477——
 *  matrix 自动建号 admin 无 user_profiles 行）。unrestricted 由调用方按同一
 *  user_profiles 空集判定传入。 */
export function projectOverviewForUser(
  raw: KanbanOverviewRawResult,
  canAccess: CanAccessOverviewProfile,
  unrestricted = false,
): KanbanOverviewResult {
  if (unrestricted) return projectOverviewForAll(raw)
  const accessCache = new Map<string, boolean>()
  const canAccessCached = (profile: string): boolean => {
    const cached = accessCache.get(profile)
    if (cached !== undefined) return cached
    const allowed = canAccess(profile)
    accessCache.set(profile, allowed)
    return allowed
  }
  const tasks = raw.tasks.filter(row => {
    const assignee = row.task?.assignee
    if (typeof assignee !== 'string' || !assignee.trim()) return true
    return canAccessCached(assigneeProfile(row.task))
  })
  const totals = new Map<string, number>()
  for (const row of tasks) totals.set(row.board, (totals.get(row.board) ?? 0) + 1)

  const boards: KanbanOverviewBoard[] = []
  for (const board of raw.boards) {
    const total = totals.get(board.slug) ?? 0
    if (total === 0) {
      const team = boardTeam(board)
      // 无团队键只保留 legacy 空板；任务已在上方独立过滤，不能借此放卡。
      if (team !== null && !team.some(canAccessCached)) continue
    }
    boards.push(publicBoard(board, total))
  }
  return { boards, tasks, fetchedAt: raw.fetchedAt }
}

/** super_admin / 无鉴权本地部署的全量投影；仅剥掉内部团队元数据。 */
export function projectOverviewForAll(raw: KanbanOverviewRawResult): KanbanOverviewResult {
  return {
    boards: raw.boards.map(board => publicBoard(board, Number(board.total ?? 0))),
    tasks: [...raw.tasks],
    fetchedAt: raw.fetchedAt,
  }
}
