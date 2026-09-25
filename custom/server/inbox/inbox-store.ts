// overlay/inbox 域：注意力队列（multica §六 inbox 吸收，矩阵 §3.5 P1）。
//
// multica 语义（handler/inbox.go:73-111 + §六）：
// - 类型 × 三档 severity（action_required|attention|info）；
// - 列表项正文截 200 码点（评论正文摘要防刷屏）；
// - 已读/归档双轴（两独立布尔，四个象限都可达）+ 批量操作；
// - member|agent 双收件人（收件人 polymorphic）。
// 存储：每收件人一份 JSON（append+幂等 itemId+环形 200），HERMES_INBOX_DIR >
// ~/.hermes-web-ui/inbox（旧档 cwd/.inbox 兜底已撤，同 evidence-store：cwd 随进程启动目录
// 漂移，serve-server.mjs 以 upstream 为 cwd 启动时更会写进只读树）。
// 桶名 = 收件人稳定哈希（sha256 前 32 hex + 可读前缀）：清洗名多对一
// （key('member','张三') === key('member','李四')、'a/b'≡'a_b'）会让不同收件人共桶互覆；
// 旧清洗名读侧兼容迁移（按条目自带 recipient 分账认领）。
// 落盘 = tmp+rename 原子写；坏文件改名 .corrupt.<ts> 留档（G7 时间戳防二次损坏覆盖现场），
// 不再静默当空桶续写。
import { createHash, randomBytes } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'
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

/** 按码点截断（UTF-16 code unit 截断会切出孤立代理对，emoji 即碎）。 */
function clip(s: string, cap: number): string {
  const cps = [...s]
  return cps.length <= cap ? s : cps.slice(0, cap).join('')
}

/** 文件名（S-A）：收件人稳定哈希 + 可读前缀。前缀仅助排障，身份识别全靠哈希。 */
function stemOf(bucket: string): string {
  const readable = bucket.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 32).replace(/^\.+/, '') || 'inbox'
  return `${readable}-${createHash('sha256').update(bucket).digest('hex').slice(0, 32)}`
}

function bucketOf(recipientKind: string, recipient: string): string {
  return `${recipientKind}-${recipient}`
}

export function inboxDir(): string {
  const env = process.env.HERMES_INBOX_DIR?.trim()
  if (env) return resolve(env)
  return join(homedir(), '.hermes-web-ui', 'inbox')
}

export function isInboxSeverity(v: unknown): v is InboxSeverity {
  return typeof v === 'string' && (INBOX_SEVERITIES as readonly string[]).includes(v)
}

export function isInboxType(v: unknown): v is InboxType {
  return typeof v === 'string' && (INBOX_TYPES as readonly string[]).includes(v)
}

export function inboxFile(recipientKind: string, recipient: string): string {
  return join(inboxDir(), `${stemOf(bucketOf(recipientKind, recipient))}.json`)
}

/** 旧清洗命名（只用于兼容读取/迁移；多对一有碰撞，不再用于写入）。 */
function legacyInboxFile(recipientKind: string, recipient: string): string {
  return join(inboxDir(), `${bucketOf(recipientKind, recipient).replace(/[^A-Za-z0-9._-]/g, '_')}.json`)
}

/** 原子写（S-B）：tmp+rename，tmp 名带随机后缀防并发同名；rename 前不做 fsync——
 *  断电最坏丢最后一次写，换来永不落半截 JSON（截断→读侧归零→下条小账覆写→全史蒸发）。 */
function writeJsonAtomic(file: string, data: unknown): void {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  try {
    writeFileSync(tmp, JSON.stringify(data, null, 2))
    renameSync(tmp, file)
  } catch (err) {
    try { unlinkSync(tmp) } catch { /* 无残留 */ }
    throw err
  }
}

/** 坏文件隔离（S-B）：改名 .corrupt.<ts> 留档 + warn，不再静默当空桶续写。
 *  时间戳（G7）：固定名 .corrupt 会让二次损坏覆盖第一次现场，档名带 ts 各自留档。 */
