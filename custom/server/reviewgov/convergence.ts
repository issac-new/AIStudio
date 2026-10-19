// overlay/custom/server/reviewgov/convergence.ts
// 评审案例的轮次与发现项收敛规则（纯函数，无 IO）。
//
// 对齐 Anthropic 文章的刹车机制：
//   1. 最多 3 轮，超过封顶，要求退后重新审视方案；
//   2. 前几轮之后只允许看新增 diff，存量问题转夜间扫描；
//   3. 同文件同 bug 类去重，发过的意见不重复；
//   4. 每轮 nit 预算，超出的转延后；
//   5. 重要发现必须带证据，且经独立验证投票确认才阻塞合并。
import { randomBytes } from 'crypto'
import { countEffectiveApprovals, invalidateApprovals } from './policy'
import {
  DEFAULT_POLICY,
  type ActorKind,
  type BreakerState,
  type CheckState,
  type FindingOrigin,
  type FindingSeverity,
  type MergeReadiness,
  type Resolution,
  type ReviewApproval,
  type ReviewCase,
  type ReviewFinding,
  type ReviewPolicy,
  type ReviewRound,
} from './types'
import { classifyChangeRisk } from './policy'

export interface OpenCaseInput {
  caseId: string
  title: string
  taskId?: string
  reviewId?: string
  author?: string
  authorKind?: ActorKind
  baseCommit?: string
  headCommit?: string
  changedPaths?: string[]
  diffLines?: number
  behindFlag?: boolean
}

export interface RoundInput {
  headCommit?: string
  changedPaths?: string[]
  at?: number
}

export interface AddFindingInput {
  findingId?: string
  file: string
  line: number
  body: string
  severity: FindingSeverity
  origin?: FindingOrigin
  bugClass?: string
  authorKind?: ActorKind
  author?: string
  evidence?: string
}

/** 失败分支带 error 字段：项目 tsconfig 为 strict:false，布尔字面量判别不会收窄，
 *  调用方统一用 `'error' in result` 收窄（与 review-store 既有约定一致）。 */
export type ConvergeFailure = { ok: false; error: string; code: string; detail: string }
export type ConvergeResult<T> = ({ ok: true; case: ReviewCase } & T) | ConvergeFailure

