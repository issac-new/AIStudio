// custom/server/userperms/audit-store.ts
// 用户权限变更审计存储（N02，spec 2026-11-04-agentteams-ledger-items.md）。
//
// 形态（D3：独立 jsonl，不并入 approvals/history.json——该面有自身消费者与冻结契约）：
// - 落 ~/.hermes-web-ui/user-perms-audit.jsonl，与 approvals/history.json 同目录；
// - 每行一条审计记录：who(actor)/what(action+target)/from→to/at；
// - 追加范式照 run-manifest.ts：appendFileSync 单行 best-effort（行级原子，
//   写失败不阻断业务请求，只累计 writeFailures）。
// - 脱敏红线：序列化走字段白名单（AUDIT_ENTRY_KEYS），调用方混入的
//   password/password_hash 等字段一律不落盘。
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { dirname } from 'path'
import { underWebUi } from '../lib/paths'

/** 审计动作（N02 契约三值，不外扩）。 */
export type UserPermsAuditAction = 'role_change' | 'profile_grant' | 'profile_revoke'

export interface UserPermsAuditEntry {
  /** 时间戳（epoch ms）。 */
  at: number
  /** 操作者（鉴权态 ctx.state.user.username）。 */
  actor: string
  action: UserPermsAuditAction
  /** 被改账号（username 优先；解析不到时为路由原始 id 串）。 */
  user: string
  /** profile 动作的 profile 名（role_change 省略）。 */
  target?: string
  /** 变更前值（查库可得时；创建/不可查时省略——fail-soft）。 */
  from?: string
  /** 变更后值（role_change 的新角色）。 */
  to?: string
  /** 请求追踪 id（x-request-id 头，缺省省略）。 */
  requestId?: string
}

/** 序列化白名单：只落这些键，杜绝敏感字段（password 类）混入审计行。 */
const AUDIT_ENTRY_KEYS = ['at', 'actor', 'action', 'user', 'target', 'from', 'to', 'requestId'] as const

let writeFailures = 0

/** 审计文件路径（测试隔离：USER_PERMS_AUDIT_FILE 显式覆盖整文件路径）。 */
export function userPermsAuditFile(): string {
  const env = process.env.USER_PERMS_AUDIT_FILE?.trim()
  if (env) return env
  return underWebUi('user-perms-audit.jsonl')
}

/** 白名单投影序列化——审计行内不得出现密码类字段（仓规第 6 条）。 */
function serializeEntry(entry: UserPermsAuditEntry): string {
  const picked: Record<string, unknown> = {}
  for (const key of AUDIT_ENTRY_KEYS) {
    const v = (entry as unknown as Record<string, unknown>)[key]
    if (v !== undefined) picked[key] = v
  }
  return JSON.stringify(picked)
}

/** 追加审计行（best-effort：目录 0700、文件 0600；失败不抛、只计数）。 */
export function appendAuditEntries(entries: UserPermsAuditEntry[]): void {
  if (entries.length === 0) return
  try {
    const file = userPermsAuditFile()
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
    // 多行一次 write：同请求的多条行尽量同批落盘（单次 append 行级原子）
    appendFileSync(file, entries.map(serializeEntry).join('\n') + '\n', { mode: 0o600 })
  } catch {
    writeFailures += 1
  }
}

export interface UserPermsAuditQuery {
  user?: string
  action?: UserPermsAuditAction
  limit?: number
  offset?: number
}

export interface UserPermsAuditQueryResult {
  entries: UserPermsAuditEntry[]
  /** 过滤命中总数（未分页）。 */
  total: number
  hasMore: boolean
}

/** 倒序（新→旧）读审计流并过滤。limit clamp 1..500；offset ≥0。 */
export function queryAudit(query: UserPermsAuditQuery = {}): UserPermsAuditQueryResult {
  const limit = Math.min(500, Math.max(1, Math.round(query.limit ?? 50)))
  const offset = Math.max(0, Math.round(query.offset ?? 0))
  const all = readAuditEntries()
    .filter((e) => (query.user ? e.user === query.user : true))
    .filter((e) => (query.action ? e.action === query.action : true))
    // 文件序=追加序（旧→新），反转得新→旧；同毫秒多行保持追加时相对顺序的逆序稳定
    .reverse()
  const page = all.slice(offset, offset + limit)
  return {
    entries: page,
    total: all.length,
    hasMore: offset + page.length < all.length,
  }
}

/** 顺序读全量（旧→新）；坏行跳过，文件不存在按空账。 */
export function readAuditEntries(): UserPermsAuditEntry[] {
  const out: UserPermsAuditEntry[] = []
  try {
    const file = userPermsAuditFile()
    if (!existsSync(file)) return out
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue
      try {
        const e = JSON.parse(line) as UserPermsAuditEntry
        if (e && typeof e.at === 'number' && typeof e.actor === 'string' && typeof e.action === 'string') {
          out.push(e)
        }
      } catch { /* 坏行跳过（runmanifest 同款） */ }
    }
  } catch { /* 目录不可读按空账 */ }
  return out
}

export function auditWriteFailures(): number {
  return writeFailures
}

/** 测试隔离。 */
export function _resetUserPermsAuditStateForTests(): void {
  writeFailures = 0
}
