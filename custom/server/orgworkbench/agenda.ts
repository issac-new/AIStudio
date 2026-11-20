/**
 * 组织工作台·决策议程（批三 T3，spec 2026-11-21-ai-native-orgworkbench-batch3 §三，
 * 设计 §4.7）——纯只读投影，零写面。
 *
 * 定位：把散在各权威域「等人决定」的事项聚成一张议程。判据（哪些事值得上议程）：
 * 待审批/双签（outcome 绑定或双签条目）、逾期结果、假设到期/被推翻、评审分歧、
 * 权限升级、学习候选、团队草稿待确认。例行进度不入（例行审批、正常推进不进）。
 *
 * 纪律：
 * - 六源全注入（每源一个读函数）——本模块不碰盘，装配层（org-workbench-controller）
 *   传真实源；测试传桩。源失败≠「没有待决事项」：抛异常→该源 available:false+error，
 *   绝不伪装成 0 条，也不阻断其他源。
 * - 审批源复用 approval-inbox/pending-sources 的 collectPendingItems（D3 单一事实源）。
 * - 人处理决定仍回原权威域（审批账/PremiseLog/expcandidates/OutcomeTeam）；议程不提供写面。
 * - 「阻塞」不伪造状态机 blocked 态——被审批卡住的信号由审批源覆盖，不重复计项（D2）。
 */
import { dueQueue } from '../premiselog/premise-log'
import type { Premise } from '../premiselog/premise-log'
import type { PendingItem } from '../approval-inbox/pending-sources'
import type { ReviewCase, ReviewFinding } from '../reviewgov/types'
import type { EscalationRequest } from '../escalation/escalation-store'
import type { ExpCandidate } from '../expcandidates/exp-types'

/** 议程项 kind（spec §三枚举，九种）。 */
export type AgendaItemKind =
  | 'approval_pending'
  | 'dual_sign_pending'
  | 'outcome_overdue'
  | 'premise_due'
  | 'premise_refuted'
  | 'review_disagreement'
  | 'escalation_pending'
  | 'learning_candidate'
  | 'team_pending'

/**
 * 源 kind（读函数粒度，七个）。spec §三的「六源」按问题域编号（源 4=评审分歧和升级、
 * 源 2/6 同出 outcome 域）；这里按底层账本拆成独立读源——reviewgov 与 escalation、
 * 合同与团队是不同存储、不同失败面，「每源独立 available」只有按账本粒度才诚实。
 */
export type AgendaSourceKind =
  | 'approvals'
  | 'outcome_contracts'
  | 'premises'
  | 'review_cases'
  | 'escalations'
  | 'exp_candidates'
  | 'outcome_teams'

/** 风险档词汇：审批域 ApprovalRiskTier 与 outcome 域 RiskTier 同词表（low/medium/high）。 */
export type AgendaRiskTier = 'low' | 'medium' | 'high'

/** 可逆性词汇（outcome 域 REVERSIBILITY_LEVELS；六源 v1 无可逆性正身数据，一律缺席不猜）。 */
export type AgendaReversibility = 'reversible' | 'costly' | 'one-way' | 'unknown'

/** 议程项（设计 §4.7 形状）。 */
export interface AgendaItem {
  /** 稳定 id：`<kind>:<源记录 id>`——同一事项重复出现只计一项（去重键）。 */
  agendaId: string
  /** 关联结果合同（无合同关联的源缺省）。 */
  outcomeId?: string
  kind: AgendaItemKind
  /** 人要回答的问题（中文文案，客户端原样呈现）。 */
  question: string
  /** 该事项的负责人（合同 owner / 假设创建人 / 升级发起者；源无正身则缺省）。 */
  owner?: string
  /** 证据引用（源记录 id＋记录自带的证据锚）。 */
  evidenceRefs: string[]
  riskTier?: AgendaRiskTier
  reversibility?: AgendaReversibility
  /** 事项年龄（天，保留 1 位小数）：自各源锚点时刻（入队/到期/推翻/发起）起算。 */
  age: number
  /** 回原权威域处理的定位锚（`<域>:<记录 id>`）。 */
  sourceRef: string
}

