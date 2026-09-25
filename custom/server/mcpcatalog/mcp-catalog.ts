// overlay/mcpcatalog 域：MCP 目录化（antigravity §四 P2-10 吸收，矩阵 §3.1 antigravity P2）。
//
// antigravity 语义（MCP 目录化安装：Store 目录源 + disabledTools 工具级禁用）：
// MCP server 不只配置——**目录化**（可从目录浏览安装，antigravity 56 源 Store）+
// **工具级禁用**（disabledTools：server 接了但个别工具禁——不是全有全无）。
// 衔接 mcp-config（配置面）：本层=目录与工具级开关面。
export interface McpCatalogEntry {
  serverId: string
  name: string
  /** 目录源（Store 条目；自装为空）。 */
  storeSource: string | null
  tools: string[]
  /** 工具级禁用（disabledTools 语义）。 */
  disabledTools: string[]
}

export interface CatalogView {
  installed: number
  storeInstalled: number
  disabledToolCount: number
}

/** 工具级禁用 toggle（disabledTools 语义：非全有全无）。 */
export function toggleTool(
  entries: readonly McpCatalogEntry[],
  serverId: string, tool: string, disabled: boolean,
): McpCatalogEntry[] {
  return entries.map((e) => {
    if (e.serverId !== serverId || !e.tools.includes(tool)) return e
    const set = new Set(e.disabledTools)
    if (disabled) set.add(tool)
    else set.delete(tool)
    return { ...e, disabledTools: [...set].sort() }
  })
}

/** 目录视图汇总（Store 装机数/禁用工具数——面板数据面）。 */
export function catalogView(entries: readonly McpCatalogEntry[]): CatalogView {
  return {
    installed: entries.length,
    storeInstalled: entries.filter((e) => e.storeSource !== null).length,
    disabledToolCount: entries.reduce((s, e) => s + e.disabledTools.length, 0),
  }
}

/** 可用工具（全工具-禁用——装配面）。 */
export function availableTools(entry: McpCatalogEntry): string[] {
  return entry.tools.filter((t) => !entry.disabledTools.includes(t))
}
