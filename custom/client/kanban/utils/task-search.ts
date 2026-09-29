// 任务搜索匹配（单一事实源：SwarmKanbanView 过滤器用，纯函数可测）
// 契约陷阱：api/hermes/kanban 返回的 title/body/result/assignee/tenant 不保证是
// string（实测出现过非字符串 body 的卡面数据）——直接 .toLowerCase() 会 TypeError
// 打死整个看板视图（TasksView 块实测崩：b.body.toLowerCase is not a function）。
// 统一经 String(v ?? '') 归一后比较，任何字段类型都不炸。
import type { KanbanTask } from '@/api/hermes/kanban'

const hay = (v: unknown): string => {
  if (v == null) return ''
  // 非字符串态（对象/数组/数字）走 JSON 序列化：字段内容仍可被搜到，且不抛
  return (typeof v === 'string' ? v : (JSON.stringify(v) ?? '')).toLowerCase()
}

export function taskMatchesQuery(t: KanbanTask, qRaw: string): boolean {
  const q = String(qRaw ?? '').toLowerCase()
  if (!q) return true
  return (
    hay(t.title).includes(q) ||
    hay(t.body).includes(q) ||
    hay(t.id).includes(q) ||
    hay(t.result).includes(q) ||
    hay(t.assignee).includes(q) ||
    hay(t.tenant).includes(q)
  )
}
