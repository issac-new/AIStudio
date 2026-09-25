// overlay：会话连续性四态徽标（routa §七#11 P2 吸收，矩阵 §3.6 P2）。
//
// routa 语义（api/sessions/route.ts:17-46 会话连续性四态）：
// - **active**：活跃（最近有事件且连接在）；
// - **interrupted**：中断（有事件但断连——需重连续跑）；
// - **restorable**：可恢复（历史会话，7 天内）；
// - **stale**：陈旧（超 7 天阈值，恢复需明确确认）。
// 7 天阈值=routa 原语义。纯投影：会话数据→四态（徽标数据面）。
export type ContinuityState = 'active' | 'interrupted' | 'restorable' | 'stale'

export interface SessionFacts {
  lastEventAt: number
  connected: boolean
  /** 会话是否已结束（completed/terminated 语义）。 */
  ended: boolean
}

export interface ContinuityBadge {
  state: ContinuityState
  /** 展示文案键（i18n 由 UI 层做）。 */
  stateKey: string
  /** 陈旧判定日龄（stale>7 天）。 */
  ageDays: number
}

const STALE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

/** 会话数据→四态（routa 语义：active 优先/中断靠断连/可恢复靠 7 天线）。 */
export function sessionContinuity(facts: SessionFacts, now: number = Date.now()): ContinuityBadge {
  const ageDays = Math.max(0, Math.floor((now - facts.lastEventAt) / DAY_MS))
  let state: ContinuityState
  if (facts.connected && !facts.ended) {
    state = 'active'
  } else if (!facts.ended && ageDays <= STALE_DAYS) {
    // 未结束但断连：interrupted（活跃中断）——恢复即续跑。
    state = 'interrupted'
  } else if (ageDays <= STALE_DAYS) {
    state = 'restorable'
  } else {
    state = 'stale'
  }
  return { state, stateKey: `sessionContinuity.${state}`, ageDays }
}
