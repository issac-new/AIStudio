/**
 * 硬闸打回熔断（融合批一）——判定语义正本自 simharness mx_gate_breaker_trip/check
 * （mx-scenario-lib.sh:1880-1923）提纯：轮次持久化与 ISSUE/approved 留痕由调用方
 * （治理服务/投影层）执行，本模块只做判定，可单测。
 *
 * 语义（方案纪律 8，2026-09-29 g5-ready-fail 记档定性）：
 * - 阈值 2 轮：达阈值后新调用直接拒绝，防 agent 无限重做回路（断点续跑不得静默
 *   重置轮次绕过——持久化在调用方）。
 * - 复位=证据变化：trip 时记录证据签名，check 自比对，新派发/判词/复审/补齐证据
 *   即新尝试自动放行；证据零变化的重复尝试继续拦截（熔断只拦空转，不拦改进）。
 * - 人工复议须 GATE_BREAKER_OVERRIDE=1 + GATE_BREAKER_REASON 同给，缺原因拒绝。
 */

export interface GateBreakerState {
  failRounds: number
  /** trip 时证据签名（scenario 证据行数+integration tip+评审卡哈希，调用方构造） */
  tripSig: string | null
  /** 熔断记单幂等标志（同闸只记一次，run12 214 条重复记录根治） */
  trippedLogged: boolean
}

export const BREAKER_THRESHOLD = 2

export function initialBreaker(): GateBreakerState {
  return { failRounds: 0, tripSig: null, trippedLogged: false }
}

export type BreakerDecision =
  | { action: 'allow'; state: GateBreakerState }
  | { action: 'reset'; state: GateBreakerState; reason: string }
  | { action: 'override'; state: GateBreakerState; reason: string }
  | { action: 'override-refused'; state: GateBreakerState; reason: string }
  | { action: 'block'; state: GateBreakerState; firstLog: boolean; reason: string }

export function tripBreaker(state: GateBreakerState, unpassedRounds: number, sig: string): GateBreakerState {
  return {
    failRounds: state.failRounds + unpassedRounds,
    tripSig: sig,
    trippedLogged: state.trippedLogged,
  }
}

export function checkBreaker(
  state: GateBreakerState,
  currentSig: string,
  override?: { flag: boolean; reason: string },
): BreakerDecision {
  if (state.failRounds < BREAKER_THRESHOLD) return { action: 'allow', state }
  if (state.tripSig != null && state.tripSig !== '' && currentSig !== state.tripSig) {
    return {
      action: 'reset',
      state: { failRounds: 0, tripSig: state.tripSig, trippedLogged: false },
      reason: `证据变化复位（签名 ${state.tripSig}→${currentSig}）：新尝试放行`,
    }
  }
  if (override?.flag) {
    if (!override.reason) {
      return {
        action: 'override-refused',
        state,
        reason: '熔断复议缺原因：GATE_BREAKER_OVERRIDE=1 必须与 GATE_BREAKER_REASON=<原因/变化证据> 同时给出',
      }
    }
    return {
      action: 'override',
      state: { failRounds: 0, tripSig: state.tripSig, trippedLogged: false },
      reason: override.reason,
    }
  }
  return {
    action: 'block',
    state: { ...state, trippedLogged: true },
    firstLog: !state.trippedLogged,
    reason: `打回熔断（${state.failRounds} 轮未过，V3 硬闸）：不得继续。证据变化后自动复位；人工复议须同时给 GATE_BREAKER_OVERRIDE=1 与 GATE_BREAKER_REASON。`,
  }
}