/** 单源投影状态：available=false 时 items 缺席、error 必在——失败≠零数据。 */
export interface AgendaSourceStatus {
  available: boolean
  itemCount: number
  items?: AgendaItem[]
  error?: string
}

/** 议程投影结果。generatedAt=注入的 now（装配层传 Date.now()）。 */
export interface AgendaResult {
  generatedAt: number
  sources: Record<AgendaSourceKind, AgendaSourceStatus>
}

/** 逾期合同读源行（T1 并行在加 dueAt；本模块不 import outcome-store，装配层按此形状注入）。 */
export interface AgendaContractRow {
  outcomeId: string
  title: string
  /** 缺省/null=无逾期判定（旧合同零迁移）。 */
  dueAt?: number | null
  status: string
  ownerPersonId: string
  riskTier: AgendaRiskTier
  updatedAt: number
}

/** 待确认团队读源行（T1/T2 并行实现真源；注入函数只返回 status==='draft' 的团队，
 *  状态过滤在真源完成——本投影不再猜状态）。 */
export interface AgendaDraftTeamRow {
  outcomeId: string
  version: number
  updatedAt: number
}

/** 六源读函数注入面（全部可抛异常，逐源 fail-soft）。 */
export interface AgendaDeps {
  /** 源 1：审批收件箱待审聚合（approval-inbox/pending-sources.collectPendingItems）。 */
  collectPendingItems: () => PendingItem[]
  /** 源 2：结果合同全集（逾期判定 dueAt!=null && dueAt<=now && status∈{active,observing}）。 */
  listContracts: () => AgendaContractRow[]
  /** 源 3：假设登记簿全集（到期/被推翻在此判定，到期口径复用 dueQueue）。 */
  listPremises: () => Premise[]
  /** 源 4a：评审案例全集（分歧判据=同 finding verifications confirm+reject 并存且 open）。 */
  listCases: () => ReviewCase[]
  /** 源 4b：待决权限升级（escalation-store.listPending 语义）。 */
  listPendingEscalations: () => EscalationRequest[]
  /** 源 5：学习候选全集（status==='candidate' 为待审核）。 */
  listCandidates: () => ExpCandidate[]
  /** 源 6：待确认团队草稿。 */
  listDraftTeams: () => AgendaDraftTeamRow[]
}

const DAY = 86_400_000
/** 人读问题里的正文截断（陈述正文可达 400 字，议程问题不整段搬运）。 */
const QUESTION_CLIP = 80

