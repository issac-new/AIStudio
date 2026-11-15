// overlay/lineage 域：会话溯源面（2026-11-15，Proactive AI 二轮挂账清偿·完整会话溯源）。
//
// 论文 §7.2.1：审计链要把「行动」回连到「产生它的内部推断」——本域的读侧最小实现：
// 给定一个会话（或看板卡），把散落在各账本里的同一件事串起来：
//   · 决策轨迹 ← approval-ledger（recordType/tool/riskClass/mode/decidedBy）
//   · 持久意图 ← standing-agenda（mandateGoal＋evidence＋cardId/sessionId）
//   · 交付证据 ← evidence-store（artifact/verification/delivery_snapshot 的 base..head diff）
// 只读聚合，不新开账本（机制预算：无新 ledger 类目）；各源 fail-soft——缺席如实进 coverage.note，
// 不猜、不补零。**未接入**：会话档案（sessionarchive 无统一读取器）与会话 fork 关系
// （sessionfork 是纯函数，需调用方喂会话集）——这两面在 note 里显式声明未覆盖。
import { readApprovalLedger, type ApprovalLedgerRecord } from '../approval-ledger/ledger-store'
import { listEvidence, type EvidenceRecord } from '../evidence/evidence-store'
import { readAgendas } from '../standingagenda/agenda-store'

export interface LineageKey {
  sessionId?: string
  taskId?: string
}

export interface LineageDecision {
  at: string | number | null
  recordType: string
  tool: string
  riskClass: string
  mode: string
  decidedBy: string
  entryPoint?: string
}

export interface LineageIntent {
  id: string
  title: string
  mandateGoal: string
  status: string
  parkedAt: number
  resumeCount: number
  cardId?: string
  goalId?: string
}

export interface LineageEvidenceRow {
  evidenceId: string
  kind: string
  ref: string
  at: number
  artifactType?: string
  milestone?: string
  verdict?: string
  note?: string
}

export interface LineageDiff {
  evidenceId: string
  base: string
  head: string
  at: number
}

export interface LineageView {
  key: LineageKey
  decisions: LineageDecision[]
  intents: LineageIntent[]
  evidence: LineageEvidenceRow[]
  diffs: LineageDiff[]
  coverage: {
    approvalsScanned: number
    agendasScanned: number
    evidenceScanned: number
    /** 派生出的卡锚（由 agenda 反查得到，供深链）。 */
    derivedTaskId?: string
  }
  note: string
}

export interface LineageSources {
  approvals: ApprovalLedgerRecord[]
  agendas: Array<{
    id: string
    title: string
    mandateGoal: string
    status: string
    parkedAt: number
    resumeCount: number
    sessionId?: string
    cardId?: string
    goalId?: string
  }>
  evidence: EvidenceRecord[]
}

export const LINEAGE_LIMITS = {
  /** 审批账本最多扫多少条（账本是全局流，按 sessionId 过滤）。 */
  approvals: 2000,
  /** 单任务证据最多取多少条。 */
  evidence: 200,
} as const

/**
 * 纯函数：按 key 过滤各源并投影。
 * 过滤语义：sessionId 精确匹配审批账；agenda 按 sessionId 或 cardId（taskId）匹配；
 * 证据按 taskId 整取（evidence 台账本身就是 taskId 分档）。
 */
