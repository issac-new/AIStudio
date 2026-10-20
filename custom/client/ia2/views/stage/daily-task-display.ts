// 日常工作验收面板共用展示函数：看板技术状态/时间戳/路径只在这里转成人话。
import { humanDateTime, shortPath } from '../../format'
import type { KanbanTask } from '@/api/hermes/kanban'

export const TASK_STATUS_LABEL: Record<string, string> = {
  triage: '待分类',
  todo: '待办',
  scheduled: '已排期',
  ready: '可开工',
  running: '进行中',
  blocked: '受阻',
  review: '待人验收',
  done: '已完成',
  archived: '已归档',
}

export function taskStatusLabel(status: string): string {
  return TASK_STATUS_LABEL[status] ?? status
}

export function taskUpdatedAt(task: KanbanTask): number {
  return task.completed_at ?? task.last_heartbeat_at ?? task.started_at ?? task.created_at
}

export function taskUpdatedLabel(task: KanbanTask): string {
  return humanDateTime(taskUpdatedAt(task))
}

export function taskPathLabel(task: KanbanTask): string {
  return shortPath(task.workspace_path)
}

export function taskResultLabel(task: KanbanTask): string {
  const result = (task.result ?? task.latest_summary ?? '').trim()
  return result || (task.status === 'done' ? '已完成，但任务卡未填写结果' : '尚未填写结果')
}

export interface RawBoardTask { board: string; task: KanbanTask }

/** 验收工作面只看近期结果：历史归档不作为当前验收噪声。 */
export function isRecentTask(task: KanbanTask, days = 14, now = Date.now()): boolean {
  const ts = task.completed_at ?? task.created_at
  const ms = ts < 1e12 ? ts * 1000 : ts
  return Number.isFinite(ms) && now - ms <= days * 86_400_000
}
