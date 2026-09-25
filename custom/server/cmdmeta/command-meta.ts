// overlay/cmdmeta 域：命令面板元数据（minimax §六 C 表 P2 吸收，矩阵 §3.4 P2）。
//
// minimax 语义（命令面板元数据模型 category×discoverability×visibleWhen）：
// slash 命令不只一条命令——带**分类**（category：会话/文件/工具/帮助）、
// **可发现性**（discoverability：always=常显/hint=提示可见/hidden=仅键入可见）
// 与**可见条件**（visibleWhen：按上下文谓词，如会话进行中才显"中断"）。
// 面板渲染=三元组过滤（category 分组+discoverability 层级+visibleWhen 谓词）。
export type CommandCategory = 'session' | 'file' | 'tool' | 'help'
export type Discoverability = 'always' | 'hint' | 'hidden'

export interface CommandMeta {
  name: string
  category: CommandCategory
  discoverability: Discoverability
  /** 可见条件（context keys 白名单语义：全部命中才显；空=无条件）。 */
  visibleWhen: string[]
}

export interface PanelContext {
  /** 当前上下文键集（如 ['running'] / ['has-session']）。 */
  keys: string[]
  /** 键入了命令前缀（hint 档键入后可见）。 */
  typed: boolean
}

/** 命令→面板可见性（三元组过滤：discoverability 层级+visibleWhen 谓词）。 */
export function commandVisible(meta: CommandMeta, ctx: PanelContext): boolean {
  // visibleWhen：上下文键全部命中才显（multica/minimax 语义）。
  if (meta.visibleWhen.length > 0 && !meta.visibleWhen.every((k) => ctx.keys.includes(k))) {
    return false
  }
  // discoverability：always 常显；hint 键入后显；hidden 仅精确键入显。
  if (meta.discoverability === 'always') return true
  return ctx.typed
}

/** 面板分组过滤（category 分组+可见性过滤，按命令名字典序）。 */
export function panelGroups(metas: readonly CommandMeta[], ctx: PanelContext): Record<CommandCategory, string[]> {
  const out: Record<CommandCategory, string[]> = { session: [], file: [], tool: [], help: [] }
  for (const m of metas) {
    if (commandVisible(m, ctx)) out[m.category].push(m.name)
  }
  for (const k of Object.keys(out) as CommandCategory[]) out[k].sort()
  return out
}
