// overlay/custom/client/ia2/api/overview.ts
// S1 轮次总览数据面（旗舰签 B2 工单——设计正本 2026-10-16-sim-center-detailed-design.md 签 1）。
// 消费 X1 端点：GET /api/hermes/sim/run-state（姿态/闸键/步键/台账摘要）、
// GET /api/hermes/sim/deliverables（evidence/ 13 类交付物核对）、
// GET /api/hermes/sim/issues（issues.log ISSUE/DISP 聚合）。
// fetch 层薄封装照 api/supervision.ts 模式：失败抛错由调用方如实呈现（N1/N2），
// 纯计算不在此层——26 步折算/KPI 聚合=views/sim/steps-registry.ts（§3.3 前端副本）。
//
// 超出工单三函数清单的必要补件（如实注明）：fetchBranches 供 KPI「分支交付 n/6」
// （详设签 1 KPI 行第二卡；端点 X1 已就绪=GET /api/hermes/sim/branches，只读消费）。
import { authFetch } from '../../ide/utils/auth-fetch'

// ── 类型（服务端契约最小镜像，锚 simcenter-controller.ts） ──

export interface RunStateLedger { total: number; open: number; byType: Record<string, number> }

export interface RunStateResponse {
  run: string
  posture: string
  gates: Record<string, string>
  steps: Record<string, string>
  ledger: RunStateLedger
  source: { stateFile: string; ledgerFile: string; ledgerPresent: boolean }
}

export interface DeliverableItem { name: string; label: string; status: 'present' | 'absent'; file: string | null }

export interface DeliverablesResponse { run: string; deliverables: DeliverableItem[]; scanned: number }

export interface IssueLine { kind: 'issue' | 'disp'; code: string; subject: string; text: string }

export interface IssuesResponse {
  run: string
  count: number
  lines: IssueLine[]
  stats: {
    totalLines: number
    totalIssue: number
    totalDisp: number
    disposed: number
    open: number
    rate: number | null
  }
  source: string
}

export interface BranchRow {
  name: string
  localTs: number
  pushed: boolean
  pushTs: number | null
  freshness: 'fresh' | 'stale' | 'old'
}

export interface BranchesResponse { run: string; graceMs: number; count: number; branches: BranchRow[] }

// ── fetch 层（薄封装，同 supervision.ts getJson 模式） ──

async function getJson<T>(path: string): Promise<T> {
  const res = await authFetch(path)
  if (!res.ok) throw new Error(`${path} → ${res.status}${res.status === 404 || res.status === 400 || res.status === 503 ? `（${(await res.text()).slice(0, 120)}）` : ''}`)
  return res.json() as Promise<T>
}

export function fetchRunState(run: string): Promise<RunStateResponse> {
  return getJson(`/api/hermes/sim/run-state?run=${encodeURIComponent(run)}`)
}

export function fetchDeliverables(run: string): Promise<DeliverablesResponse> {
  return getJson(`/api/hermes/sim/deliverables?run=${encodeURIComponent(run)}`)
}

export function fetchIssues(run: string): Promise<IssuesResponse> {
  return getJson(`/api/hermes/sim/issues?run=${encodeURIComponent(run)}`)
}

/** KPI 分支交付卡数据面（详设签 1；X1 就绪端点只读消费，SIM_BRANCHES_REPO 缺席=503 由调用方如实缺席呈现） */
export function fetchBranches(run: string): Promise<BranchesResponse> {
  return getJson(`/api/hermes/sim/branches?run=${encodeURIComponent(run)}`)
}
