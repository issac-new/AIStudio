// overlay[judgment] 判定席位 · 公共面。
//
// 消费方按需注入 FastPathStore；本模块不读盘、不联网、不感知判定点的业务语义。
export * from './types'
export {
  DEFAULT_MAX_CONSECUTIVE_AUTO,
  DEFAULT_MIN_CONFIDENCE,
  DEFAULT_SOLIDIFY_AFTER,
  advanceConsecutiveAuto,
  resolveSeatPolicy,
  seatMode,
} from './seat'
export { newCandidate, observeEntry, revokeEntry } from './solidify'
