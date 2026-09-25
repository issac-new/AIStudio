// overlay[zcode] P1：分派预演 WillEnqueueRun（multica §3.1 分派预演吸收，矩阵 §3.5 P1）。
//
// multica 语义（service/issue_trigger.go:76-97 WillEnqueueRun + handler/issue_trigger.go:119
// PreviewRequest）：**写路径与 preview 端点共用同一谓词**——"这次指派会不会起跑、
// 为谁跑"的单一事实源，UI 能在用户点确定前告诉他结果与原因，绝不两套判定漂移。
//
// Ycode 形状：判定核已收敛到 mention-dispatch.ts planDispatch（P-A(d)）——写路径
// dispatchOne 与本预演调同一份纯判定（目标解析→known/deferred→自触发→槽→可达性），
// 本文件只做「mention 解析 → 逐条预测 → 预演信封」的映射。历史漂移（squads.yaml
// review 的 leader=codex 在 deferred 名单：预演回 queued、写路径回 deferred；引擎
// 离线同理）由同源判定消除，不再靠两处手抄判定序保持一致。
import { parseMentions, planDispatch, type PlanFacts } from './mention-dispatch'
import type { DispatchReasonCode } from './dispatch-reasons'

export interface EnqueuePreview {
  target: string
  mentionKind: 'agent' | 'squad'
  /** 预测 reason（与写路径 outcome 词表同源）。 */
  reason: DispatchReasonCode
  /** 会不会起跑（queued 或 coalesced 算会动，其余不会）。 */
  willRun: boolean
  /** 为谁跑（squad=leader；agent=自身；不会跑回 '-'）。 */
  runsFor: string
  detail: string
}

export interface PreviewContext extends PlanFacts {
  /** 派单发起者（自触发抑制判定；与写路径 per-call 同源）。 */
  mentionAuthor?: string
  /** 引擎可达性事实（预演入口探测后传入——可达性是判定序末位，不可再各判各的）。 */
  engineOnline: boolean
}

/**
 * 预演一次派单文本的全部 mention（多 mention 逐条预测）。纯函数：零副作用。
 */
export function willEnqueueRun(
  text: string, workspacePath: string, ctx: PreviewContext,
): EnqueuePreview[] {
  return parseMentions(text).map((token) => predictOne(token, workspacePath, ctx))
}

function predictOne(
  token: { target: string; kind: 'agent' | 'squad' }, workspacePath: string, ctx: PreviewContext,
): EnqueuePreview {
  const plan = planDispatch({
    token,
    workspacePath,
    mentionAuthor: ctx.mentionAuthor,
    engineOnline: ctx.engineOnline,
  }, ctx)
  return {
    target: token.target,
    mentionKind: token.kind,
    reason: plan.reason,
    willRun: plan.action !== 'reject',
    runsFor: plan.reason === 'target_unavailable' ? '-' : plan.runsFor,
    detail: plan.detail,
  }
}
