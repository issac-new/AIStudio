// overlay/custom/client/ia2/api/overview.ts
// 签 1 轮次总览（驾驶屏）数据面（B 波收尾件，R1/R3/R6/N1——设计正本 §二 S1）。
// 消费 X1 透传端点 GET /api/hermes/sim/run-state（正身=observability 631）。
// 纯函数层（姿态档/闸全名行/净额双行）=单测锚点；数字一律来自端点实测，不手编。
import { authFetch } from '../../ide/utils/auth-fetch'

export interface RunStateResponse {
  run: string
  posture: string
  gates: Record<string, string>
  steps: Record<string, string>
  ledger: { total: number; open: number; byType: Record<string, number> }
  source: { stateFile: string; ledgerFile: string; ledgerPresent: boolean }
}

// ── 纯函数层（测试锚点）──

export type PostureKind = 'strict' | 'standard' | 'demo' | 'unknown'

/** 姿态档判定（§1.5 三档；非三档值=unknown 如实灰显，不猜）。 */
export function postureKind(posture: string): PostureKind {
  if (posture === 'strict' || posture === 'standard' || posture === 'demo') return posture
  return 'unknown'
}

export interface GateRow { key: string; label: string; value: string }

/** 闸全名行（R3：六闸全名首现；G1-G6 键+安全闸/人工批准/收尾键，值原样透传）。 */
export function gateRows(gates: Record<string, string>): GateRow[] {
  const FULL: Array<[RegExp, string]> = [
    [/^g1[a-z_]*/, 'G1 需求冻结'],
    [/^g2[a-z_]*/, 'G2 架构评审'],
    [/^g3[a-z_]*/, 'G3 编码门禁'],
    [/^g4[a-z_]*/, 'G4 独立测试'],
    [/^g5[a-z_]*/, 'G5 发布准出'],
    [/^g6[a-z_]*/, 'G6 复盘'],
    [/^security_/, '安全闸'],
    [/^humangate/, '人工批准（HumanGate）'],
    [/^report_done$/, '报告完成'],
    [/^close_done$/, '收尾完成'],
  ]
  return Object.entries(gates).map(([key, value]) => ({
    key,
    label: FULL.find(([re]) => re.test(key))?.[1] ?? key,
    value,
  }))
}

/** 净额双行卡数据（N1：含代偿与净额并列，只呈含代偿行即虚报）。 */
export function netCardRows(ledger: { total: number; open: number; byType: Record<string, number> }): {
  compensated: string; net: string; byType: Array<{ type: string; count: number }>
} {
  return {
    compensated: `台账 ${ledger.total} 笔，未清 ${ledger.open}`,
    net: `已清 ${ledger.total - ledger.open}`,
    byType: Object.entries(ledger.byType).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
  }
}

// ── fetch 层 ──

export async function fetchRunState(run: string): Promise<RunStateResponse> {
  const res = await authFetch(`/api/hermes/sim/run-state?run=${encodeURIComponent(run)}`)
  if (!res.ok) throw new Error(`/api/hermes/sim/run-state → ${res.status}`)
  return res.json() as Promise<RunStateResponse>
}
