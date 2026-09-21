// overlay/custom/server/loop/engine/dispatch-reason.ts
// dispatch reason code 词汇表（R6-A，multica dispatch/reason.go:25 语义移植）：
// 任务/agent 分派决策的「为什么没跑/为什么这么跑」稳定枚举，决策分支产生，
// 原样透传到任务卡/会话旁 chip。让「为什么没跑」从不可查变成一眼可见。
// 单一事实源：新增枚举必须带 i18n 键（ia2/ide 同消费），改动即守门 fail。
export type DispatchReasonCode =
  // 可跑
  | 'queued'                  // 已入队等待调度
  | 'handed_off'              // 已交付 worktree + maker
  | 'coalesced'               // 多个触发合并为一次调度
  | 'requeued_after_repair'   // 修复后重排队
  // 不可跑（拦截）
  | 'runtime_offline'         // agent 运行时不在线/不健康
  | 'self_trigger_suppressed' // agent 自己触发自己被抑制（防自跑）
  | 'blocked_dependency'      // 前置依赖未就绪
  | 'max_depth_exceeded'      // 子代理嵌套深度超限
  | 'max_attempts_exceeded'   // 重试次数耗尽（escalated）
  | 'board_concurrency_full'  // 看板并发闸满（排队 reconcile）
  | 'gate_pending_human'      // 流转门禁待人审
  | 'lease_conflict'          // 执行租约被他人持有（分布式）

export interface DispatchReason {
  code: DispatchReasonCode
  /** 人类可读补充（如 "depth 6 > 5"）；为空时 UI 只显 code 词 */
  detail?: string
}

/** 守卫：词表长度（防误删；新增是允许的） */
export const DISPATCH_REASON_CODES: readonly DispatchReasonCode[] = [
  'queued',
  'handed_off',
  'coalesced',
  'requeued_after_repair',
  'runtime_offline',
  'self_trigger_suppressed',
  'blocked_dependency',
  'max_depth_exceeded',
  'max_attempts_exceeded',
  'board_concurrency_full',
  'gate_pending_human',
  'lease_conflict',
]

/** 词表是否合法（运行时校验任意来源的 code） */
export function isDispatchReasonCode(value: unknown): value is DispatchReasonCode {
  return typeof value === 'string' && (DISPATCH_REASON_CODES as readonly string[]).includes(value)
}