function clip(s: string, max = QUESTION_CLIP): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`
}

/** 天龄（保留 1 位小数）；锚点非法（NaN）按 0——投影不因单条脏数据整源炸掉。 */
function ageDays(now: number, anchorAt: number): number {
  const days = (now - anchorAt) / DAY
  return Number.isFinite(days) ? Math.round(days * 10) / 10 : 0
}

/** 逐源 fail-soft 执行：抛异常收进 error 字符串，不上抛。 */
function runSource<T>(read: () => T): { ok: true; data: T } | { ok: false; error: string } {
  try {
    return { ok: true, data: read() }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** 源内去重（agendaId 首见保留）＋age 降序＋状态收口。 */
function finalizeSource(items: AgendaItem[]): AgendaSourceStatus {
  const byId = new Map<string, AgendaItem>()
  for (const item of items) if (!byId.has(item.agendaId)) byId.set(item.agendaId, item)
  const sorted = [...byId.values()].sort((a, b) => b.age - a.age)
  return { available: true, itemCount: sorted.length, items: sorted }
}

// ── 源 1：待审批/双签 ──
// spec §三：议程收 dualSignRequired===true 或 outcomeRef 非空的条目——例行审批
// （无 outcome 绑定的日常命令/评审/执法批单）不进议程，人在收件箱处理即可。
// 双签优先：dualSignRequired 蕴含 outcomeRef（outcomeAnnotationOf 仅在绑定解析
// 成功时标双签），同一待决条目只计一项。
function approvalItems(pending: PendingItem[], now: number): AgendaItem[] {
  const out: AgendaItem[] = []
  for (const it of pending) {
    if (it.dualSignRequired !== true && !it.outcomeRef) continue
    const kind: AgendaItemKind = it.dualSignRequired === true ? 'dual_sign_pending' : 'approval_pending'
    out.push({
      agendaId: `${kind}:${it.id}`,
      ...(it.outcomeRef ? { outcomeId: it.outcomeRef.outcomeId } : {}),
      kind,
      question: kind === 'dual_sign_pending'
        ? `双签待决：「${clip(it.title)}」需合同 owner 与 verifier 两笔批准`
        : `审批待决：「${clip(it.title)}」（outcome 绑定 v${it.outcomeRef?.contractVersion ?? '?'}）`,
      ...(it.outcomeRef?.ownerPersonId ? { owner: it.outcomeRef.ownerPersonId } : {}),
      evidenceRefs: [it.id],
      riskTier: it.risk,
      age: ageDays(now, it.createdAt),
      sourceRef: `approval-inbox:${it.id}`,
    })
  }
  return out
}

// ── 源 2：逾期结果（D2：不发明 blocked 态；被审批卡住由源 1 覆盖，不重复计项）──
function overdueContracts(contracts: AgendaContractRow[], now: number): AgendaItem[] {
  const out: AgendaItem[] = []
  for (const c of contracts) {
    if (c.dueAt == null || c.dueAt > now) continue
    if (c.status !== 'active' && c.status !== 'observing') continue
    out.push({
      agendaId: `outcome_overdue:${c.outcomeId}`,
      outcomeId: c.outcomeId,
      kind: 'outcome_overdue',
      question: `结果逾期：「${clip(c.title)}」已过约定时点未收口`,
      owner: c.ownerPersonId,
      evidenceRefs: [c.outcomeId],
      riskTier: c.riskTier,
      age: ageDays(now, c.dueAt),
      sourceRef: `outcome-contract:${c.outcomeId}`,
    })
  }
  return out
}

// ── 源 3：PremiseLog（到期队列复用 dueQueue 单一事实源；被推翻另行列示）──
function premiseItems(premises: Premise[], now: number): AgendaItem[] {
  const out: AgendaItem[] = []
  for (const row of dueQueue(premises, now)) {
    const p = row.premise
    out.push({
      agendaId: `premise_due:${p.id}`,
      kind: 'premise_due',
      question: `假设到期待复核：「${clip(p.statement)}」`,
      owner: p.createdBy,
      evidenceRefs: [p.id],
      age: ageDays(now, p.reviewAt),
      sourceRef: `premiselog:${p.id}`,
    })
  }
  for (const p of premises) {
    if (p.status !== 'refuted') continue
    out.push({
      agendaId: `premise_refuted:${p.id}`,
      kind: 'premise_refuted',
      question: `假设被推翻待重评：「${clip(p.statement)}」（影响面 ${p.scope.length} 锚待复核）`,
      owner: p.createdBy,
      evidenceRefs: [p.id, ...(p.refutedBy?.evidence ? [p.refutedBy.evidence] : [])],
      age: ageDays(now, p.refutedBy?.at ?? p.updatedAt),
      sourceRef: `premiselog:${p.id}`,
    })
  }
  return out
}

// ── 源 4a：评审分歧（D4：同 finding verifications confirm+reject 并存且 open，
//  reviewgov 收敛机制原生信号，不新建分歧台账）──
function findingHasDisagreement(f: ReviewFinding): boolean {
  if (f.state !== 'open') return false
  const votes = new Set(f.verifications.map((v) => v.vote))
  return votes.has('confirm') && votes.has('reject')
}

function reviewDisagreements(cases: ReviewCase[], now: number): AgendaItem[] {
  const out: AgendaItem[] = []
  for (const c of cases) {
    for (const f of c.findings) {
      if (!findingHasDisagreement(f)) continue
      out.push({
        agendaId: `review_disagreement:${c.caseId}/${f.findingId}`,
        kind: 'review_disagreement',
        question: `评审分歧待裁决：「${clip(f.body)}」（confirm 与 reject 并存）`,
        ...(f.author ?? c.author ? { owner: f.author ?? c.author } : {}),
        evidenceRefs: [f.findingId, c.caseId, ...(f.evidence ? [f.evidence] : [])],
        age: ageDays(now, f.createdAt),
        sourceRef: `reviewgov:${c.caseId}/${f.findingId}`,
      })
    }
  }
  return out
}

// ── 源 4b：权限升级（escalation-store.listPending 语义——注入面只回 pending）──
function escalationItems(escalations: EscalationRequest[], now: number): AgendaItem[] {
  return escalations
    .filter((e) => e.state === 'pending')
    .map((e) => ({
      agendaId: `escalation_pending:${e.escalationId}`,
      kind: 'escalation_pending' as const,
      question: `权限升级待裁决：${e.fromAgent} 申请 ${e.scope.tool}（${e.urgency}）`,
      owner: e.fromAgent,
      evidenceRefs: [e.escalationId],
      // urgency 是紧急度不是风险档，不映射不猜——riskTier 缺席。
      age: ageDays(now, e.at),
      sourceRef: `escalation:${e.escalationId}`,
    }))
}

// ── 源 5：学习候选（status==='candidate' 为待审核）──
function learningCandidates(candidates: ExpCandidate[], now: number): AgendaItem[] {
  const out: AgendaItem[] = []
  for (const c of candidates) {
    if (c.status !== 'candidate') continue
    out.push({
      agendaId: `learning_candidate:${c.id}`,
      ...(c.outcomeId ? { outcomeId: c.outcomeId } : {}),
      kind: 'learning_candidate',
      question: `学习候选待审核（${c.type}）：「${clip(c.statement)}」`,
      evidenceRefs: [c.id, ...new Set(c.evidence.map((e) => e.taskId))],
      // createdAt/updatedAt 为 ISO 字符串（exp-store 正身）；解析失败按 0 不炸整源。
      age: ageDays(now, Date.parse(c.createdAt)),
      sourceRef: `expcandidates:${c.id}`,
    })
  }
  return out
}

// ── 源 6：待确认团队（草稿经 owner 显式确认才 active——确认决定回 outcome 域）──
function draftTeams(teams: AgendaDraftTeamRow[], now: number): AgendaItem[] {
  return teams.map((t) => ({
    agendaId: `team_pending:${t.outcomeId}`,
    outcomeId: t.outcomeId,
    kind: 'team_pending' as const,
    question: `团队变更待确认：outcome ${t.outcomeId} 团队 v${t.version} 草稿待 owner 确认`,
    evidenceRefs: [`${t.outcomeId}#team`],
    age: ageDays(now, t.updatedAt),
    sourceRef: `outcome-team:${t.outcomeId}`,
  }))
}

