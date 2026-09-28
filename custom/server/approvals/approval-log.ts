// overlay/custom/server/approvals/approval-log.ts
// 人工审批决策历史（P1 §二 2026-09-28）：append-only JSON 日志。
// 记录：时间 + 操作人 + 操作对象（kind/id/title）+ 决策 + 备注 + 来源端点。
// 路径解析与 approval-store 同约定：环境变量显式 > ~/.hermes-web-ui/approvals/。
// 不落 cwd：serve 以 upstream 为 cwd 启动，cwd 档会写进只读 upstream 树。
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'

export interface ApprovalLogEntry {
  id: string
  ts: number
  actor: string
  targetKind: 'command' | 'review' | 'kanban'
  targetId: string
  targetTitle: string
  decision: string
  note?: string
}

const CAP = 500

export function resolveApprovalLogPath(): string {
  if (process.env.HERMES_APPROVALS_LOG_FILE) return resolveEnv(process.env.HERMES_APPROVALS_LOG_FILE)
  return join(homedir(), '.hermes-web-ui', 'approvals', 'history.json')
}

function resolveEnv(p: string): string {
  return p.startsWith('/') || p.startsWith('~') ? p.replace(/^~/, homedir()) : join(process.cwd(), p)
}

function load(): ApprovalLogEntry[] {
  const file = resolveApprovalLogPath()
  if (!existsSync(file)) return []
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(parsed) ? parsed.filter(isEntry) : []
  } catch {
    return []
  }
}

function isEntry(v: unknown): v is ApprovalLogEntry {
  if (!v || typeof v !== 'object') return false
  const e = v as Record<string, unknown>
  return typeof e.id === 'string' && typeof e.ts === 'number' && typeof e.decision === 'string'
}

/** 追加一条决策记录（原子写：tmp + rename）。返回写入后的条目。 */
export function appendApprovalLog(entry: Omit<ApprovalLogEntry, 'ts'> & { ts?: number }): ApprovalLogEntry {
  const full: ApprovalLogEntry = { ts: Date.now(), ...entry }
  const list = load()
  list.push(full)
  const trimmed = list.length > CAP ? list.slice(list.length - CAP) : list
  const file = resolveApprovalLogPath()
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(trimmed, null, 1), 'utf8')
  renameSync(tmp, file)
  return full
}

/** 历史查询（新→旧）。 */
export function queryApprovalLog(limit = 50): ApprovalLogEntry[] {
  return load().slice().reverse().slice(0, Math.max(1, Math.min(limit, CAP)))
}
