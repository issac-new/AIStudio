// overlay/custom/client/ide/utils/share-range.ts
// 分享选段（G7）：截取消息区间导出 markdown/JSON。纯客户端、只读、不含附件二进制。
export interface ShareMessageLike {
  id?: string
  role: string
  content?: string
  timestamp?: number
  toolName?: string
  toolStatus?: string
}

export interface ShareRange {
  start: number
  end: number
}

function clampRange(messages: ShareMessageLike[], range: ShareRange): [number, number] {
  const last = Math.max(0, messages.length - 1)
  const a = Math.max(0, Math.min(range.start, last))
  const b = Math.max(0, Math.min(range.end, last))
  return a <= b ? [a, b] : [b, a]
}

export function sliceMessages(messages: ShareMessageLike[], range: ShareRange): ShareMessageLike[] {
  if (!messages.length) return []
  const [a, b] = clampRange(messages, range)
  return messages.slice(a, b + 1)
}

function fmtTime(ts?: number): string {
  if (!ts) return ''
  try {
    return new Date(ts).toISOString().replace('T', ' ').slice(0, 19)
  } catch { return '' }
}

export function rangeToMarkdown(messages: ShareMessageLike[], title = '会话选段'): string {
  const lines = [`# ${title}`, '']
  for (const m of messages) {
    const time = fmtTime(m.timestamp)
    const who = m.toolName ? `tool:${m.toolName}` : m.role
    lines.push(`## ${who}${time ? ` · ${time}` : ''}`)
    if (m.toolStatus) lines.push(`> status: ${m.toolStatus}`)
    lines.push('')
    lines.push((m.content || '').trim())
    lines.push('')
  }
  return lines.join('\n')
}

export function rangeToJson(messages: ShareMessageLike[], title = '会话选段'): string {
  return JSON.stringify({
    title,
    exportedAt: new Date().toISOString(),
    messages: messages.map((m) => ({
      ...(m.id ? { id: m.id } : {}),
      role: m.role,
      ...(m.toolName ? { toolName: m.toolName } : {}),
      ...(m.toolStatus ? { toolStatus: m.toolStatus } : {}),
      ...(m.timestamp ? { timestamp: m.timestamp } : {}),
      content: m.content || '',
    })),
  }, null, 2)
}

/** 选段摘要（按钮/确认文案用） */
export function rangeLabel(messages: ShareMessageLike[], range: ShareRange): string {
  const [a, b] = clampRange(messages, range)
  return `${a + 1}-${b + 1} / ${messages.length}`
}
