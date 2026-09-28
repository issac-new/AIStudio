// overlay/custom/client/kanban/utils/raci.ts
// P2 看板 RACI 可视化（2026-09-28 产品 UI 缺陷修复 §三）：纯函数工具——
// 结构化 raci 解析 / 徽章投影 / "等您操作"判定。无 IO，供卡片/工具栏/抽屉共用。
import type { KanbanTask } from '@/api/hermes/kanban'

export type RaciRole = 'R' | 'A' | 'C' | 'I'

export interface TaskRaci {
  responsible: string[]
  approver: string[]
  consulted: string[]
  informed: string[]
}

const EMPTY: TaskRaci = { responsible: [], approver: [], consulted: [], informed: [] }

/** 任务结构化 RACI：① task.raci 字段（agent 417 列，studio API 透传）② body-JSON
 *  raci 块（raci-dispatch 约定）。两源合并（结构化优先）；无 RACI 返回 null。 */
export function parseTaskRaci(task: KanbanTask | null | undefined): TaskRaci | null {
  if (!task) return null
  const out: TaskRaci = { responsible: [], approver: [], consulted: [], informed: [] }
  let found = false
  const merge = (r: Partial<TaskRaci> | null | undefined) => {
    if (!r) return
    for (const k of ['responsible', 'approver', 'consulted', 'informed'] as const) {
      const v = (r as Record<string, unknown>)[k]
      // 形状归一（2026-09-28）：字符串形成员（"fanfan"）与数组形等价收数——
      // 旧逻辑 Array.isArray 门槛会静默丢掉字符串形（徽章缺 R/A）。
      const names = typeof v === 'string'
        ? [v.trim()].filter(Boolean)
        : Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : []
      if (names.length) { out[k] = [...new Set([...out[k], ...names])]; found = true }
    }
  }
  const structured = (task as KanbanTask & { raci?: unknown }).raci
  if (structured && typeof structured === 'object') merge(structured as Partial<TaskRaci>)
  if (typeof task.body === 'string' && task.body.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(task.body) as { raci?: unknown; meta?: { raci?: unknown } }
      merge(parsed.raci as Partial<TaskRaci>)
      merge(parsed.meta?.raci as Partial<TaskRaci>)
    } catch { /* body 非 JSON 忽略 */ }
  }
  return found ? out : null
}

/** 徽章投影：非空角色的字母+人数（卡片右上角小标签用）。 */
export function raciBadges(raci: TaskRaci | null): Array<{ role: RaciRole; count: number }> {
  if (!raci) return []
  const pairs: Array<[RaciRole, string[]]> = [
    ['R', raci.responsible], ['A', raci.approver], ['C', raci.consulted], ['I', raci.informed],
  ]
  return pairs.filter(([, members]) => members.length > 0).map(([role, members]) => ({ role, count: members.length }))
}

/** 用户名归一比较（@ 前缀与 host 后缀不敏感——matrix id 与本地名混用时对齐）。 */
function sameMember(member: string, username: string): boolean {
  if (!member || !username) return false
  const norm = (s: string) => s.trim().replace(/^@/, '').split(':')[0].toLowerCase()
  return norm(member) === norm(username)
}

/** 当前用户在该卡承担的角色（首个命中；无则 null）。 */
export function myRaciRole(raci: TaskRaci | null, username: string | null | undefined): RaciRole | null {
  if (!raci || !username) return null
  if (raci.responsible.some((m) => sameMember(m, username))) return 'R'
  if (raci.approver.some((m) => sameMember(m, username))) return 'A'
  if (raci.consulted.some((m) => sameMember(m, username))) return 'C'
  if (raci.informed.some((m) => sameMember(m, username))) return 'I'
  return null
}

/** "等您操作"：我是执行(R)且卡未完成，或我是审批(A)且卡在评审。 */
export function needsMyAction(task: KanbanTask, username: string | null | undefined): boolean {
  const raci = parseTaskRaci(task)
  if (!raci || !username) return false
  const role = myRaciRole(raci, username)
  if (role === 'R') return task.status !== 'done' && task.status !== 'archived'
  if (role === 'A') return task.status === 'review'
  return false
}
