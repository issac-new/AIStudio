// overlay[zcode] P1：分派预演 WillEnqueueRun（multica §3.1 分派预演吸收，矩阵 §3.5 P1）。
//
// multica 语义（service/issue_trigger.go:76-97 WillEnqueueRun + handler/issue_trigger.go:119
// PreviewRequest）：**写路径与 preview 端点共用同一谓词**——"这次指派会不会起跑、
// 为谁跑"的单一事实源，UI 能在用户点确定前告诉他结果与原因，绝不两套判定漂移。
//
// Ycode 形状：对 @mention 派单链（mention-dispatch.ts）做纯预测——不执行、不占
// pending 槽，只走与 dispatchOne 相同的判定序（目标解析→已知/旧链→pending 槽→
// 自触发）返回预测 outcome reason。写路径侧（dispatchOne）后续可换调用本谓词
// 保持同源；本件先落 preview 面+谓词本身（同源点在两处 reason 枚举即词表共用）。
import { parseMentions, type DispatchEnginePort, type MentionOutcome } from './mention-dispatch'
import { resolveSquad, isSelfTrigger } from './squad-protocol'
import type { DispatchReasonCode } from './dispatch-reasons'

export interface EnqueuePreview {
  target: string
  mentionKind: 'agent' | 'squad'
  /** 预测 reason（与写路径 outcome 词表同源）。 */
  reason: DispatchReasonCode
  /** 会不会起跑（queued 或 coalesced 算会动，其余不会）。 */
  willRun: boolean
  /** 为谁跑（squad=leader；agent=自身）。 */
  runsFor: string
  detail: string
}

export interface PreviewContext {
  engine: DispatchEnginePort
  knownAgents: Set<string>
  deferredAgents: Set<string>
  mentionAuthor?: string
  /** 当前活跃 pending 槽（workspace::agent 集合），写路径同源读。 */
  pendingKeys: ReadonlySet<string>
  now: () => number
  pendingTtlMs: number
  /** pending 槽时间戳（workspace::agent → since），过期槽不算活跃。 */
  pendingSince: ReadonlyMap<string, number>
}

/**
 * 预演一次派单文本的全部 mention（多 mention 逐条预测）。纯函数：零副作用。
 */
export function willEnqueueRun(
  text: string, workspacePath: string, ctx: PreviewContext,
): EnqueuePreview[] {
  return parseMentions(text).map((token) => predictOne(token, workspacePath, ctx))
}

function predictOne(token: { target: string; kind: 'agent' | 'squad' }, workspacePath: string, ctx: PreviewContext): EnqueuePreview {
  const base = { target: token.target, mentionKind: token.kind }
  const slotKey = (agent: string) => `${workspacePath}::${agent}`
  const slotActive = (agent: string) => {
    const since = ctx.pendingSince.get(slotKey(agent))
    return since !== undefined && ctx.now() - since < ctx.pendingTtlMs
  }

  if (token.kind === 'squad') {
    const squad = resolveSquad(token.target)
    if (!squad) {
      return { ...base, reason: 'target_unavailable', willRun: false, runsFor: '-', detail: `未知 squad：${token.target}` }
    }
    if (ctx.mentionAuthor && isSelfTrigger(squad, ctx.mentionAuthor)) {
      return { ...base, reason: 'self_trigger_suppressed', willRun: false, runsFor: squad.leader, detail: `leader ${squad.leader} 自触发抑制` }
    }
    const runsFor = squad.leader
    if (slotActive(runsFor)) {
      return { ...base, reason: 'coalesced', willRun: true, runsFor, detail: `并入 ${runsFor} 活跃 run` }
    }
    return { ...base, reason: 'queued', willRun: true, runsFor, detail: `将起跑（leader ${runsFor}）` }
  }

  // 与写路径构造器同语义：deferred 隐含已知（先于未知判定）。
  const known = ctx.deferredAgents.has(token.target) || ctx.knownAgents.has(token.target)
  if (!known) {
    return { ...base, reason: 'target_unavailable', willRun: false, runsFor: '-', detail: `未知 agent：${token.target}` }
  }
  if (ctx.deferredAgents.has(token.target)) {
    return { ...base, reason: 'deferred', willRun: false, runsFor: token.target, detail: '非 zcode 引擎 agent 走 hermes 旧链' }
  }
  if (slotActive(token.target)) {
    return { ...base, reason: 'coalesced', willRun: true, runsFor: token.target, detail: '并入活跃 run（不另起）' }
  }
  return { ...base, reason: 'queued', willRun: true, runsFor: token.target, detail: '将起跑' }
}
