// overlay/custom/server/tokens/fleet-tree.ts
// Fleet 编队子树聚合（context-insights P3，对标 dsh-context Fleet 标签页）。
// 单源=studio sessions 表：parent_session_id 父子链 + 逐会话 token/成本列。
// 纯 fold：给定会话 → 定根 → 收子树 → 卡片化（父/当前/子）+ 子树合计。
// 子女卡上限 FLEET_MAX（dsh-context 40 节点先例），超限截断显式标注。
export interface FleetSessionRow {
  id: string
  parent_session_id: string | null
  title: string | null
  agent: string
  model: string
  message_count: number
  tool_call_count: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  reasoning_tokens: number
  estimated_cost_usd: number
  actual_cost_usd: number | null
  last_active: number
  is_archived: number
}

export interface FleetCard {
  sessionId: string
  role: 'root' | 'parent' | 'current' | 'child'
  title: string
  agent: string
  model: string
  messageCount: number
  toolCallCount: number
  billedTokens: number
  costUsd: number
  lastActive: number
  isArchived: boolean
  /** 该节点自身子树合计（children 卡不带，保持卡片轻量；根卡给全树合计） */
  subtreeTokens: number | null
  subtreeCostUsd: number | null
}

export interface FleetResult {
  rootId: string
  /** 当前会话直系父卡（当前即根时为 null） */
  parent: FleetCard | null
  current: FleetCard
  children: FleetCard[]
  totals: { sessions: number; billedTokens: number; costUsd: number }
  childrenTruncated: boolean
}

export const FLEET_MAX = 40

function billedTokensOf(row: FleetSessionRow): number {
  return row.input_tokens + row.output_tokens + row.cache_read_tokens + row.cache_write_tokens
}

function costOf(row: FleetSessionRow): number {
  return typeof row.actual_cost_usd === 'number' ? row.actual_cost_usd : row.estimated_cost_usd
}

/**
 * 会话行全集 → 指定会话的 Fleet 视图。
 * @param rows 候选行（调用方给足：根链祖先 + 全体子女后代；本函数不查库）
 * @param sessionId 当前会话
 */
export function foldFleetTree(rows: readonly FleetSessionRow[], sessionId: string): FleetResult | null {
  const byId = new Map(rows.map(r => [r.id, r]))
  const current = byId.get(sessionId)
  if (!current) return null

  // 定根：沿 parent 链上行（环防御：步数上限=行数）
  let root = current
  for (let i = 0; i < rows.length; i++) {
    const pid = root.parent_session_id
    if (!pid) break
    const parent = byId.get(pid)
    if (!parent) break
    root = parent
  }

  // 子女索引 + 子树收集（BFS 自根）
  const childrenOf = new Map<string, FleetSessionRow[]>()
  for (const r of rows) {
    if (!r.parent_session_id) continue
    const list = childrenOf.get(r.parent_session_id)
    if (list) list.push(r)
    else childrenOf.set(r.parent_session_id, [r])
  }
  const subtree: FleetSessionRow[] = []
  const queue: string[] = [root.id]
  const visited = new Set<string>([root.id])
  const subtreeTokensBy = new Map<string, number>()
  const subtreeCostBy = new Map<string, number>()
  while (queue.length) {
    const id = queue.shift()!
    const row = byId.get(id)
    if (!row) continue
    subtree.push(row)
    subtreeTokensBy.set(id, billedTokensOf(row))
    subtreeCostBy.set(id, costOf(row))
    for (const child of childrenOf.get(id) ?? []) {
      // 环防御：脏 parent 链可造 a↔b 环，BFS 必须 visited 去重否则死循环
      if (!visited.has(child.id)) {
        visited.add(child.id)
        queue.push(child.id)
      }
    }
  }
  // 后序合并子树合计（叶子→根）：Map 按逆 BFS 序累加即可（子先于父入表）
  for (let i = subtree.length - 1; i >= 0; i--) {
    const row = subtree[i]!
    for (const child of childrenOf.get(row.id) ?? []) {
      subtreeTokensBy.set(row.id, (subtreeTokensBy.get(row.id) ?? 0) + (subtreeTokensBy.get(child.id) ?? 0))
      subtreeCostBy.set(row.id, (subtreeCostBy.get(row.id) ?? 0) + (subtreeCostBy.get(child.id) ?? 0))
    }
  }

  const cardOf = (row: FleetSessionRow, role: FleetCard['role']): FleetCard => ({
    sessionId: row.id,
    role,
    title: row.title || (row.id.length > 12 ? `${row.id.slice(0, 11)}…` : row.id),
    agent: row.agent,
    model: row.model,
    messageCount: row.message_count,
    toolCallCount: row.tool_call_count,
    billedTokens: billedTokensOf(row),
    costUsd: costOf(row),
    lastActive: row.last_active,
    isArchived: row.is_archived === 1,
    subtreeTokens: null,
    subtreeCostUsd: null,
  })

  const allChildren = (childrenOf.get(sessionId) ?? [])
    .slice()
    .sort((a, b) => b.last_active - a.last_active)
  const childrenTruncated = allChildren.length > FLEET_MAX

  return {
    rootId: root.id,
    parent: current.parent_session_id && byId.has(current.parent_session_id)
      ? cardOf(byId.get(current.parent_session_id)!, 'parent')
      : null,
    current: { ...cardOf(current, 'current'), subtreeTokens: subtreeTokensBy.get(sessionId) ?? null, subtreeCostUsd: subtreeCostBy.get(sessionId) ?? null },
    children: allChildren.slice(0, FLEET_MAX).map(r => cardOf(r, 'child')),
    totals: {
      sessions: subtree.length,
      billedTokens: subtreeTokensBy.get(root.id) ?? 0,
      costUsd: subtreeCostBy.get(root.id) ?? 0,
    },
    childrenTruncated,
  }
}
