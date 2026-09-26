// overlay：会话分叉客户端半边（UI 融合 fork——zcode v4 原生 forkAssistant 落地）。
// 链路：GET /api/zcode-engine/rows（行缓存锚）→ 定位该轮前最近一条 complete 的
// assistantText 行 → POST /api/zcode-engine/fork（引擎切分支，行流 row.removed
// 截断+新分支行回放）。失败如实抛错（引擎 guard 如 forkAssistantOnly 也透传）。
export interface EngineRow {
  rowId: number
  entityId?: string
  kind: string
  state?: string
  text: string
}

export async function fetchEngineRows(workspacePath: string, sessionId: string): Promise<EngineRow[]> {
  const params = new URLSearchParams({ workspacePath, sessionId })
  const res = await fetch(`/api/zcode-engine/rows?${params.toString()}`)
  if (!res.ok) throw new Error(`rows ${res.status}`)
  const body = (await res.json()) as { rows?: EngineRow[] }
  return body.rows ?? []
}

/** 定位 fork 锚：最后一条 complete 的 assistantText 行（zcode forkAssistant 语义）。 */
export function findForkAnchor(rows: readonly EngineRow[]): EngineRow | null {
  const candidates = rows.filter((r) => r.kind === 'assistantText' && (r.state ?? 'complete') === 'complete' && r.entityId)
  return candidates.length ? candidates[candidates.length - 1] : null
}

export async function forkAtAnchor(workspacePath: string, sessionId: string, anchor: EngineRow): Promise<{ ok: boolean; status?: string; reasonCode?: string }> {
  const res = await fetch('/api/zcode-engine/fork', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspacePath, sessionId, rowId: anchor.rowId, entityId: anchor.entityId }),
  })
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; status?: string; reasonCode?: string }
  if (!res.ok || !body.ok) throw new Error(body.reasonCode || `fork ${res.status}`)
  return body as { ok: boolean; status?: string; reasonCode?: string }
}
