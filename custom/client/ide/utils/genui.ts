// overlay/custom/client/ide/utils/genui.ts
// Gen UI 指令解析（对齐 zcode 3.15.1 packages/ui/src/gen-ui/domain/references.ts）：
//   ::visualize{path="/work/demo.html" title="..." mode="wide"}
//   ::visualize{"path":"/work/demo.html","title":"..."}
// 规则：代码块内的示例忽略；路径必须绝对、无 ..、非 URL；mode 只收 wide/fullscreen。
// 安全边界在消费侧：只读工作区内文件、iframe 无 same-origin、CSP、大小上限。
export interface GenUiReference {
  path: string
  title?: string
  mode?: 'wide' | 'fullscreen'
  offset: number
}

/** 返回文本中代码块覆盖的区间（含围栏行）；按行扫描，未闭合围栏到文末。 */
function codeRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  let openStart: number | null = null
  let offset = 0
  for (const line of text.split('\n')) {
    const lineStart = offset
    const lineEnd = offset + line.length
    offset = lineEnd + 1
    if (/^\s*(```|~~~)/.test(line)) {
      if (openStart === null) openStart = lineStart
      else {
        ranges.push([openStart, lineEnd])
        openStart = null
      }
    }
  }
  if (openStart !== null) ranges.push([openStart, text.length])
  return ranges
}

/** 找到从 start 开始的平衡大括号体（尊重引号与转义）；返回 [bodyStart, bodyEndExclusive] */
function balancedBody(text: string, start: number): [number, number] | null {
  if (text[start] !== '{') return null
  let depth = 0
  let quote: string | null = null
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (escaped) { escaped = false; continue }
      if (ch === '\\') { escaped = true; continue }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return [start + 1, i]
    }
  }
  return null
}

/** key=value（值必须带引号）或 {"key":"value"} 两种体；失败返回 null */
function parseBody(body: string): Record<string, unknown> | null {
  const trimmed = body.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('"') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed.startsWith('{') ? trimmed : `{${trimmed}}`)
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
    } catch { return null }
  }
  const out: Record<string, unknown> = {}
  const re = /([A-Za-z][\w-]*)\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g
  let m: RegExpExecArray | null
  while ((m = re.exec(trimmed))) {
    const raw = m[2]
    const value = raw.slice(1, -1).replace(/\\(["'\\])/g, '$1')
    out[m[1]] = value
  }
  return Object.keys(out).length ? out : null
}

export function isSafeGenUiPath(path: string): boolean {
  if (!path || typeof path !== 'string') return false
  // URL / protocol：协议名至少两个字符（避免把 Windows 盘符 C: 误判为协议）
  if (/^[a-zA-Z][a-zA-Z0-9+.-]+:/.test(path)) return false
  if (path.includes('\0') || path.includes('\n') || path.includes('\r')) return false
  const normalized = path.replace(/\\/g, '/')
  if (normalized.split('/').some((p) => p === '..')) return false
  // 绝对：POSIX / 或 Windows 盘符
  return normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized)
}

/** 路径必须在工作区根内（root 为空时不做前缀约束，交给文件 API 沙箱） */
export function isWithinWorkspace(path: string, root?: string | null): boolean {
  if (!isSafeGenUiPath(path)) return false
  if (!root) return true
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const base = norm(root)
  const target = norm(path)
  return target === base || target.startsWith(`${base}/`)
}

export interface GenUiParseResult {
  references: GenUiReference[]
  invalid: number
}

/** 解析文本中的 ::visualize 指令（按出现顺序）；代码块内的忽略。 */
export function parseGenUiDirectives(text: string): GenUiParseResult {
  if (!text || !text.includes('::visualize')) return { references: [], invalid: 0 }
  const ranges = codeRanges(text)
  const inCode = (i: number) => ranges.some(([a, b]) => i >= a && i < b)
  const references: GenUiReference[] = []
  let invalid = 0
  let cursor = 0
  while (true) {
    const at = text.indexOf('::visualize', cursor)
    if (at < 0) break
    cursor = at + '::visualize'.length
    if (inCode(at)) continue
    let i = cursor
    while (i < text.length && /\s/.test(text[i])) i++
    if (text[i] !== '{') { invalid++; continue }
    const body = balancedBody(text, i)
    if (!body) { invalid++; continue }
    cursor = body[1] + 1
    const parsed = parseBody(text.slice(body[0], body[1]))
    if (!parsed) { invalid++; continue }
    const path = typeof parsed.path === 'string' ? parsed.path.trim() : ''
    if (!isSafeGenUiPath(path)) { invalid++; continue }
    const title = typeof parsed.title === 'string' ? parsed.title.trim().slice(0, 120) : undefined
    const mode = parsed.mode === 'wide' || parsed.mode === 'fullscreen' ? parsed.mode : undefined
    references.push({ path, ...(title ? { title } : {}), ...(mode ? { mode } : {}), offset: at })
  }
  return { references, invalid }
}

/** 从一组消息文本里汇总指令（保留来源消息 id） */
export function collectGenUiReferences(
  messages: Array<{ id?: string; role?: string; content?: string }>,
  root?: string | null,
): Array<GenUiReference & { messageId?: string }> {
  const out: Array<GenUiReference & { messageId?: string }> = []
  const seen = new Set<string>()
  for (const m of messages) {
    if (m.role !== 'assistant' && m.role !== 'system') continue
    if (!m.content || !m.content.includes('::visualize')) continue
    for (const ref of parseGenUiDirectives(m.content).references) {
      if (!isWithinWorkspace(ref.path, root)) continue
      const key = `${ref.path}\u0000${ref.title ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ ...ref, messageId: m.id })
    }
  }
  return out
}

/** 渲染前的最小加固：iframe srcdoc 的 CSP（无网络、无外链） */
export const GEN_UI_SRCDOC_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; font-src data:;"
export const GEN_UI_MAX_SOURCE_BYTES = 512 * 1024

export function wrapGenUiHtml(html: string, title?: string): string {
  const csp = `<meta http-equiv="Content-Security-Policy" content="${GEN_UI_SRCDOC_CSP}">`
  const t = title ? `<title>${title.replace(/[<>&"]/g, '')}</title>` : '<title>Gen UI</title>'
  if (/<head[\s>]/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${csp}${t}`)
  return `<!doctype html><html><head>${csp}${t}</head><body>${html}</body></html>`
}
