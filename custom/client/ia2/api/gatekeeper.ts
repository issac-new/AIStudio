// overlay/custom/client/ia2/api/gatekeeper.ts
// S7 审批待办数据面（B3 工单，R5/R6——设计正本 §二 S7）。
// 消费 orgloop X2 端点：介入点聚合 /interventions/pending 与清偿门 /ledger
// （resolve/waive/check-clearance）。纯函数层（分组/收尾令模板）=守门测试锚点，
// fetch 层只做薄封装；类型按服务端 aggregateInterventions/computeClearanceView
// 的响应形状最小镜像，多余字段透传不裁剪。
import { authFetch } from '../../ide/utils/auth-fetch'

// ── 类型（服务端契约的最小镜像）──

export type InterventionSourceKind = 'gate' | 'approval' | 'clearance' | 'uat' | 'registry'

export interface InterventionPointView {
  id: string
  title: string
  sourceKind: InterventionSourceKind
  sourceKey: string
  /** 决策前提（批准前必须成立的前提，服务端静态登记；三篇调研轮 A 件）。旧后端缺席=如实显示缺席 */
  belief?: string | null
  /** true=等人决定；false=已办；null=源缺席状态未知（如实不猜） */
  pending: boolean | null
}

export interface InterventionsView {
  points: InterventionPointView[]
  sources: Record<string, 'ok' | 'absent'>
}

export interface ClearanceRow {
  id: string
  type: string
  defect: string
  detail: string
  status: string
  state: 'open' | 'resolved' | 'waived'
}

export interface ClearanceLedgerView {
  rows: ClearanceRow[]
  open: number
  resolved: number
  waived: number
  pass: boolean
}

// ── 纯函数层（测试锚点）──

/** 清偿队列按处置目标分组（键=defect 优先、缺席回落 type，与服务端清偿匹配键同轴）。 */
export function groupClearanceTargets(view: ClearanceLedgerView): Array<{
  target: string
  openCount: number
  types: string[]
}> {
  const map = new Map<string, { target: string; openCount: number; types: Set<string> }>()
  for (const r of view.rows) {
    if (r.state === 'resolved' || r.state === 'waived') continue
    const key = r.defect || r.type
    const hit = map.get(key) ?? { target: key, openCount: 0, types: new Set<string>() }
    hit.openCount += 1
    hit.types.add(r.type)
    map.set(key, hit)
  }
  return [...map.values()]
    .map(g => ({ target: g.target, openCount: g.openCount, types: [...g.types] }))
    .sort((a, b) => b.openCount - a.openCount)
}

/** 收尾三步指令模板（R5 延伸：结论行＋翻卡＋禁再跑——派发词极简单步纪律）。 */
export function buildClosingOrder(cardId: string, commitHint?: string): string {
  const anchor = `收尾三步（只做这三步，做完即停）：
1. 在群里发一行结论行：${cardId} DONE ${commitHint ? `提交 ${commitHint}，` : ''}一句话结果
2. 把看板卡 ${cardId} 翻到 done
3. 发完即停——禁止再跑任何新步骤`
  return anchor
}

// ── fetch 层（薄封装；失败抛错由调用方呈现，不静默）──

async function getJson<T>(path: string): Promise<T> {
  const res = await authFetch(path)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json() as Promise<T>
}

export function fetchInterventionsPending(): Promise<InterventionsView> {
  return getJson('/api/hermes/orgloop/interventions/pending')
}

export function fetchClearanceLedger(): Promise<ClearanceLedgerView> {
  return getJson('/api/hermes/orgloop/ledger')
}

export async function resolveClearance(target: string, pr: string, commit?: string): Promise<ClearanceLedgerView> {
  const res = await authFetch('/api/hermes/orgloop/clearance/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, pr, commit }),
  })
  if (!res.ok) throw new Error(`resolve → ${res.status}`)
  return res.json() as Promise<ClearanceLedgerView>
}

export async function waiveClearance(target: string, reason: string): Promise<ClearanceLedgerView> {
  const res = await authFetch('/api/hermes/orgloop/clearance/waive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, reason }),
  })
  if (!res.ok) throw new Error(`waive → ${res.status}`)
  return res.json() as Promise<ClearanceLedgerView>
}
