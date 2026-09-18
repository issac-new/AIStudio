// overlay/custom/client/ia2/adapters/manage.ts
// 管理域适配器（2026-09-16 多视图重构；2026-09-18 统一导航：管理场景退役，
// 任务↔群弱锚点函数由 kanban 任务抽屉继续消费）：纯函数，视图不自算。

export interface AssigneeTaskInput {
  assignee?: string | null
  status: string
}

export interface AssigneeRow {
  /** assignee 原文；未指派桶为 ''（展示层翻 i18n） */
  name: string
  open: number
  blocked: number
  review: number
  total: number
}

/**
 * 按 assignee 聚合在办任务。done/archived 不计入（人员在办口径）；
 * null/空白 assignee 归未指派桶（name=''）。排序：total 降序 → name locale。
 */
export function aggregateByAssignee(tasks: readonly AssigneeTaskInput[]): AssigneeRow[] {
  const map = new Map<string, AssigneeRow>()
  for (const t of tasks) {
    if (t.status === 'done' || t.status === 'archived') continue
    const name = (t.assignee ?? '').trim()
    const row = map.get(name) ?? { name, open: 0, blocked: 0, review: 0, total: 0 }
    if (t.status === 'blocked') row.blocked++
    else if (t.status === 'review') row.review++
    else row.open++
    row.total++
    map.set(name, row)
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}

/** 任务↔群弱锚点：群名前缀约定 `[<taskId 前 8 位>]`（裁决#4，不持久化字段） */
export function taskRoomPrefix(taskId: string): string {
  return `[${taskId.slice(0, 8)}]`
}

export interface RoomLike {
  roomId: string
  name?: string | null
}

/** 按前缀匹配群（sortedRooms 已按最近活跃排序，首个命中即最近活跃群） */
export function matchRoomByPrefix(rooms: readonly RoomLike[], prefix: string): RoomLike | null {
  return rooms.find(r => (r.name ?? '').startsWith(prefix)) ?? null
}
