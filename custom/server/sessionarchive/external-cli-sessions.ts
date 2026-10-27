// overlay/sessionarchive 域：外部 CLI 会话导入读模型（2026-10-27 版本差异吸收）。
//
// 吸收源：kimi-code 2.3.3「导入 Claude Code 与 Codex 会话」（上游 #4342）。
// 与上游语义的差别（如实声明）：上游把会话内容搬进自己的会话库；本仓只做**只读索引**——
// 扫本机 CLI 会话目录，归一成列表（来源/工作区/轮数/最近活跃/文件路径），不复制正文、
// 不写入源目录、不改动源文件。需要看内容时按 file 路径回源读取，避免制造第二份真相。
//
// 隐私边界：标题只取首条用户消息的前 120 字（includeTitles 默认关，接口层显式开启）；
// 助手正文一律不进返回值。本模块纯读文件系统，不联网。
//
// fail-soft：目录缺席→available:false 带原因；单文件解析失败→进 skipped 如实披露；
// 压缩文件（.jsonl.zst）不解析，标 compressed-unsupported（不假装读到）。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import * as zlib from 'node:zlib'
import { basename, join } from 'node:path'
import { homedir } from 'node:os'

export type ExternalCliSource = 'claude-code' | 'codex'

export interface ExternalSessionRow {
  source: ExternalCliSource
  sessionId: string
  workspacePath: string | null
  /** 首条用户消息预览（≤120 字）；includeTitles 关闭时为 null。 */
  title: string | null
  userTurns: number
  assistantTurns: number
  /** 源文件最后一条带时间戳的行（epoch ms）；取不到回落文件 mtime。 */
  lastActiveAt: number | null
  /** 源文件绝对路径：内容回源的唯一锚点。 */
  file: string
}

export interface ExternalSessionSkip {
  file: string
  reason: string
}

export interface ExternalSessionReport {
  available: boolean
  /** 至少一个源可读即 true；两源都缺席才 false。 */
  reason?: string
  roots: { claude: string; codex: string }
  sessions: ExternalSessionRow[]
  skipped: ExternalSessionSkip[]
  scannedFiles: number
  truncated: boolean
}

const TITLE_LIMIT = 120
// 2026-10-27 边界闭合：原 8MB 上限把本机 8.8MB 的真实会话挡在门外；node:zlib 自 Node 22+
// 提供 zstd，压缩件改为就地解压（上限同源），不再整类跳过。上限可注入以便测试边界。
const DEFAULT_MAX_FILE_BYTES = 32 * 1024 * 1024

/** zstd 解压能力探测：老 Node 无该 API 时如实降级，不假装支持。 */
const zstdDecompress: ((buf: Buffer) => Buffer) | null = (() => {
  const candidate = (zlib as unknown as { zstdDecompressSync?: (buf: Buffer) => Buffer }).zstdDecompressSync
  return typeof candidate === 'function' ? candidate.bind(zlib) : null
})()

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function preview(text: string): string | null {
  const t = collapse(text)
  if (!t) return null
  return t.length > TITLE_LIMIT ? `${t.slice(0, TITLE_LIMIT)}…` : t
}

/** 消息内容统一取文本：字符串，或 parts 数组里的 text / input_text / output_text。 */
function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    const p = part as Record<string, unknown>
    if (typeof p.text === 'string') parts.push(p.text)
  }
  return parts.join('\n')
}

function parseTs(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function mtimeOf(file: string): number | null {
  try {
    return statSync(file).mtimeMs
  } catch {
    return null
  }
}

function readLines(text: string): unknown[] {
  const out: unknown[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      out.push(JSON.parse(trimmed))
    } catch {
      // 单行坏数据跳过：CLI 会话文件是追加写的，尾部半行属常见形态，不因此判整文件失败
    }
  }
  return out
}

export interface ParseOptions {
  includeTitles?: boolean
}

/**
 * Claude Code 会话（~/.claude/projects/<slug>/<sessionId>.jsonl）。
 * 行形态：{type:'user'|'assistant'|'summary'|'queue-operation'…, message:{role,content}, cwd, timestamp, isSidechain}。
 */
export type ExternalParseResult = { ok: true; row: ExternalSessionRow } | { ok: false; reason: string }