function quarantine(file: string, err: unknown): void {
  const archive = `${file}.corrupt.${Date.now()}`
  try { renameSync(file, archive) } catch { /* 留档失败不阻断（只读介质等） */ }
  console.warn(`[inbox-store] 收件箱文件解析失败，已留档 ${archive}：${err instanceof Error ? err.message : String(err)}`)
}

/** 读数组档：无文件/坏文件回 null（坏档已隔离留档）。 */
function readItemsFile(file: string): InboxItem[] | null {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    if (existsSync(file)) quarantine(file, err)
    return null
  }
  if (!Array.isArray(raw)) {
    quarantine(file, new Error('收件箱结构非法（非数组）'))
    return null
  }
  return raw.filter((i: InboxItem) => i && typeof i.itemId === 'string')
}

export function loadInbox(recipientKind: string, recipient: string): InboxItem[] {
  const file = inboxFile(recipientKind, recipient)
  const items = readItemsFile(file)
  if (items) return items
  // 旧清洗名兼容迁移：旧桶名多对一，按条目自带的收件人字段分账认领——认领走的进哈希桶，
  // 剩余条目留在旧文件（碰撞对侧还要认领，不动别人的账）。
  const legacy = legacyInboxFile(recipientKind, recipient)
  const old = readItemsFile(legacy)
  if (!old) return []
  const mine = old.filter((i) => i.recipientKind === recipientKind && i.recipient === recipient)
  const rest = old.filter((i) => !(i.recipientKind === recipientKind && i.recipient === recipient))
  if (mine.length === 0) return []
  try {
    mkdirSync(inboxDir(), { recursive: true })
    writeJsonAtomic(file, mine)
    if (rest.length === 0) renameSync(legacy, `${legacy}.migrated`)  // 整桶归我：旧名留档换新名
    else writeJsonAtomic(legacy, rest)
  } catch (err) {
    console.warn(`[inbox-store] 旧命名迁移失败（数据已读出，下次重试）：${err instanceof Error ? err.message : String(err)}`)
  }
  return mine
}

function saveInbox(recipientKind: string, recipient: string, items: InboxItem[]): void {
  mkdirSync(inboxDir(), { recursive: true })
  try {
    writeJsonAtomic(inboxFile(recipientKind, recipient), items)
  } catch (err) {
    // 抛出不含服务器路径的错误（err 详情只进 warn；HTTP 500 由 koa 兜，不回 err 正文）。
    console.warn(`[inbox-store] 收件箱写入失败：${err instanceof Error ? err.message : String(err)}`)
    throw new Error('收件箱写入失败（write_failed）')
  }
}

/** 投递（幂等 itemId；正文截 200 码点；环形 200）。 */
export function deliver(item: InboxItem): { added: boolean; total: number } {
  const items = loadInbox(item.recipientKind, item.recipient)
  if (items.some((i) => i.itemId === item.itemId)) return { added: false, total: items.length }
  items.push({ ...item, body: clip(item.body, BODY_CAP) })
  while (items.length > MAX_ITEMS) items.shift()
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

/** 查询（新在前）：已读/归档双轴过滤 + severity 过滤。limit 非有限数回默认 50
 *  （slice(-NaN) 会退化成全量，静默放大返回面）。 */
export function queryInbox(recipientKind: string, recipient: string, filter: InboxFilter = {}): InboxItem[] {
  let items = loadInbox(recipientKind, recipient)
  if (!filter.includeArchived) items = items.filter((i) => !i.archived)
  if (filter.unreadOnly) items = items.filter((i) => !i.read)
  if (filter.severity) items = items.filter((i) => i.severity === filter.severity)
  const limit = typeof filter.limit === 'number' && Number.isFinite(filter.limit)
    ? Math.max(1, Math.min(filter.limit, MAX_ITEMS))
    : 50
  return items.slice(-limit).reverse()
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
