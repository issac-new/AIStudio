// overlay[zcode] R4-P2 · 第一批吸收 #1：dispatch reason code 统一词汇表。
//
// 吸收自 multica dispatch/reason.go（MUL-4525 跨层共享 leaf 包模式，upstream/multica
// 2026-09-25 增量扫描仍为权威源）：枚举在「决策分支处产生、原样透传到 UI、永不从
// 人类可读错误串反推」——「为什么没跑」一眼可见，且枚举安全（不泄露私有目标存在性）。
// 成功路径与失败路径同表；运行时四分档的判据是「等待有没有用」。
//
// 冻结纪律：枚举值一旦发布即冻结，UI chip 与持久化按字面值匹配；新增只追加，
// 改名走废弃期。使用方（投影事件 P2 / @mention 派单 P3 / 看板门禁 P4）禁止私造
// 本表之外的 reason 字符串。
export const DISPATCH_REASON_CODES = [
  // ── 成功路径（已受理/合并/暂缓）──
  'queued',                  // 已入队待执行
  'coalesced',               // 并入既有待发（单 pending 槽 / 评论合并）
  'deferred',                // 有意暂缓（条件窗口未到）
  // ── 权限与目标（multica 原语义，枚举安全）──
  'invocation_not_allowed',  // 当前主体无权触发该目标（不区分「私有」与「不存在」）
  'target_unavailable',      // 目标不可运行（已归档 / 无 assignee / 不可解析）
  // ── 运行时四分档 ──
  'runtime_offline',         // 在册运行时离线——机器回来即恢复，等待有用
  'runtime_unusable',        // 机器在线但 agent CLI 不可执行——等待无用须修复
  'runtime_access_denied',   // 可调用目标但运行时归属绑定拒绝执行
  'runtime_profile_missing', // CLI 健在但协议 profile 缺失——重装 CLI 无效
  'agent_runtime_required',  // 未绑定任何运行时——没有机器可等
  // ── 归因与状态 ──
  'attribution_blocked',     // fail-closed 工作区解析不到责任人
  'already_active',          // 目标已有活跃 run 且本次未合并
  'self_trigger_suppressed', // 自触发抑制（如 leader @ 自己的 squad）
  // ── 引擎通道（Ycode 投影/派单链扩展）──
  'engine_unreachable',      // zcode 引擎服务（WS :3030）不可达
  'handshake_failed',        // v4 握手失败（协议版本不匹配等）
  'subscription_failed',     // topic 订阅建立失败
  'subscription_lapsed',     // 订阅断线丢失，重订阅前不投
  'frame_fragment_skipped',  // fragment 物理帧未消费（重组列后批），按 topic 计数
  'frame_malformed',         // 帧结构非法（缺 topic/frame/payload 等）
  'command_rejected',        // 引擎拒绝命令（引擎侧 reasonCode 原样透传）
  'internal_error',          // 未预期错误（detail 携带摘要）
] as const

export type DispatchReasonCode = (typeof DISPATCH_REASON_CODES)[number]

/** 边界校验（引擎侧透传字符串 / 持久化读回时用），未知值回退 internal_error。 */
export function coerceDispatchReasonCode(v: unknown): DispatchReasonCode {
  return typeof v === 'string' && (DISPATCH_REASON_CODES as readonly string[]).includes(v)
    ? (v as DispatchReasonCode)
    : 'internal_error'
}
