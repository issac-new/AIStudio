// 网关生命周期告警识别。
//
// swarm-agent 的 gateway 在关闭/重启时，会向所有活跃会话推送一条告警
// （upstream/swarm-agent/gateway/run.py:4497）：
//   "⚠️ Gateway shutting down — Your current task will be interrupted."
//   "⚠️ Gateway restarting — Your current task will be interrupted. Send any message..."
// 这类消息本质是系统事件而非对话内容，命中后由 chat store 打 systemType: 'gateway'
// 标记，渲染层据此折叠为紧凑系统提示。
//
// 抽成独立模块而非埋进 store，是为了能在 custom/** 下被 vitest 直接单测
// （vitest.config.ts 的 include 只跑 custom/**/*.test.ts）。

const GATEWAY_NOTICE_RE = /^⚠️\s*Gateway\s+(shutting down|restarting)\b/i

/** 判断文本是否为网关关闭/重启告警。 */
export function isGatewayNotice(content: unknown): boolean {
  const text = typeof content === 'string' ? content.trim() : ''
  return text.length > 0 && GATEWAY_NOTICE_RE.test(text)
}

// chat store 中 Message.systemType 的联合类型（与 stores/hermes/chat.ts 保持一致）。
// 在此独立声明而非 import，避免 overlay 模块反向依赖上游 store。
export type MessageSystemType = 'command' | 'error' | 'fork-divider' | 'gateway'

/**
 * 计算消息应使用的 systemType：
 * - 若 currentSystemType 已显式设置（非 undefined），原样返回——尊重 error/command 等已有语义；
 * - 否则命中告警返回 'gateway'，未命中返回 undefined。
 *
 * 用于 chat store 的历史回放与 addMessage 兜底两处打标入口。
 */
export function tagGatewayNotice(
  content: unknown,
  currentSystemType: MessageSystemType | undefined,
): MessageSystemType | undefined {
  if (currentSystemType !== undefined) return currentSystemType
  return isGatewayNotice(content) ? 'gateway' : undefined
}
