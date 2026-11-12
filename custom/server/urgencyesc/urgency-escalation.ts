// overlay/urgencyesc 域：agent→coordinator 权限升级（urgency 三档，矩阵 §3.6 行 199 P1）。
//
// 语义（agent 请求 coordinator 介入的紧急度三档）：
// - **low**：排队升级（coordinator 空闲再批，不打断）；
// - **normal**：即时请示（进 coordinator 收件箱前列）；
// - **critical**：抢占升级（打断 coordinator 当前事，立即批）。
// 审批路径由档位决定；衔接 402 审批五档八态与 escalation 域（456 升级协议）。
export type Urgency = 'low' | 'normal' | 'critical'

export interface EscalationRequest {
  fromAgent: string
  urgency: Urgency
  reason: string
}

export interface EscalationRoute {
  urgency: Urgency
  /** 路由动作：queue/inbox-first/preempt。 */
  action: 'queue' | 'inbox-first' | 'preempt'
  /** 是否打断 coordinator 当前事。 */
  interrupts: boolean
  /** 理由为空一律拒（升级必录）。 */
  ok: boolean
  refusal?: string
}

const ROUTES: Record<Urgency, Pick<EscalationRoute, 'action' | 'interrupts'>> = {
  low: { action: 'queue', interrupts: false },
  normal: { action: 'inbox-first', interrupts: false },
  critical: { action: 'preempt', interrupts: true },
}

/** 升级路由判定（urgency 三档语义；升级必录理由）。 */
export function escalate(req: EscalationRequest): EscalationRoute {
  if (!req.reason.trim()) {
    return { ...ROUTES[req.urgency], urgency: req.urgency, ok: false, refusal: '升级必录：reason 为空拒绝升级' }
  }
  return { ...ROUTES[req.urgency], urgency: req.urgency, ok: true }
}