export function buildLineage(key: LineageKey, sources: LineageSources): LineageView {
  const sessionId = key.sessionId?.trim() || undefined
  const inputTaskId = key.taskId?.trim() || undefined
  if (!sessionId && !inputTaskId) {
    throw new Error('lineage 需要 sessionId 或 taskId 之一')
  }

  const agendas = sources.agendas.filter((a) =>
    (sessionId && a.sessionId === sessionId) || (inputTaskId && a.cardId === inputTaskId),
  )
  // 卡锚派生：显式 taskId 优先；否则取匹配到的第一条 agenda 的 cardId
  const derivedTaskId = inputTaskId ?? agendas.find((a) => a.cardId)?.cardId
  const approvals = sessionId
    ? sources.approvals.filter((r) => r.sessionId === sessionId).slice(0, LINEAGE_LIMITS.approvals)
    : []
  const evidence = derivedTaskId ? sources.evidence.slice(0, LINEAGE_LIMITS.evidence) : []

  const decisions: LineageDecision[] = approvals.map((r) => ({
    at: (r as { ts?: string | number }).ts ?? null,
    recordType: String(r.recordType ?? ''),
    tool: String(r.tool ?? ''),
    riskClass: String(r.riskClass ?? ''),
    mode: String(r.mode ?? ''),
    decidedBy: String(r.decidedBy ?? ''),
    ...(r.entryPoint ? { entryPoint: r.entryPoint } : {}),
  }))

  const intents: LineageIntent[] = agendas.map((a) => ({
    id: a.id,
    title: a.title,
    mandateGoal: a.mandateGoal,
    status: a.status,
    parkedAt: a.parkedAt,
    resumeCount: a.resumeCount,
    ...(a.cardId ? { cardId: a.cardId } : {}),
    ...(a.goalId ? { goalId: a.goalId } : {}),
  }))

  const evidenceRows: LineageEvidenceRow[] = evidence.map((e) => ({
    evidenceId: e.evidenceId,
    kind: String(e.kind),
    ref: e.ref,
    at: e.at,
    ...(e.artifactType ? { artifactType: e.artifactType } : {}),
    ...(e.milestone ? { milestone: e.milestone } : {}),
    ...(e.verdict ? { verdict: e.verdict } : {}),
    ...(e.note ? { note: e.note } : {}),
  }))

  const diffs: LineageDiff[] = evidence
    .filter((e) => e.revision?.base && e.revision?.head)
    .map((e) => ({ evidenceId: e.evidenceId, base: e.revision!.base, head: e.revision!.head, at: e.at }))

  const missing: string[] = []
  if (sessionId && decisions.length === 0) missing.push('该会话在审批账本无记录（可能未走审批链或账本已轮转）')
  if (evidence.length === 0) missing.push(derivedTaskId ? '该任务无证据记录' : '未定位到卡锚（无 taskId 且 agenda 未带 cardId），证据面为空')
  if (intents.length === 0) missing.push('该会话/卡无 standing agenda 记录')

  return {
    key: { ...(sessionId ? { sessionId } : {}), ...(derivedTaskId ? { taskId: derivedTaskId } : {}) },
    decisions,
    intents,
    evidence: evidenceRows,
    diffs,
    coverage: {
      approvalsScanned: sources.approvals.length,
      agendasScanned: sources.agendas.length,
      evidenceScanned: sources.evidence.length,
      ...(derivedTaskId ? { derivedTaskId } : {}),
    },
    note:
      '只读聚合（不新开账本）。已覆盖：审批决策轨迹、standing agenda 持久意图、evidence 交付证据与 delivery_snapshot diff。'
      + '未覆盖：会话档案（sessionarchive 无统一读取器）、会话 fork 血缘（sessionfork 需调用方喂会话集）——这两面如实声明未接入。'
      + (missing.length ? ` 缺口：${missing.join('；')}。` : ''),
  }
}

/** IO 适配器：读三个既有账本（各源独立 fail-soft，单源坏不拖垮其余）。 */
export function collectLineage(key: LineageKey): LineageView {
  let approvals: ApprovalLedgerRecord[] = []
  try { approvals = readApprovalLedger(LINEAGE_LIMITS.approvals) } catch { approvals = [] }
  let agendas: LineageSources['agendas'] = []
  try { agendas = readAgendas().records } catch { agendas = [] }
  const taskId = key.taskId?.trim() || agendas.find((a) => (key.sessionId ? a.sessionId === key.sessionId : false) && a.cardId)?.cardId
  let evidence: EvidenceRecord[] = []
  if (taskId) {
    try { evidence = listEvidence(taskId, undefined, LINEAGE_LIMITS.evidence) } catch { evidence = [] }
  }
  return buildLineage({ ...key, ...(taskId ? { taskId } : {}) }, { approvals, agendas, evidence })
}
