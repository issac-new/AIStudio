/**
 * 决策落账记录器（乙4，2026-09-30 调研落地）——四类 studio 决策进 Semantica KG。
 *
 * 落账面（fire-and-forget，主链路绝不等待/绝不因 KG 故障失败）：
 *   1. dispatch  —— 列编排派发路由（column-dispatch 每条 outcome）
 *   2. approval  —— 审批裁决（approval-log appendApprovalLog 单一收口点，覆盖全部 6 调用面）
 *   3. escalation —— 升级裁决（escalation-controller decide 路由）
 *   4. gate      —— qgate 门禁判定（sync-gates 端点批量摄取，seen 标记防重）
 *
 * 模型路由决策不在此列（如实登记：模型路由发生在 hermes 运行时侧，studio 无决策点）。
 * 去重：commandId/targetId 内存 Set（进程生命周期）+ bridge 端 scenario 天然幂等不去重
 * （重复落账代价=图谱冗余节点，不影响正确性——不引入跨进程去重状态面）。
 */
import { recordDecision, findSimilar, type BridgeDecision } from './semantica-client'

const seenKeys = new Set<string>()

function once(key: string): boolean {
  if (seenKeys.has(key)) return false
  seenKeys.add(key)
  if (seenKeys.size > 5000) seenKeys.clear()  // 防无界增长：清空重放代价=可能重复落账，可接受
  return true
}

/** 派发 outcome → 决策 outcome 映射（zcode/dispatch-reasons 冻结词表 → 三态）。 */
export function dispatchOutcomeToDecision(reason: string): { outcome: string; confidence: number } {
  if (reason === 'queued' || reason === 'coalesced') return { outcome: 'approved', confidence: 0.9 }
  if (reason === 'deferred') return { outcome: 'deferred', confidence: 0.6 }
  return { outcome: 'rejected', confidence: 0.7 }
}

export function recordDispatchDecision(input: {
  column: string; specialist?: string; role?: string; provider: string
  reason: string; commandId?: string; text: string
}): void {
  const key = `dispatch:${input.commandId ?? `${input.column}:${input.specialist ?? input.provider}:${input.text.slice(0, 60)}`}`
  if (!once(key)) return
  const { outcome, confidence } = dispatchOutcomeToDecision(input.reason)
  void recordDecision({
    category: 'dispatch',
    scenario: `[kanban:${input.column}] ${input.specialist ?? input.provider} ${input.role ?? ''}`.trim().slice(0, 400),
    reasoning: input.text.replace(/\s+/g, ' ').slice(0, 400),
    outcome,
    confidence,
    decisionMaker: 'column-orchestration',
    metadata: { column: input.column, specialist: input.specialist, role: input.role, reason: input.reason, commandId: input.commandId },
    linkPrecedent: true,
  })
}

export function recordApprovalDecision(input: {
  targetKind: string; targetId: string; targetTitle: string; decision: string; actor: string; note?: string
}): void {
  const key = `approval:${input.targetKind}:${input.targetId}:${input.decision}:${input.actor}`
  if (!once(key)) return
  void recordDecision({
    category: 'approval',
    scenario: `${input.targetKind}:${input.targetTitle || input.targetId}`.slice(0, 400),
    reasoning: input.note ?? '',
    outcome: input.decision.toLowerCase().includes('deny') || input.decision.toLowerCase().includes('reject')
      ? 'rejected'
      : input.decision.toLowerCase().includes('approve') ? 'approved' : 'deferred',
    confidence: 0.85,
    decisionMaker: input.actor,
    metadata: { targetKind: input.targetKind, targetId: input.targetId, decision: input.decision },
    linkPrecedent: true,
  })
}

export function recordEscalationDecision(input: {
  escalationId: string; fromAgent: string; tool: string; verdict: 'approved' | 'denied'; by: string; note?: string
}): void {
  const key = `escalation:${input.escalationId}`
  if (!once(key)) return
  void recordDecision({
    category: 'escalation',
    scenario: `${input.fromAgent} 申请 ${input.tool}`.slice(0, 400),
    reasoning: input.note ?? '',
    outcome: input.verdict === 'approved' ? 'approved' : 'rejected',
    confidence: 0.85,
    decisionMaker: input.by,
    metadata: { escalationId: input.escalationId, fromAgent: input.fromAgent, tool: input.tool },
    linkPrecedent: true,
  })
}

export function recordGateRunDecision(input: {
  runId: string; verdict: string; gateId?: string; gateName?: string
}): void {
  const key = `gate:${input.runId}`
  if (!once(key)) return
  void recordDecision({
    category: 'gate',
    scenario: `${input.gateName ?? input.gateId ?? 'qgate'} ${input.runId}`.slice(0, 400),
    reasoning: 'qgate run 判定（.qgate/runs 摄取）',
    outcome: input.verdict === 'pass' ? 'approved' : input.verdict === 'fail' ? 'rejected' : 'deferred',
    confidence: input.verdict === 'pass' || input.verdict === 'fail' ? 0.95 : 0.5,
    decisionMaker: 'qgate',
    metadata: { runId: input.runId, verdict: input.verdict, gateId: input.gateId },
    linkPrecedent: false,
  })
}

// ---- 乙5：先例检索回灌（带 TTL 缓存 + 预算超时） ----

const precedentCache = new Map<string, { at: number; line: string | null }>()
const PRECEDENT_TTL_MS = 10 * 60 * 1000

export interface PrecedentLine {
  /** 拼进派单文本的一行先例摘要；null=无先例/检索失败（不占行）。 */
  line: string | null
  fromCache: boolean
}

/**
 * 派单先例行（乙5）：检索相似历史决策，"上次同类任务怎么判的"随负载下发。
 * 判定权仍在契约块（先例仅参考注入，不构成判定依据——防"历史绑架现在"）。
 */
export async function precedentLineFor(scenarioKey: string, scenario: string): Promise<PrecedentLine> {
  const cached = precedentCache.get(scenarioKey)
  if (cached && Date.now() - cached.at < PRECEDENT_TTL_MS) return { line: cached.line, fromCache: true }
  let line: string | null = null
  try {
    const sims: BridgeDecision[] = await findSimilar(scenario, 'dispatch', 2)
    const top = sims[0]
    if (top && (top.similarity ?? 0) >= 0.4) {
      const outcomeZh = top.outcome === 'approved' ? '放行' : top.outcome === 'rejected' ? '拒派' : '暂缓'
      line = `历史先例（相似度 ${(top.similarity! * 100).toFixed(0)}%，仅供参考不构成判定依据）：同类派单上次${outcomeZh}${top.decidedBy && top.decidedBy !== 'unknown' ? `（${top.decidedBy}）` : ''}。`
    }
  } catch { /* fail-soft：无先例行 */ }
  precedentCache.set(scenarioKey, { at: Date.now(), line })
  return { line, fromCache: false }
}

/** 测试面：清缓存与 seen 去重。 */
export function resetRecorderStateForTests(): void {
  seenKeys.clear()
  precedentCache.clear()
}
