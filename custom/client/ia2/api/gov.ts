// overlay/custom/client/ia2/api/gov.ts
// 治理中心数据面（C3/C11 工单，R3/R13——设计正本 §二 S10/S15）。
// 消费 orgloop 既有端点：GET /gate-repairs（闸修复状态机，PR-5）与
// 新增密钥台账对 GET/PUT /key-ledger。纯函数层=单测锚点；fetch 薄封装。
import { authFetch } from '../../ide/utils/auth-fetch'

// ── 类型（服务端契约最小镜像）──

export type GateRepairState = 'fail_registered' | 'repair_dispatched' | 're_review' | 'pass' | 'waived'

export interface GateRepair {
  id: string
  gate: string
  state: GateRepairState
  ts: string
  fail_evidence: string
  missing: string[]
  history: Array<{ ts: string; from: GateRepairState; to: GateRepairState; note: string }>
}

export interface GateRepairsResponse {
  count: number
  records: GateRepair[]
  open: number
}

export interface KeyLedgerEntry {
  name: string
  owner: string
  last_rotated: string
  note: string
}

// ── 纯函数层（测试锚点）──

/** 状态机合法迁移（镜像服务端 canTransition：fail_registered→repair_dispatched
 * →re_review→pass；任意态→waived；pass/waived 终态）——按钮渲染依据。 */
export function legalTransitions(state: GateRepairState): GateRepairState[] {
  if (state === 'pass' || state === 'waived') return []
  const order: GateRepairState[] = ['fail_registered', 'repair_dispatched', 're_review', 'pass']
  const idx = order.indexOf(state)
  return idx >= 0 ? [order[idx + 1], 'waived' as GateRepairState].filter(Boolean) : ['waived']
}

export const GATE_STATE_LABEL: Record<GateRepairState, string> = {
  fail_registered: '已登记失败',
  repair_dispatched: '已派修',
  re_review: '复审中',
  pass: '复审通过',
  waived: '用户豁免',
}

/** 六闸全名（R3 全名首现纪律；闸值 G1-G6|UAT）。 */
export const GATE_FULL_NAME: Record<string, string> = {
  G1: 'G1 需求冻结', G2: 'G2 架构评审', G3: 'G3 代码门禁', G4: 'G4 独立验证',
  G5: 'G5 发布准出', G6: 'G6 复盘', UAT: 'UAT 验收',
}

// ── 纯函数层（C6：问题单对账）──

export interface IssueLine { kind: 'issue' | 'disp'; code: string; subject: string; text: string }
export interface IssuesStats { totalLines: number; totalIssue: number; totalDisp: number; disposed: number; open: number; rate: number | null }

/** ISSUE×DISP 联结（纯函数，测试面）：code 对上=已处置；对不上=未处置如实红显。 */
export function joinIssueDisposal(lines: IssueLine[]): Array<IssueLine & { disposed: boolean; dispText?: string }> {
  const disps = new Map(lines.filter(l => l.kind === 'disp').map(d => [d.code, d.text]))
  return lines
    .filter(l => l.kind === 'issue')
    .map(i => ({ ...i, disposed: disps.has(i.code), dispText: disps.get(i.code) }))
}

// ── fetch 层 ──

async function getJson<T>(path: string): Promise<T> {
  const res = await authFetch(path)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json() as Promise<T>
}

export function fetchGateRepairs(status: 'all' | GateRepairState = 'open'): Promise<GateRepairsResponse> {
  return getJson(`/api/hermes/orgloop/gate-repairs?status=${status}`)
}

export async function transitionGateRepair(id: string, to: GateRepairState, note: string): Promise<GateRepair> {
  const res = await authFetch(`/api/hermes/orgloop/gate-repair/${encodeURIComponent(id)}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, note }),
  })
  if (!res.ok) throw new Error(`transition ${id}→${to} → ${res.status}`)
  return res.json() as Promise<GateRepair>
}

export function fetchKeyLedger(): Promise<{ entries: KeyLedgerEntry[] }> {
  return getJson('/api/hermes/orgloop/key-ledger')
}

export async function putKeyLedger(entries: KeyLedgerEntry[]): Promise<{ entries: KeyLedgerEntry[] }> {
  const res = await authFetch('/api/hermes/orgloop/key-ledger', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entries),
  })
  if (!res.ok) throw new Error(`PUT /api/hermes/orgloop/key-ledger → ${res.status}${res.status === 400 ? `（${(await res.text()).slice(0, 160)}）` : ''}`)
  return res.json() as Promise<{ entries: KeyLedgerEntry[] }>
}

export function fetchIssues(run: string): Promise<{ run: string; count: number; lines: IssueLine[]; stats: IssuesStats; source: string }> {
  return getJson(`/api/hermes/sim/issues?run=${encodeURIComponent(run)}`)
}
