// overlay/importer 域：多源会话历史导入适配面（zcode §七 #22 待排期项，从零件）。
//
// 语义（zcode §七 #22 "Claude 历史导入改造：换源 codex/kimi 导入器"）：zcode 底座
// 有 claude-native 导入器（services/src/session/claude-native/），Ycode 需支持
// **多源**导入——codex / kimi / claude 三源会话格式 → 统一导入行（SessionImportRow），
// 供 zcode 导入管线消费。本模块=源适配面（纯解析：各源 JSONL/JSON 形状→统一行+来源
// 标记），落盘与会话创建归 zcode 导入器（职责分界：本层只换源，不做会话写入）。
export type ImportSourceKind = 'codex' | 'kimi' | 'claude'

export interface SessionImportRow {
  source: ImportSourceKind
  /** 原会话 id（各源原样）。 */
  sourceId: string
  role: 'user' | 'assistant' | 'tool'
  text: string
  at: number
}

export interface SessionImport {
  source: ImportSourceKind
  sourceId: string
  rows: SessionImportRow[]
  /** 解析告警（坏行计数——导入不因单行坏而丢全会话）。 */
  skippedRows: number
}

/**
 * 三源解析（各源历史格式→统一行）：
 * - codex：jsonl 每行 {type:'message', role, content:[{type:'input_text'|'output_text',text}], timestamp}
 * - kimi：jsonl 每行 {role, content}（字符串或 parts 数组）
 * - claude：jsonl 每行 {type:'user'|'assistant', message:{content}}（数组分段）
 * 坏行跳过计数（不抛），文本空跳过。
 */
export function parseSessionHistory(source: ImportSourceKind, sourceId: string, lines: readonly string[]): SessionImport {
  const rows: SessionImportRow[] = []
  let skipped = 0
  for (const line of lines) {
    if (!line.trim()) continue
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(line)
    } catch {
      skipped += 1
      continue
    }
    const row = parseRow(source, obj)
    if (row) rows.push({ ...row, source, sourceId })
    else skipped += 1
  }
  return { source, sourceId, rows, skippedRows: skipped }
}

function parseRow(source: ImportSourceKind, obj: Record<string, unknown>): Omit<SessionImportRow, 'source' | 'sourceId'> | null {
  const at = typeof obj.timestamp === 'number' ? obj.timestamp : typeof obj.at === 'number' ? obj.at : 0
  if (source === 'codex') {
    if (obj.type !== 'message' || typeof obj.role !== 'string') return null
    const content = obj.content
    const text = Array.isArray(content)
      ? content.map((c) => (c as { text?: string })?.text ?? '').join('')
      : typeof content === 'string' ? content : ''
    return toRow(obj.role, text, at)
  }
  if (source === 'kimi') {
    const role = obj.role
    const content = obj.content
    const text = typeof content === 'string' ? content
      : Array.isArray(content) ? content.map((c) => (c as { text?: string })?.text ?? '').join('') : ''
    return toRow(String(role ?? ''), text, at)
  }
  // claude：{type:'user'|'assistant', message:{content}}
  const type = obj.type
  const msg = obj.message as { content?: unknown } | undefined
    | undefined
  const content = msg?.content
  const text = typeof content === 'string' ? content
    : Array.isArray(content) ? content.map((c) => (c as { text?: string })?.text ?? '').join('') : ''
  return toRow(String(type ?? ''), text, at)
}

function toRow(role: string, text: string, at: number): Omit<SessionImportRow, 'source' | 'sourceId'> | null {
  const r = role === 'user' || role === 'assistant' || role === 'tool' ? role : null
  if (!r || !text.trim()) return null
  return { role: r, text, at }
}
