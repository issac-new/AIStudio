// overlay：轮导航 rail（dsh-TUI TurnNavigator / deepseek-harness §十 P1-5 吸收，矩阵 §3.8）。
//
// dsh 语义（conversation-nodes turnOutline 投影 + TurnNavigator 轮导航 rail）：会话
// 按轮分组的**轮廓投影**——每轮一行（轮序/步骤数/工具占比/首句锚点），rail 供快速跳转。
// 本模块=纯投影：会话事件 → 轮轮廓（turnOutline），只读聚合。跳转定位=首行序号。
export interface OutlineEvent {
  kind: 'user' | 'assistant' | 'tool'
  at: number
  text?: string
  toolName?: string
}

export interface TurnOutlineEntry {
  turnIndex: number
  /** 该轮首事件序（rail 跳转锚）。 */
  startIndex: number
  /** 轮内首句锚点（截 60 字符，navigator 显示用）。 */
  anchor: string
  steps: number
  toolCalls: number
  /** 该轮时长（末事件 at − 首事件 at，ms）。 */
  durationMs: number
}

/** 事件流→轮轮廓（user 事件起新轮；连续 assistant/tool 归当前轮）。 */
export function buildTurnOutline(events: readonly OutlineEvent[]): TurnOutlineEntry[] {
  const entries: TurnOutlineEntry[] = []
  let current: TurnOutlineEntry | null = null
  events.forEach((e, index) => {
    if (e.kind === 'user') {
      if (current) entries.push(current)
      current = {
        turnIndex: entries.length,
        startIndex: index,
        anchor: (e.text ?? '').trim().slice(0, 60),
        steps: 1,
        toolCalls: 0,
        durationMs: 0,
      }
      return
    }
    if (!current) {
      // 无前置 user 的 assistant/tool 归"系统轮"（cron/后台）——合成首轮。
      current = {
        turnIndex: entries.length,
        startIndex: index,
        anchor: (e.text ?? e.toolName ?? 'system').slice(0, 60),
        steps: 0,
        toolCalls: 0,
        durationMs: 0,
      }
    }
    current.steps += 1
    if (e.kind === 'tool') current.toolCalls += 1
  })
  if (current) entries.push(current)
  // 时长=轮内首末事件 at 差；单事件轮=0。
  entries.forEach((entry) => {
    const idx = entry.startIndex
    let lastAt = events[idx]?.at ?? 0
    for (let i = idx + 1; i < events.length && (i === idx + 1 || events[i].kind !== 'user'); i++) {
      lastAt = Math.max(lastAt, events[i].at)
    }
    entry.durationMs = Math.max(0, lastAt - (events[idx]?.at ?? 0))
  })
  return entries
}

/** 轮导航摘要（dsh rail 行数与工具热度）。 */
export function outlineSummary(outline: readonly TurnOutlineEntry[]): { turns: number; toolCalls: number; avgTurnMs: number } {
  const turns = outline.length
  const toolCalls = outline.reduce((s, e) => s + e.toolCalls, 0)
  const avgTurnMs = turns ? Math.round(outline.reduce((s, e) => s + e.durationMs, 0) / turns) : 0
  return { turns, toolCalls, avgTurnMs }
}
