// overlay/custom/client/ide/utils/todo-parse.ts
// B5 todo 常驻条的内容解析（todo_list 工具快照 → 条目列表）。纯函数单测直连。
// 兼容形态：JSON（{todos:[...]} 或裸数组）/ 文本行（"- [pending] x"、"2. [in_progress] x"）。
// 解析不出条目返回空数组（调用方自隐藏，不做假数据）。

export type TodoStatus = 'pending' | 'in_progress' | 'completed'
export interface TodoItem { status: TodoStatus; text: string }

export function parseTodoContent(content: string): TodoItem[] {
  try {
    const parsed = JSON.parse(content) as { todos?: Array<{ status?: string; content?: string; text?: string }> } | Array<{ status?: string; content?: string; text?: string }>
    const arr = Array.isArray(parsed) ? parsed : parsed?.todos
    if (Array.isArray(arr) && arr.length) {
      return arr.map((t) => ({
        status: (t.status === 'completed' || t.status === 'in_progress') ? t.status : 'pending',
        text: String(t.content ?? t.text ?? '').trim(),
      })).filter((t) => t.text)
    }
  } catch { /* 非 JSON 走文本解析 */ }
  const items: TodoItem[] = []
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/(pending|in_progress|completed)/i)
    if (!m) continue
    const status = (m[1].toLowerCase() === 'in_progress' ? 'in_progress' : m[1].toLowerCase() === 'completed' ? 'completed' : 'pending') as TodoStatus
    const text = line
      .replace(/^[-*\d.\s\]›）)\[（(☐◐☑✓✗]+/, '')
      .replace(/[\[（(]?(pending|in_progress|completed)[\]）)]?/i, '')
      .trim()
    if (text) items.push({ status, text })
  }
  return items
}