export function parseClaudeSession(text: string, file: string, opts: ParseOptions = {}): ExternalParseResult {
  const lines = readLines(text)
  if (lines.length === 0) return { ok: false, reason: '空文件或全部行不可解析' }
  let userTurns = 0
  let assistantTurns = 0
  let workspacePath: string | null = null
  let firstUserText = ''
  let lastActiveAt: number | null = null
  for (const raw of lines) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as Record<string, unknown>
    if (workspacePath === null && typeof entry.cwd === 'string' && entry.cwd) workspacePath = entry.cwd
    const ts = parseTs(entry.timestamp)
    if (ts !== null && (lastActiveAt === null || ts > lastActiveAt)) lastActiveAt = ts
    const type = entry.type
    if (type !== 'user' && type !== 'assistant') continue
    const sidechain = entry.isSidechain === true
    if (type === 'user') {
      if (!sidechain) userTurns += 1
      if (!firstUserText && !sidechain) {
        const message = entry.message
        if (message && typeof message === 'object') {
          const m = message as Record<string, unknown>
          const textValue = contentText(m.content)
          // 工具结果回填也走 user 行，带 tool_result 的不当标题
          if (textValue && !textValue.startsWith('[{')) firstUserText = textValue
        }
      }
    } else if (!sidechain) {
      assistantTurns += 1
    }
  }
  if (userTurns === 0 && assistantTurns === 0) return { ok: false, reason: '无 user/assistant 消息行' }
  return {
    ok: true,
    row: {
      source: 'claude-code',
      sessionId: basename(file).replace(/\.jsonl$/i, ''),
      workspacePath,
      title: opts.includeTitles ? preview(firstUserText) : null,
      userTurns,
      assistantTurns,
      lastActiveAt: lastActiveAt ?? mtimeOf(file),
      file,
    },
  }
}

/**
 * Codex 会话（~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl）。
 * 行形态：首行 {type:'session_meta', payload:{id, cwd, timestamp}}；
 * 消息 {type:'response_item', payload:{type:'message', role:'user'|'assistant'|'developer', content:[{type:'input_text'|'output_text', text}]}}。
 * 旧版本只有 event_msg/task_started 而无 user 消息时，轮数为 0 并如实返回（不猜）。
 */
export function parseCodexSession(text: string, file: string, opts: ParseOptions = {}): ExternalParseResult {
  const lines = readLines(text)
  if (lines.length === 0) return { ok: false, reason: '空文件或全部行不可解析' }
  let sessionId = basename(file).replace(/^rollout-/, '').replace(/\.jsonl$/i, '')
  let workspacePath: string | null = null
  let userTurns = 0
  let assistantTurns = 0
  let firstUserText = ''
  let lastActiveAt: number | null = null
  for (const raw of lines) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as Record<string, unknown>
    const ts = parseTs(entry.timestamp)
    if (ts !== null && (lastActiveAt === null || ts > lastActiveAt)) lastActiveAt = ts
    const payload = entry.payload
    if (!payload || typeof payload !== 'object') continue
    const p = payload as Record<string, unknown>
    if (entry.type === 'session_meta') {
      if (typeof p.id === 'string' && p.id) sessionId = p.id
      if (typeof p.cwd === 'string' && p.cwd) workspacePath = p.cwd
      continue
    }
    if (entry.type !== 'response_item' || p.type !== 'message') continue
    const role = p.role
    if (role === 'user') {
      userTurns += 1
      if (!firstUserText) firstUserText = contentText(p.content)
    } else if (role === 'assistant') {
      assistantTurns += 1
    }
  }
  if (userTurns === 0 && assistantTurns === 0 && workspacePath === null) {
    return { ok: false, reason: '无 session_meta 也无消息行' }
  }
  return {
    ok: true,
    row: {
      source: 'codex',
      sessionId,
      workspacePath,
      title: opts.includeTitles ? preview(firstUserText) : null,
      userTurns,
      assistantTurns,
      lastActiveAt: lastActiveAt ?? mtimeOf(file),
      file,
    },
  }
}

export function parseExternalSession(source: ExternalCliSource, text: string, file: string, opts: ParseOptions = {}): ExternalParseResult {
  return source === 'claude-code' ? parseClaudeSession(text, file, opts) : parseCodexSession(text, file, opts)
}

/** 文件收集：按目录深度上限递归，只取目标扩展名；不做符号链接跟随（防环）。 */
function collectFiles(root: string, match: (name: string) => boolean, maxDepth: number, out: string[], cap: number): void {
  if (out.length >= cap) return
  let entries: string[]
  try {
    entries = readdirSync(root)
  } catch {
    return
  }
  const dirs: string[] = []
  for (const name of entries) {
    const full = join(root, name)
    let stat
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      if (maxDepth > 0) dirs.push(full)
    } else if (match(name)) {
      out.push(full)
      if (out.length >= cap) return
    }
  }
  for (const dir of dirs) {
    collectFiles(dir, match, maxDepth - 1, out, cap)
    if (out.length >= cap) return
  }
}

