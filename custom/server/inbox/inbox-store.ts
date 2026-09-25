// overlay/inbox 域：注意力队列（multica §六 inbox 吸收，矩阵 §3.5 P1）。
//
// multica 语义（handler/inbox.go:73-111 + §六）：
// - 类型 × 三档 severity（action_required|attention|info）；
// - 列表项正文截 200 码点（评论正文摘要防刷屏）；
// - 已读/归档双轴（两独立布尔，四个象限都可达）+ 批量操作；
// - member|agent 双收件人（收件人 polymorphic）。
// 存储：每收件人一份 JSON（append+幂等 itemId+环形 200），HERMES_INBOX_DIR 降级同款。
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'

export const INBOX_SEVERITIES = ['action_required', 'attention', 'info'] as const
export type InboxSeverity = (typeof INBOX_SEVERITIES)[number]

export const INBOX_TYPES = ['new_comment', 'mentioned', 'task_failed', 'quick_create_failed', 'task_assigned'] as const
export type InboxType = (typeof INBOX_TYPES)[number]

export interface InboxItem {
  itemId: string
  type: InboxType
  severity: InboxSeverity
  /** 收件人 polymorphic：member（人）| agent（agent id）。 */
  recipientKind: 'member' | 'agent'
  recipient: string
  /** 正文摘要（已截 200 码点——投递侧截断，multica 列表项语义）。 */
  body: string
  at: number
  /** 归档双轴：read/unarchived 四象限独立。 */
  read: boolean
  archived: boolean
}

const BODY_CAP = 200
const MAX_ITEMS = 200

function writable(dir: string): boolean {
  try {
    const probe = join(dir, `.inbox-probe-${process.pid}`)
    writeFileSync(probe, '')
    unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

export function inboxDir(): string {
  const env = process.env.HERMES_INBOX_DIR?.trim()
  if (env) return resolve(env)
  const cwd = process.cwd()
  if (writable(cwd)) return resolve(cwd, '.inbox')
  return join(homedir(), '.hermes-web-ui', 'inbox')
}

export function isInboxSeverity(v: unknown): v is InboxSeverity {
  return typeof v === 'string' && (INBOX_SEVERITIES as readonly string[]).includes(v)
}

export function isInboxType(v: unknown): v is InboxType {
  return typeof v === 'string' && (INBOX_TYPES as readonly string[]).includes(v)
}

function key(recipientKind: string, recipient: string): string {
  return `${recipientKind}-${recipient}`.replace(/[^A-Za-z0-9._-]/g, '_')
}

function inboxFile(recipientKind: string, recipient: string): string {
  return join(inboxDir(), `${key(recipientKind, recipient)}.json`)
}

export function loadInbox(recipientKind: string, recipient: string): InboxItem[] {
  try {
    const raw = JSON.parse(readFileSync(inboxFile(recipientKind, recipient), 'utf8'))
    if (Array.isArray(raw)) return raw.filter((i: InboxItem) => i && typeof i.itemId === 'string')
  } catch { /* 坏/无文件 fail-soft */ }
  return []
}

function saveInbox(recipientKind: string, recipient: string, items: InboxItem[]): void {
  mkdirSync(inboxDir(), { recursive: true })
  writeFileSync(inboxFile(recipientKind, recipient), JSON.stringify(items, null, 2))
}

/** 投递（幂等 itemId；正文截 200 码点；环形 200）。 */
export function deliver(item: InboxItem): { added: boolean; total: number } {
  const items = loadInbox(item.recipientKind, item.recipient)
  if (items.some((i) => i.itemId === item.itemId)) return { added: false, total: items.length }
  items.push({ ...item, body: item.body.slice(0, BODY_CAP) })
  if (items.length > MAX_ITEMS) items.shift()
  saveInbox(item.recipientKind, item.recipient, items)
  return { added: true, total: items.length }
}

export interface InboxFilter {
  /** 双轴过滤：只看未读 / 只看未归档（默认只看未归档）。 */
  unreadOnly?: boolean
  includeArchived?: boolean
  severity?: InboxSeverity
  limit?: number
}

/** 查询（新在前）：已读/归档双轴过滤 + severity 过滤。 */
export function queryInbox(recipientKind: string, recipient: string, filter: InboxFilter = {}): InboxItem[] {
  let items = loadInbox(recipientKind, recipient)
  if (!filter.includeArchived) items = items.filter((i) => !i.archived)
  if (filter.unreadOnly) items = items.filter((i) => !i.read)
  if (filter.severity) items = items.filter((i) => i.severity === filter.severity)
  return items.slice(-Math.max(1, Math.min(filter.limit ?? 50, MAX_ITEMS))).reverse()
}

/** 批量双轴操作（multica 批量操作语义：read/archive 独立轴，可同批多 itemId）。 */
export function markItems(
  recipientKind: string, recipient: string,
  itemIds: string[], patch: Partial<Pick<InboxItem, 'read' | 'archived'>>,
): number {
  const items = loadInbox(recipientKind, recipient)
  const idSet = new Set(itemIds)
  let changed = 0
  for (const i of items) {
    if (!idSet.has(i.itemId)) continue
    if (patch.read !== undefined) i.read = patch.read
    if (patch.archived !== undefined) i.archived = patch.archived
    changed += 1
  }
  if (changed) saveInbox(recipientKind, recipient, items)
  return changed
}