function newId(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString('hex')}`
}

function clip(s: string, cap: number): string {
  const cps = [...s]
  return cps.length <= cap ? s : cps.slice(0, cap).join('')
}

/** 归一化正文用于去重键：去空白、小写、去尾标点，截 120 码点。 */
export function normalizeBody(body: string): string {
  return clip(body.replace(/\s+/g, ' ').trim().toLowerCase().replace(/[。.!！?？,，;；:：]+$/g, ''), 120)
}

/** 稳定去重键：文件 + bug 类（优先）或归一化正文。 */
export function dedupeKeyOf(file: string, bugClass: string | undefined, body: string): string {
  const cls = bugClass?.trim().toLowerCase().replace(/\s+/g, '-')
  return `${file.replace(/\\/g, '/')}|${cls || normalizeBody(body)}`
}

export function currentRound(c: ReviewCase): ReviewRound | undefined {
  return c.rounds[c.rounds.length - 1]
}

/** 开案例：自动生成第 1 轮并做风险分级。 */
export function createCase(
  input: OpenCaseInput,
  policy: ReviewPolicy = DEFAULT_POLICY,
  breaker: BreakerState | null = null,
  now = Date.now(),
): ReviewCase {
  const changedPaths = (input.changedPaths ?? []).map((p) => p.replace(/\\/g, '/').replace(/^\.\//, '')).filter(Boolean)
  const risk = classifyChangeRisk({
    changedPaths,
    diffLines: input.diffLines,
    behindFlag: input.behindFlag,
    author: input.author,
    authorKind: input.authorKind,
    policy,
    breaker,
    now,
  })
  const round: ReviewRound = {
    round: 1,
    headCommit: input.headCommit,
    changedPaths,
    startedAt: now,
    diffOnly: 1 > policy.convergence.diffOnlyAfterRound,
    findingsAdded: 0,
    nitCount: 0,
  }
  return {
    caseId: input.caseId,
    title: clip(input.title, 200),
    taskId: input.taskId,
    reviewId: input.reviewId,
    author: input.author,
    authorKind: input.authorKind ?? 'human',
    baseCommit: input.baseCommit,
    headCommit: input.headCommit,
    changedPaths,
    diffLines: Math.max(0, input.diffLines ?? 0),
    behindFlag: input.behindFlag ?? false,
    risk,
    rounds: [round],
    findings: [],
    approvals: [],
    checks: 'unknown',
    state: 'open',
    createdAt: now,
    updatedAt: now,
  }
}

/** 开新一轮：轮次封顶；新提交使旧审批失效；第 N 轮后进入只看新增模式。 */
export function startRound(
  c: ReviewCase,
  input: RoundInput,
  policy: ReviewPolicy = DEFAULT_POLICY,
): ConvergeResult<{ round: ReviewRound }> {
  const now = input.at ?? Date.now()
  if (c.rounds.length >= policy.convergence.maxRounds) {
    return {
      ok: false,
      error: 'round_cap_reached',
      code: 'round_cap_reached',
      detail: `已达 ${policy.convergence.maxRounds} 轮上限，停止继续拉锯：请退后一步重新审视方案，而不是继续改同一处`,
    }
  }
  const prev = currentRound(c)
  const headChanged = !!input.headCommit && input.headCommit !== c.headCommit
  const changedPaths = (input.changedPaths ?? prev?.changedPaths ?? [])
    .map((p) => p.replace(/\\/g, '/').replace(/^\.\//, ''))
    .filter(Boolean)
  const round: ReviewRound = {
    round: c.rounds.length + 1,
    headCommit: input.headCommit ?? c.headCommit,
    changedPaths,
    startedAt: now,
    diffOnly: c.rounds.length + 1 > policy.convergence.diffOnlyAfterRound,
    findingsAdded: 0,
    nitCount: 0,
  }
  const next: ReviewCase = {
    ...c,
    headCommit: input.headCommit ?? c.headCommit,
    changedPaths: changedPaths.length ? changedPaths : c.changedPaths,
    rounds: [...c.rounds, round],
    approvals: headChanged ? invalidateApprovals(c.approvals, 'new_commit', now) : c.approvals,
    updatedAt: now,
  }
  return { ok: true, case: next, round }
}

function nitCountThisRound(c: ReviewCase): number {
  const r = currentRound(c)
  if (!r) return 0
  return c.findings.filter((f) => f.round === r.round && f.severity === 'nit' && !f.deferred).length
}

/** 加发现项：证据校验、去重、存量延后、nit 预算。 */
export function addFinding(
  c: ReviewCase,
  input: AddFindingInput,
  policy: ReviewPolicy = DEFAULT_POLICY,
  now = Date.now(),
): ConvergeResult<{ finding: ReviewFinding; deduped: boolean }> {
  const file = input.file.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!file || file.startsWith('/') || file.split('/').some((seg) => seg === '..')) {
    return { ok: false, error: 'invalid_file', code: 'invalid_file', detail: 'file 须为项目相对路径（拒绝绝对路径与 .. 段）' }
  }
  if (!Number.isInteger(input.line) || input.line < 1) {
    return { ok: false, error: 'invalid_line', code: 'invalid_line', detail: 'line 须为正整数' }
  }
  const body = clip(input.body.trim(), 2000)
  if (!body) return { ok: false, error: 'empty_body', code: 'empty_body', detail: 'body 必填' }
  if (input.severity === 'important' && !input.evidence?.trim()) {
    return {
      ok: false,
      error: 'evidence_required',
      code: 'evidence_required',
      detail: 'important 发现必须附证据（终端输出/截图/命令返回的引用），不能只给结论',
    }
  }

  const origin: FindingOrigin = input.origin ?? (input.severity === 'preexisting' ? 'preexisting' : 'new')
  const dedupeKey = dedupeKeyOf(file, input.bugClass, body)
  const existing = c.findings.find(
    (f) => f.dedupeKey === dedupeKey && (f.state === 'open' || f.state === 'answered' || f.state === 'deferred'),
  )
  if (existing) {
    const next: ReviewCase = {
      ...c,
      findings: c.findings.map((f) => (f.findingId === existing.findingId ? { ...f, duplicateCount: f.duplicateCount + 1 } : f)),
      updatedAt: now,
    }
    return { ok: true, case: next, finding: { ...existing, duplicateCount: existing.duplicateCount + 1 }, deduped: true }
  }

  const round = currentRound(c)
  const roundNo = round?.round ?? 1
  const diffOnly = round?.diffOnly ?? false
  const staleOrigin = origin === 'preexisting' && policy.convergence.deferPreexisting
  const outsideDiff = !!round && round.changedPaths.length > 0 && !round.changedPaths.includes(file)
  let deferred = false
  let deferredReason: string | undefined
  if (diffOnly && (staleOrigin || outsideDiff)) {
    deferred = true
    deferredReason = staleOrigin
      ? `preexisting_after_round_${roundNo}：存量问题转夜间扫描`
      : `not_in_current_diff：第 ${roundNo} 轮只看新增 diff`
  }
  if (!deferred && input.severity === 'nit' && nitCountThisRound(c) >= policy.convergence.nitBudgetPerRound) {
    deferred = true
    deferredReason = `nit_budget：每轮最多 ${policy.convergence.nitBudgetPerRound} 条 nit，超出转延后`
  }

  const finding: ReviewFinding = {
    findingId: input.findingId ?? newId('f'),
    file,
    line: input.line,
    body,
    severity: input.severity,
    origin,
    bugClass: input.bugClass?.trim() || undefined,
    authorKind: input.authorKind ?? 'agent',
    author: input.author,
    evidence: input.evidence?.trim() || undefined,
    round: roundNo,
    dedupeKey,
    state: deferred ? 'deferred' : 'open',
    deferred,
    deferredReason,
    duplicateCount: 0,
    verifications: [],
    createdAt: now,
  }
  const next: ReviewCase = {
    ...c,
    findings: [...c.findings, finding],
    rounds: c.rounds.map((r) => (
      r.round === roundNo
        ? {
          ...r,
          findingsAdded: r.findingsAdded + 1,
          nitCount: r.nitCount + (finding.severity === 'nit' && !deferred ? 1 : 0),
        }
        : r
    )),
    updatedAt: now,
  }
  return { ok: true, case: next, finding, deduped: false }
}

/** 独立验证投票：同一投票人重投覆盖旧票。 */
export function verifyFinding(
  c: ReviewCase,
  findingId: string,
  vote: 'confirm' | 'reject',
  voter: string,
  actorKind: ActorKind = 'agent',
  now = Date.now(),
): ConvergeResult<{ finding: ReviewFinding }> {
  const finding = c.findings.find((f) => f.findingId === findingId)
  if (!finding) return { ok: false, error: 'finding_not_found', code: 'finding_not_found', detail: '发现项不存在' }
  if (finding.state === 'resolved' || finding.state === 'dismissed') {
    return { ok: false, error: 'finding_closed', code: 'finding_closed', detail: '发现项已关闭，不能再投票' }
  }
  const others = finding.verifications.filter((v) => v.voter !== voter)
  const nextFinding: ReviewFinding = {
    ...finding,
    verifications: [...others, { voter, actorKind, vote, at: now }],
  }
  const next: ReviewCase = {
    ...c,
    findings: c.findings.map((f) => (f.findingId === findingId ? nextFinding : f)),
    updatedAt: now,
  }
  return { ok: true, case: next, finding: nextFinding }
}

/** 回答发现项：fixed 收口；wrong/intentional/didnt_matter 关闭并计入噪声。 */
export function answerFinding(
  c: ReviewCase,
  findingId: string,
  resolution: Resolution,
  actor?: string,
  now = Date.now(),
): ConvergeResult<{ finding: ReviewFinding }> {
  const finding = c.findings.find((f) => f.findingId === findingId)
  if (!finding) return { ok: false, error: 'finding_not_found', code: 'finding_not_found', detail: '发现项不存在' }
  if (finding.state === 'resolved' || finding.state === 'dismissed') {
    return { ok: false, error: 'finding_closed', code: 'finding_closed', detail: '发现项已关闭' }
  }
  const nextFinding: ReviewFinding = {
    ...finding,
    state: resolution === 'fixed' ? 'resolved' : 'dismissed',
    resolution,
    answeredAt: now,
    answeredBy: actor,
  }
  const next: ReviewCase = {
    ...c,
    findings: c.findings.map((f) => (f.findingId === findingId ? nextFinding : f)),
    updatedAt: now,
  }
  return { ok: true, case: next, finding: nextFinding }
}

/** 人类作者或独立验证多数确认（confirm > reject 且至少 1 票）才算确认。 */
export function isFindingConfirmed(f: ReviewFinding): boolean {
  if (f.authorKind === 'human') return true
  const confirm = f.verifications.filter((v) => v.vote === 'confirm').length
  const reject = f.verifications.filter((v) => v.vote === 'reject').length
  return confirm >= 1 && confirm > reject
}

/** 阻塞合并的发现：重要 + 已确认 + 未延后 + 未关闭。 */
export function blockingFindings(c: ReviewCase): ReviewFinding[] {
  return c.findings.filter((f) => (
    f.severity === 'important'
    && !f.deferred
    && f.state !== 'resolved'
    && f.state !== 'dismissed'
    && isFindingConfirmed(f)
  ))
}

export function mergeReadiness(c: ReviewCase, policy: ReviewPolicy = DEFAULT_POLICY): MergeReadiness {
  const counts = countEffectiveApprovals(c.approvals, c.headCommit)
  const required = c.risk.requiredHumanApprovals
  const blocking = blockingFindings(c)
  const rejections = c.approvals.filter(
    (a) => !a.invalidatedAt && a.actorKind === 'human' && a.decision === 'request_changes'
      && (c.headCommit ? a.commit === c.headCommit : true),
  )
  const blockers: string[] = []
  if (counts.human < required) blockers.push(`human_approvals：${counts.human}/${required}`)
  if (rejections.length) blockers.push(`changes_requested：${rejections.length} 条人类反对意见`)
  if (blocking.length) blockers.push(`blocking_findings：${blocking.length} 条重要发现未关闭`)
  if (c.checks !== 'green') blockers.push(`checks_${c.checks}：自动检查未全绿`)
  const roundCapHit = c.rounds.length >= policy.convergence.maxRounds
  if (roundCapHit && blockers.length) blockers.push(`round_cap_reached：已达 ${policy.convergence.maxRounds} 轮，需重新审视方案`)
  return {
    ready: blockers.length === 0,
    blockers,
    humanApprovals: counts.human,
    requiredHumanApprovals: required,
    agentApprovals: counts.agent,
    openImportant: blocking.length,
    blockingFindings: blocking.map((f) => f.findingId),
    checks: c.checks,
    roundCapHit,
  }
}

/** 合并就绪度回写案例状态（merged/abandoned 不被覆盖）。 */
export function refreshCaseState(c: ReviewCase, policy: ReviewPolicy = DEFAULT_POLICY): ReviewCase {
  if (c.state === 'merged' || c.state === 'abandoned') return c
  const readiness = mergeReadiness(c, policy)
  return { ...c, state: readiness.ready ? 'ready' : 'open' }
}

/** 记录审批：带 commit；conflictResolved=true 时先失效旧审批。 */
export function addApproval(
  c: ReviewCase,
  input: Omit<ReviewApproval, 'approvalId' | 'at' | 'invalidatedAt' | 'invalidatedBy'> & {
    approvalId?: string
    at?: number
    conflictResolved?: boolean
  },
  now = Date.now(),
): ReviewCase {
  const at = input.at ?? now
  const base = input.conflictResolved ? invalidateApprovals(c.approvals, 'conflict_resolution', at) : c.approvals
  const approval: ReviewApproval = {
    approvalId: input.approvalId ?? newId('a'),
    actor: input.actor,
    actorKind: input.actorKind,
    decision: input.decision,
    commit: input.commit ?? c.headCommit,
    note: input.note ? clip(input.note, 2000) : undefined,
    at,
  }
  return { ...c, approvals: [...base, approval], updatedAt: at }
}

export function setChecks(c: ReviewCase, checks: CheckState, now = Date.now()): ReviewCase {
  return { ...c, checks, updatedAt: now }
}
