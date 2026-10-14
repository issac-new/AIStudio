/**
 * 任务 ↔ 流程映射面（bpa task-link）：看板任务卡与 L3 流程域的关联登记。
 * 文章的「架构作为任务拆解/派发/评估的上游字典」从此从字典变生产工具：
 * 看板卡可标注所属 L3 流程，任务工厂/复盘可据此归组统计。
 * 纯文件面 fail-soft（bpa-store 同款纪律）。env：BPA_TASK_LINK_STORE 覆盖。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { homedir } from 'node:os'

export interface TaskLink {
  /** 看板任务 id（上游 kanban-service 的任务锚） */
  taskId: string
  /** L3 流程编号（bpa 域锚） */
  processId: string
  /** 关联备注（为何这条任务属于该流程） */
  note?: string
  linkedAt: number
}

export function taskLinkFile(): string {
  return process.env.BPA_TASK_LINK_STORE?.trim()
    ? resolve(process.env.BPA_TASK_LINK_STORE.replace(/^~/, homedir()))
    : join(homedir(), '.hermes-web-ui', 'overlay', 'bpa-task-links.json')
}

export function readTaskLinks(): TaskLink[] {
  try {
    const raw = JSON.parse(readFileSync(taskLinkFile(), 'utf8')) as { links?: TaskLink[] }
    return Array.isArray(raw.links) ? raw.links : []
  } catch {
    return []
  }
}

export function writeTaskLinks(links: TaskLink[]): void {
  const file = taskLinkFile()
  const dir = dirname(file)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(file, JSON.stringify({ links }, null, 2) + '\n', 'utf8')
}

/** 关联登记（幂等：同 taskId+processId 覆盖 note/linkedAt） */
export function upsertTaskLink(taskId: string, processId: string, note?: string): TaskLink[] {
  const links = readTaskLinks()
  const idx = links.findIndex((l) => l.taskId === taskId && l.processId === processId)
  const entry: TaskLink = { taskId, processId, ...(note?.trim() ? { note: note.trim().slice(0, 300) } : {}), linkedAt: Date.now() }
  if (idx >= 0) links[idx] = entry
  else links.push(entry)
  writeTaskLinks(links)
  return links
}

export function removeTaskLink(taskId: string, processId: string): TaskLink[] {
  const links = readTaskLinks().filter((l) => !(l.taskId === taskId && l.processId === processId))
  writeTaskLinks(links)
  return links
}

/** 按流程归组（统计面：每条 L3 关联的任务数）。 */
export function groupByProcess(): Record<string, TaskLink[]> {
  const out: Record<string, TaskLink[]> = {}
  for (const l of readTaskLinks()) {
    if (!out[l.processId]) out[l.processId] = []
    out[l.processId]!.push(l)
  }
  return out
}
