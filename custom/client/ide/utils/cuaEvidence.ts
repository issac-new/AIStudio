// overlay/custom/client/ide/utils/cuaEvidence.ts
// Cua 截图证据提取：从会话消息的 node_repl 工具结果里找 image content 项。
// zcode CUA 的 screenshot 运行时返回 MCP content 数组
// [{type:'image',data:<base64>,mimeType:'image/png'},{type:'text',...}]，
// 经 event-adapter（payload.result.content）落到 message.toolResult。纯函数，
// 兼容数组 / 字符串化 JSON / 嵌 output 三种到达形态。
export interface CuaEvidence {
  id: string
  data: string
  mimeType: string
  toolName: string
  at: number
  note?: string
}

interface MessageLike {
  id?: string
  role?: string
  toolName?: string
  toolStatus?: string
  timestamp?: number
  toolResult?: unknown
}

const CUA_TOOL_RE = /node_repl|computer[-_]use/i

function contentItems(raw: unknown): Array<Record<string, unknown>> {
  let value: unknown = raw
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return []
    try { value = JSON.parse(trimmed) } catch { return [] }
  }
  if (!value || typeof value !== 'object') return []
  const v = value as Record<string, unknown>
  // 形态 A：直接是 content 数组；形态 B：{content:[...]}；形态 C：{output:{content:[...]}}
  const candidates = [v, v.content, (v.output as Record<string, unknown>)?.content]
  for (const c of candidates) {
    if (Array.isArray(c)) {
      return c.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object')
    }
  }
  return []
}

/** 单条消息里的截图证据（一般 0 或 1 张） */
function evidenceOfMessage(m: MessageLike, index: number): CuaEvidence[] {
  if (!m.toolName || !CUA_TOOL_RE.test(m.toolName)) return []
  const items = contentItems(m.toolResult)
  // note 取首个 text 项（与 image 顺序无关）；截图证据取全部 image 项
  const note = items.find((x) => x.type === 'text' && typeof x.text === 'string')
  const noteText = typeof note?.text === 'string' ? note.text.slice(0, 160) : undefined
  const out: CuaEvidence[] = []
  for (const item of items) {
    if (item.type !== 'image') continue
    const data = typeof item.data === 'string' ? item.data : ''
    const mime = typeof item.mimeType === 'string' ? item.mimeType : 'image/png'
    if (!data || !/^image\//.test(mime)) continue
    // 跳过 http(s) URL 形态（CUA 截图是 base64；URL 不是本地面证据）
    if (/^https?:\/\//i.test(data)) continue
    out.push({
      id: `${m.id ?? `m${index}`}:${out.length}`,
      data: /^data:/.test(data) ? data : `data:${mime};base64,${data}`,
      mimeType: mime,
      toolName: m.toolName,
      at: m.timestamp ?? 0,
      ...(noteText ? { note: noteText } : {}),
    })
  }
  return out
}

/** 会话全部 CUA 截图（新→旧） */
export function collectCuaEvidence(messages: MessageLike[]): CuaEvidence[] {
  const out: CuaEvidence[] = []
  for (let i = 0; i < messages.length; i++) out.push(...evidenceOfMessage(messages[i] ?? {}, i))
  return out.sort((a, b) => b.at - a.at)
}
