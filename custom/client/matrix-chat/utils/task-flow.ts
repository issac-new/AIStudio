// overlay/custom/client/matrix-chat/utils/task-flow.ts
// P4③ 群侧栏任务流转时间线（2026-09-28 产品 UI 缺陷修复 §五）：
// 从房间消息流解析任务型事件（派发/完成回执/缺陷/评审结论），渲染"谁→什么操作→何时"。
// 消息模式锚定推演协议真源（simharness/aipay-scenario.sh + skills/inbox-dedup；分树轮 2026-10-03 移居独立仓）：
//   派发：含 card=t_xxx 且 @责任人（RACI 派发消息）
//   完成回执：【完成回执】<任务ID> 已完成（inbox-dedup 技能格式）
//   缺陷：【缺陷】<任务ID> …（defect-loop 技能格式）
//   评审/测试结论：G2 PASS/FAIL、TEST-PASS-xxx / TEST-FAIL-xxx 结论行
// 纯函数无 IO；非任务型消息一律跳过（不虚构事件）。

export interface TaskFlowMessage {
  sender: string
  body: string
  ts: number
}

export type TaskFlowAction = 'dispatch' | 'receipt' | 'defect' | 'verdict'

export interface TaskFlowEvent {
  ts: number
  /** 发送者短名（去 @ 与 :host） */
  actor: string
  action: TaskFlowAction
  /** 关联任务 id（card=t_ 或【】内编号），取不到为空 */
  taskId?: string
  /** 被 @ 的账号短名列表（出现序去重） */
  mentions: string[]
  /** 首行摘要（≤64 字） */
  summary: string
}

const RE_CARD = /\bcard\s*[=:]\s*(t_[a-z0-9]{4,16})\b/i
const RE_RECEIPT = /【完成回执】\s*([A-Za-z0-9_-]{3,32})?/
const RE_DEFECT = /^【缺陷】\s*([A-Za-z0-9_-]{3,32})?/
const RE_VERDICT = /\b(G[1-6]\s*(PASS|FAIL)|TEST-(PASS|FAIL)-[A-Z0-9-]+)\b/
const RE_MENTION = /@([a-z0-9_.-]+?)(?::[a-z0-9.-]+)?(?![a-z0-9_.@-])/gi

export function shortName(mxid: string): string {
  return (mxid || '').trim().replace(/^@/, '').split(':')[0]
}

function extractMentions(body: string): string[] {
  const out: string[] = []
  for (const m of body.matchAll(RE_MENTION)) {
    const name = shortName(m[1])
    if (name && !out.includes(name)) out.push(name)
  }
  return out
}

function summarize(body: string): string {
  const first = body.split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? ''
  return first.length > 64 ? first.slice(0, 64) + '…' : first
}

/** 单条消息分类；非任务型返回 null。 */
export function classifyMessage(msg: TaskFlowMessage): TaskFlowEvent | null {
  const body = msg.body ?? ''
  if (!body.trim()) return null
  const base = {
    ts: msg.ts || 0,
    actor: shortName(msg.sender),
    mentions: extractMentions(body),
    summary: summarize(body),
  }
  const defect = body.match(RE_DEFECT)
  if (defect) return { ...base, action: 'defect', taskId: defect[1] || undefined }
  if (RE_RECEIPT.test(body)) {
    const m = body.match(RE_RECEIPT)
    return { ...base, action: 'receipt', taskId: m?.[1] || undefined }
  }
  const verdict = body.match(RE_VERDICT)
  if (verdict) return { ...base, action: 'verdict', taskId: RE_CARD.exec(body)?.[1] }
  const card = body.match(RE_CARD)
  if (card && base.mentions.length > 0) return { ...base, action: 'dispatch', taskId: card[1] }
  return null
}

/** 房间消息流 → 任务流转事件（按时间升序输入，输出升序；调用方决定截断/倒序展示）。 */
export function parseTaskFlow(messages: TaskFlowMessage[]): TaskFlowEvent[] {
  const out: TaskFlowEvent[] = []
  for (const m of messages) {
    const ev = classifyMessage(m)
    if (ev) out.push(ev)
  }
  return out
}
