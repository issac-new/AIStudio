// overlay/custom/client/ide/utils/approvalLearning.ts
// 审批「批准即学习」（codex ApprovedForSession + minimax always-allow 五档语义）。
// 现状：审批门 once/session/always 只记 upstream 后端；会话内同类不再问由后端
// session 档兜底。本模块补齐前端可解释宽度：session 批准即记忆，后续同会话
// 新审批浮层显示「本次匹配记忆 <宽度>」提示行，让用户知道为何仍会弹（更宽
// 命令）以及上一次批的是什么。
// 宽度自动推导（按命令字符串结构）：
//   exact     整条命令一致
//   byFirstWord 首词一致（npm/git/curl…）
//   byArgvPrefix2 前两词一致（npm run/git checkout…）
//   byDomain  URL 域名一致（fetch/curl 类含 http 链接的命令）
//   wholeTool 工具名一致（最宽）
// 存储：localStorage per sessionId，FIFO 50 条；deny 不记忆（否定学习留给后端）。
export type ApprovalWidth = 'exact' | 'byFirstWord' | 'byArgvPrefix2' | 'byDomain' | 'wholeTool'

export interface ApprovalMemoryEntry {
  toolName: string
  width: ApprovalWidth
  value: string
  approvedAt: number
}

const STORAGE_PREFIX = 'ide-approval-memory:'
const MAX_ENTRIES = 50

function storageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId}`
}

function load(sessionId: string): ApprovalMemoryEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(sessionId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function save(sessionId: string, entries: ApprovalMemoryEntry[]): void {
  try {
    localStorage.setItem(storageKey(sessionId), JSON.stringify(entries.slice(-MAX_ENTRIES)))
  } catch { /* 配额满静默 */ }
}

function firstWords(command: string, n: number): string {
  return command.trim().split(/\s+/).slice(0, n).join(' ')
}

function domainOf(command: string): string | null {
  const m = command.match(/https?:\/\/([a-z0-9.-]+)/i)
  return m ? m[1].toLowerCase() : null
}

/** 推导一条 session 批准的记忆条目（command 缺失时只记 wholeTool） */
export function deriveEntry(toolName: string, command: string): ApprovalMemoryEntry | null {
  if (!toolName) return null
  const cmd = (command ?? '').trim()
  if (!cmd) {
    return { toolName, width: 'wholeTool', value: toolName, approvedAt: Date.now() }
  }
  const domain = domainOf(cmd)
  if (domain) {
    return { toolName, width: 'byDomain', value: domain, approvedAt: Date.now() }
  }
  const words = cmd.split(/\s+/)
  if (words.length >= 2) {
    return { toolName, width: 'byArgvPrefix2', value: firstWords(cmd, 2), approvedAt: Date.now() }
  }
  return { toolName, width: 'byFirstWord', value: firstWords(cmd, 1), approvedAt: Date.now() }
}

/** session 批准即记忆（once/always/deny 不记：once 太窄、always 交后端、deny 不学习） */
export function recordSessionApproval(sessionId: string, toolName: string, command: string): void {
  if (!sessionId) return
  const entry = deriveEntry(toolName, command)
  if (!entry) return
  const entries = load(sessionId)
  // 同宽同值去重（保留最新 approvedAt）
  const filtered = entries.filter((e) => !(e.toolName === entry.toolName && e.width === entry.width && e.value === entry.value))
  filtered.push(entry)
  save(sessionId, filtered)
}

/** 新审批匹配既有记忆的宽度（不匹配返回 null） */
export function matchMemory(sessionId: string, toolName: string, command: string): ApprovalMemoryEntry | null {
  if (!sessionId || !toolName) return null
  const entries = load(sessionId)
  const cmd = (command ?? '').trim()
  // 窄→宽优先命中（最具体的解释）
  const domain = domainOf(cmd)
  const two = cmd ? firstWords(cmd, 2) : ''
  const one = cmd ? firstWords(cmd, 1) : ''
  for (const e of entries) {
    if (e.toolName !== toolName) continue
    if (e.width === 'wholeTool') return e
    if (e.width === 'byDomain' && domain && e.value === domain) return e
    if (e.width === 'byArgvPrefix2' && two && e.value === two) return e
    if (e.width === 'byFirstWord' && one && e.value === one) return e
    if (e.width === 'exact' && e.value === cmd) return e
  }
  return null
}

/** 清空会话记忆（新会话/手动重置用） */
export function clearMemory(sessionId: string): void {
  try {
    localStorage.removeItem(storageKey(sessionId))
  } catch { /* ignore */ }
}