/**
 * 决策议程六源聚合（纯函数）。
 *
 * 每源独立 fail-soft：读函数抛异常→该源 {available:false, itemCount:0, error}，
 * 其余源照常聚合。items 源内按 agendaId 去重、age 降序。
 */
export function buildAgenda(deps: AgendaDeps, now: number): AgendaResult {
  const approvals = runSource(() => approvalItems(deps.collectPendingItems(), now))
  const contracts = runSource(() => overdueContracts(deps.listContracts(), now))
  const premises = runSource(() => premiseItems(deps.listPremises(), now))
  const reviews = runSource(() => reviewDisagreements(deps.listCases(), now))
  const escalations = runSource(() => escalationItems(deps.listPendingEscalations(), now))
  const candidates = runSource(() => learningCandidates(deps.listCandidates(), now))
  const teams = runSource(() => draftTeams(deps.listDraftTeams(), now))

  const asStatus = (r: { ok: true; data: AgendaItem[] } | { ok: false; error: string }): AgendaSourceStatus =>
    r.ok ? finalizeSource(r.data) : { available: false, itemCount: 0, error: r.error }

  return {
    generatedAt: now,
    sources: {
      approvals: asStatus(approvals),
      outcome_contracts: asStatus(contracts),
      premises: asStatus(premises),
      review_cases: asStatus(reviews),
      escalations: asStatus(escalations),
      exp_candidates: asStatus(candidates),
      outcome_teams: asStatus(teams),
    },
  }
}
