// overlay/custom/server/loop/engine/mention-bus.ts
// @mention 总线分发（R6，multica comment.go:3100 语义）：
// 任务评论入库后解析 @mention——[@agent] 服务端为该 agent enqueue 一个 run，
// @squad 触发 leader 协调，@member 仅进 inbox（不 enqueue）。
// 分发决策留痕：落 dispatch reason + 评论系统行（「为何触发/为何不跑」可审计）。
// 与 R6 dispatcher 认领护栏同源（runtime 在线新鲜度拦截给 runtime_offline）。
import type { DispatchReason, DispatchReasonCode } from './dispatch-reason'

export interface MentionTrigger {
  kind: 'agent' | 'squad' | 'member'
  name: string
}

export interface MentionDispatchResult {
  triggered: boolean
  reason: DispatchReason
  /** 分发动作描述（「为何触发/为何不跑」人类可读，落系统行） */
  action: string
}

export interface MentionBusDeps {
  /** agent 是否在名册（multica roster 判定面） */
  isKnownAgent: (name: string) => boolean
  /** agent runtime 在线（R6 认领护栏同源；false 拦截给 runtime_offline） */
  isRuntimeHealthy: () => boolean
  /** 为该 agent enqueue 一个 run（multica enqueue semantics） */
  enqueueAgentRun: (agentName: string, prompt: string) => Promise<string | null>
  /** R6 squad leader 协调（可选）：@squad 时走 leader 选人+委托+评估 */
  coordinateSquad?: (task: string) => Promise<{ action: 'action' | 'no_action' | 'failed'; reasoning: string }>
}

// 与客户端 ia2/utils/mention.ts 同词表（双端单一事实源注释；正则各自实现）
const AGENT_KEYWORDS = new Set(['agent', 'squad'])
const MENTION_RE = /\[@([^\]\s]+)\]|@([A-Za-z0-9_-]+|[一-龥][A-Za-z0-9_一-龥-]*)/g

export function parseMentionsServer(text: string, isKnownAgent: (name: string) => boolean): MentionTrigger[] {
  if (!text) return []
  const out: MentionTrigger[] = []
  let m: RegExpExecArray | null
  MENTION_RE.lastIndex = 0
  while ((m = MENTION_RE.exec(text))) {
    const name = (m[1] ?? m[2] ?? '').trim()
    if (!name) continue
    const lower = name.toLowerCase()
    const kind: MentionTrigger['kind'] = lower === 'squad' ? 'squad' : AGENT_KEYWORDS.has(lower) || isKnownAgent(name) ? 'agent' : 'member'
    out.push({ kind, name })
  }
  return out
}

/** 分发一条评论的 @mention（返回首个触发结果；无触发 triggered=false） */
export async function dispatchMention(
  taskId: string,
  commentBody: string,
  deps: MentionBusDeps,
): Promise<MentionDispatchResult> {
  const mentions = parseMentionsServer(commentBody, deps.isKnownAgent)
  const trigger = mentions.find((m) => m.kind === 'agent' || m.kind === 'squad')
  if (!trigger) {
    return { triggered: false, reason: { code: 'self_trigger_suppressed' }, action: 'no agent trigger' }
  }
  // R6 认领护栏：runtime 离线不跑（multica slot-before-claim 语义）
  if (!deps.isRuntimeHealthy()) {
    const reason: DispatchReason = { code: 'runtime_offline', detail: 'agent runtime unhealthy' }
    return { triggered: false, reason, action: `${trigger.name} blocked: runtime offline` }
  }
  // R6 squad leader 协调协议（multica squad_briefing 语义）：@squad 走 leader 选人+委托+评估
  if (trigger.kind === 'squad' && deps.coordinateSquad) {
    const evaluation = await deps.coordinateSquad(commentBody)
    const code: DispatchReasonCode = evaluation.action === 'action' ? 'coalesced' : evaluation.action === 'failed' ? 'runtime_offline' : 'self_trigger_suppressed'
    return { triggered: evaluation.action === 'action', reason: { code }, action: `squad leader: ${evaluation.reasoning}` }
  }
  const prompt = `[@mention 总线触发] 任务 ${taskId} 的评论提及你：\n\n${commentBody}\n\n请处理该任务评论所述事项。`
  const runId = await deps.enqueueAgentRun(trigger.name, prompt)
  if (runId) {
    const code: DispatchReasonCode = trigger.kind === 'squad' ? 'coalesced' : 'queued'
    return { triggered: true, reason: { code }, action: `${trigger.kind === 'squad' ? 'squad leader' : trigger.name} enqueued (${runId.slice(0, 12)})` }
  }
  return { triggered: false, reason: { code: 'runtime_offline' }, action: `${trigger.name} enqueue failed` }
}