export interface ScanOptions {
  claudeRoot?: string
  codexRoot?: string
  limit?: number
  maxFiles?: number
  includeTitles?: boolean
  /** 单文件字节上限（默认 32MB）；超限进 skipped 并标原因。 */
  maxFileBytes?: number
  /** 只扫指定来源（缺省两源都扫）。必须在截断前生效，否则 limit 会先吃掉另一源的额度。 */
  source?: ExternalCliSource
}

/**
 * 扫描两源 → 归一索引。limit 按 lastActiveAt 倒序截断（truncated 如实标注）。
 * 单文件超过 MAX_FILE_BYTES 或为压缩件时进 skipped，不静默丢弃。
 */
export function scanExternalSessions(opts: ScanOptions = {}): ExternalSessionReport {
  const claudeRoot = opts.claudeRoot?.trim() || join(homedir(), '.claude', 'projects')
  const codexRoot = opts.codexRoot?.trim() || join(homedir(), '.codex', 'sessions')
  const limit = Math.max(1, Math.min(opts.limit ?? 30, 200))
  const maxFiles = Math.max(1, Math.min(opts.maxFiles ?? 600, 5000))
  const maxFileBytes = Math.max(1024, Math.min(opts.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES, 256 * 1024 * 1024))
  const sessions: ExternalSessionRow[] = []
  const skipped: ExternalSessionSkip[] = []
  let scannedFiles = 0

  const roots: Array<{ source: ExternalCliSource; root: string; match: (n: string) => boolean; depth: number }> = [
    { source: 'claude-code', root: claudeRoot, match: (n) => n.endsWith('.jsonl'), depth: 3 },
    {
      source: 'codex',
      root: codexRoot,
      // 压缩件单独识别：能列出但不可解析时如实进 skipped
      match: (n) => (n.endsWith('.jsonl') || n.endsWith('.jsonl.zst')) && n.startsWith('rollout-'),
      depth: 6,
    },
  ]

  const scopedRoots = opts.source ? roots.filter((r) => r.source === opts.source) : roots
  const usableRoots = scopedRoots.filter((r) => existsSync(r.root))
  if (usableRoots.length === 0) {
    return {
      available: false,
      reason: opts.source
        ? `指定来源不可读：${opts.source}（${opts.source === 'claude-code' ? claudeRoot : codexRoot}）`
        : `两源目录均不可读：${claudeRoot} / ${codexRoot}`,
      roots: { claude: claudeRoot, codex: codexRoot },
      sessions: [],
      skipped: [],
      scannedFiles: 0,
      truncated: false,
    }
  }

  for (const r of usableRoots) {
    const files: string[] = []
    collectFiles(r.root, r.match, r.depth, files, maxFiles)
    for (const file of files) {
      scannedFiles += 1
      let size = 0
      try {
        size = statSync(file).size
      } catch {
        skipped.push({ file, reason: 'stat-failed' })
        continue
      }
      if (size === 0) {
        skipped.push({ file, reason: 'empty-file' })
        continue
      }
      if (size > maxFileBytes) {
        skipped.push({ file, reason: `file-too-large（${size} > ${maxFileBytes}）` })
        continue
      }
      let text = ''
      try {
        if (file.endsWith('.zst')) {
          if (!zstdDecompress) {
            skipped.push({ file, reason: 'compressed-unsupported（当前 Node 无 zstd API）' })
            continue
          }
          const raw = readFileSync(file)
          const inflated = zstdDecompress(raw)
          // 解压后同样受上限约束：压缩比异常的文件不透支内存
          if (inflated.byteLength > maxFileBytes) {
            skipped.push({ file, reason: `file-too-large-after-decompress（${inflated.byteLength} > ${maxFileBytes}）` })
            continue
          }
          text = inflated.toString('utf8')
        } else {
          text = readFileSync(file, 'utf8')
        }
      } catch (e) {
        const kind = file.endsWith('.zst') ? 'decompress-failed' : 'read-failed'
        skipped.push({ file, reason: `${kind}: ${e instanceof Error ? e.message : String(e)}` })
        continue
      }
      const parsed = parseExternalSession(r.source, text, file, { includeTitles: opts.includeTitles })
      // 属性存在性窄化（不用 .ok 布尔判别）：typecheck:harness 是 --strict false，
      // strictNullChecks 关闭时布尔字面量被放宽为 boolean，判别式收窄失效（本仓实锤两次）。
      if ('row' in parsed) sessions.push(parsed.row)
      else skipped.push({ file, reason: parsed.reason })
    }
  }

  sessions.sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0) || a.file.localeCompare(b.file))
  const truncated = sessions.length > limit
  return {
    available: true,
    roots: { claude: claudeRoot, codex: codexRoot },
    sessions: sessions.slice(0, limit),
    skipped,
    scannedFiles,
    truncated,
  }
}
