// custom/server/orchestrator/ingest.ts
// Trigger 摄入与程序准入（2026-10-31 A+B 批 A 部分 Fast Path）。
// 流程：准入判定 → Trigger 落库（幂等）→ 归 Thread → Decision 落库。
// 本批不调用模型（Slow Path 语义过滤是 D 批），因此 verdict 只来自准入表：
//   accept 单元 → accept；inferred 单元 → accept + inferred 强度；ignore 单元 → ignore。
// 源 mode=observe 时 allow=false 但照常记录，审计可见「本可接单」。
import { defaultCells, getAdmission, admit } from './admission'
import { recordDecision } from './decision'
import { currentPolicyVersion } from './policy-version'
import { insertTrigger, setTriggerStatus, upsertThread } from './store'
import type { AuthStrength, Decision, SourceAdmission, Trigger, TriggerInput } from './types'

export interface IngestResult {
  trigger: Trigger
  duplicated: boolean
  threadId: string
  decision: Decision
  /** true=实际接单（mode=auto 且单元允许）；false=只记录或忽略。 */
  accepted: boolean
  reason: string
}

function admissionFor(sourceId: string): SourceAdmission {
  // 未建档的源按最保守的缺省表（unlisted 一律 ignore）且 observe；不因为缺配置就放行。
  return getAdmission(sourceId) ?? {
    sourceId,
    mode: 'observe',
    allowedSenders: [],
    cells: defaultCells(),
  }
}

function senderListed(admission: SourceAdmission, actor: string | undefined): boolean {
  if (!actor) return false
  const key = actor.trim().toLowerCase()
  return admission.allowedSenders.some(s => s.trim().toLowerCase() === key)
}

export function ingestTrigger(input: TriggerInput, opts: { decidedBy?: string } = {}): IngestResult {
  const admission = admissionFor(input.sourceId)
  const listed = senderListed(admission, input.actor)
  const verdictOf = admit(admission, listed, input.addressed)

  const receivedAt = input.receivedAt ?? Date.now()
  const { trigger, duplicated } = insertTrigger({
    sourceId: input.sourceId,
    sourceKind: input.sourceKind,
    externalId: input.externalId,
    threadKey: input.threadKey,
    actor: input.actor ?? null,
    addressed: input.addressed,
    payload: input.payload,
    receivedAt,
  })
  const thread = upsertThread(input.sourceId, input.threadKey, receivedAt)
  if (duplicated) {
    // 幂等：重复摄入不再产生新决策，返回既有 Trigger 与一次忽略说明。
    const decision = recordDecision({
      triggerId: trigger.id,
      threadId: thread.id,
      verdict: 'ignore',
      strength: 'inferred',
      ruleIds: ['ingest:duplicate'],
      policyVersion: currentPolicyVersion('source-admission'),
      decidedBy: opts.decidedBy ?? 'orchestrator:ingest',
      decidedAt: receivedAt,
    })
    return { trigger, duplicated: true, threadId: thread.id, decision, accepted: false, reason: 'duplicate' }
  }

  const verdict: Decision['verdict'] = verdictOf.action === 'ignore' || verdictOf.action === null
    ? 'ignore'
    : verdictOf.allow ? 'accept' : 'accept'
  const strength: AuthStrength = verdictOf.strength ?? 'inferred'
  const decision = recordDecision({
    triggerId: trigger.id,
    threadId: thread.id,
    verdict,
    strength,
    ruleIds: [`admission:${verdictOf.reason}`],
    policyVersion: currentPolicyVersion('source-admission'),
    decidedBy: opts.decidedBy ?? 'orchestrator:ingest',
    decidedAt: receivedAt,
  })
  const accepted = verdictOf.allow && verdictOf.action !== 'ignore'
  const nextStatus = accepted ? 'routed' : (verdictOf.action === 'ignore' ? 'ignored' : 'pending')
  setTriggerStatus(trigger.id, nextStatus)
  return {
    trigger: { ...trigger, status: nextStatus },
    duplicated: false, threadId: thread.id, decision, accepted, reason: verdictOf.reason,
  }
}
