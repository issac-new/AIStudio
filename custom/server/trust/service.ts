// overlay/trust 域：长程任务可信执行的业务判断。
//
// 三条纪律（对应文章的四道设计）：
//   1. 提议与写入分离：admit() 只接受"完成提议"，结果由纯函数 + 框架观察决定；
//      调用方传入的任何状态字段都不参与判断。
//   2. 审计独立：auditor 与 claimedBy 相同直接拒绝；verified 必须有可核验的
//      机器证据锚（file 必须在基线清单里，git/sha256 必须形如摘要）。
//   3. 完整性优先：自报 clean 只在报告里留痕，工作区差异非空时一律按 violated。
import { existsSync } from 'fs'
import { assertWorkspaceRoot } from './integrity'
import { buildManifest, IntegrityError, reportIntegrity } from './integrity'
import { appendLedger, caseDigest, caseSummary, listCases, loadCase, loadManifest, newId, readLedger, saveCase, saveManifest, trustDir, verifyLedger } from './store'
import { checkSurfaceChain } from './surfaces'
import {
  CLAIM_VERDICTS, INTEGRITY_STATES,
  type AdmissionBlocker, type CheckpointVerification, type ClaimAudit, type ClaimVerdict, type IntegrityManifest,
  type IntegrityState, type ToolSurfaceReport, type TrustCase, type TrustCaseSummary, type TrustCheckpoint,
  type TrustClaim, type TrustDecision, type TrustLedgerEvent, type TrustOverview,
} from './types'

const MAX_CLAIMS = 200
const MAX_AUDITS = 500
const MAX_DECISIONS = 100
const MAX_CHECKPOINTS = 100
const MAX_TEXT = 2_000
const MAX_REF = 300

export class ServiceError extends Error {
  status: number
  detail?: unknown
  constructor(status: number, message: string, detail?: unknown) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

type Rec = Record<string, unknown>

function rec(v: unknown): Rec {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {}
}

function text(v: unknown, field: string, max = MAX_TEXT): string {
  if (typeof v !== 'string' || !v.trim()) throw new ServiceError(400, `${field} 必须是非空字符串`)
  const s = v.trim()
  return s.length > max ? s.slice(0, max) : s
}

function optText(v: unknown, max = MAX_TEXT): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  return s ? (s.length > max ? s.slice(0, max) : s) : undefined
}

function stringList(v: unknown, field: string, maxItems = 50): string[] {
  if (v == null) return []
  if (!Array.isArray(v)) throw new ServiceError(400, `${field} 必须是字符串数组`)
  const out = v.map((x) => text(x, field, MAX_REF))
  if (out.length > maxItems) throw new ServiceError(400, `${field} 最多 ${maxItems} 项`)
  return out
}

function mustCase(caseId: string): TrustCase {
  const c = loadCase(caseId)
  if (!c) throw new ServiceError(404, '案件不存在')
  return c
}

function safeRoot(root: unknown): string {
  try {
    return assertWorkspaceRoot(String(root ?? ''))
  } catch (e) {
    if (e instanceof IntegrityError) {
      throw new ServiceError(e.code === 'root_not_allowed' ? 403 : 400, e.message, { code: e.code })
    }
    throw e
  }
}

function scan(root: string, overrides: Rec = {}): IntegrityManifest {
  const bigFileBytes = Number(overrides.bigFileBytes)
  const maxFiles = Number(overrides.maxFiles)
  return buildManifest(root, {
    excludePaths: [trustDir()],
    ...(Number.isFinite(bigFileBytes) && bigFileBytes > 0 ? { bigFileBytes } : {}),
    ...(Number.isFinite(maxFiles) && maxFiles > 0 ? { maxFiles } : {}),
  })
}

function manifestSummary(m: IntegrityManifest) {
  return {
    id: m.id,
    root: m.root,
    generatedAt: m.generatedAt,
    fileCount: m.fileCount,
    totalBytes: m.totalBytes,
    digest: m.digest,
    truncated: m.truncated,
    excludedDirs: m.excludedDirs,
  }
}

function normalizeClaim(raw: unknown, fallbackActor: string): TrustClaim {
  const r = rec(raw)
  const statement = text(r.statement, '主张内容')
  const evidenceRefs = stringList(r.evidenceRefs, '证据锚', 20)
  return {
    id: optText(r.id, 80) ?? newId('claim'),
    statement,
    evidenceRefs,
    claimedBy: optText(r.claimedBy, 120) ?? fallbackActor,
    claimedAt: Date.now(),
  }
}

const FILE_REF = /^file:(.+)$/
const GIT_REF = /^git:[0-9a-f]{7,40}$/i
const SHA_REF = /^sha256:[0-9a-f]{64}$/i
const MACHINE_PREFIX = /^(file|git|sha256):/

/**
 * verified 的证据门槛：至少一个机器可核验锚；file 锚必须在基线清单里真实存在；
 * 同时给出 file 与 sha256 锚时，摘要必须与基线文件内容一致（等价于审计者自己
 * 跑了一遍 sha256sum）。只有 note: 或纯自然语言说明时不能判 verified。
 */
function assertVerifiableEvidence(claim: TrustClaim, baseline: IntegrityManifest): void {
  const machine = claim.evidenceRefs.filter((r) => MACHINE_PREFIX.test(r))
  if (machine.length === 0) {
    throw new ServiceError(400, 'verified 需要至少一个机器可核验的证据锚（file/git/sha256）', { claimId: claim.id })
  }
  const paths = new Set(baseline.entries.map((e) => e.path))
  const filePaths: string[] = []
  const shaRefs: string[] = []
  for (const ref of machine) {
    const file = FILE_REF.exec(ref)
    if (file) {
      const p = file[1].trim().replace(/^\.\//, '')
      if (!p || p.startsWith('/') || p.split('/').includes('..')) {
        throw new ServiceError(400, 'file 证据锚必须是工作区内的相对路径', { claimId: claim.id, ref })
      }
      if (!paths.has(p)) {
        throw new ServiceError(400, 'file 证据锚不在基线完整性清单中', { claimId: claim.id, ref, path: p })
      }
      filePaths.push(p)
      continue
    }
    if (GIT_REF.test(ref)) continue
    if (SHA_REF.test(ref)) {
      shaRefs.push(ref.slice('sha256:'.length).toLowerCase())
      continue
    }
    throw new ServiceError(400, '无法识别的证据锚格式', { claimId: claim.id, ref })
  }
  if (shaRefs.length > 0 && filePaths.length > 0) {
    const entryHashes = filePaths
      .map((p) => baseline.entries.find((e) => e.path === p)?.sha256)
      .filter((h): h is string => typeof h === 'string' && h.length === 64)
    // 基线里的大文件只记大小+修改时间，没有全文摘要；这种情况下无法用文件核验 sha，
    // 退化为形状校验，不假装已验证内容。
    if (entryHashes.length > 0 && !shaRefs.every((h) => entryHashes.includes(h))) {
      throw new ServiceError(400, 'sha256 证据锚与基线文件摘要不一致', { claimId: claim.id })
    }
  }
}

function latestVerdicts(c: TrustCase): Map<string, ClaimVerdict> {
  const map = new Map<string, ClaimVerdict>()
  for (const a of c.audits) map.set(a.claimId, a.verdict)
  return map
}

function pushCapped<T>(arr: T[], item: T, cap: number): void {
  arr.push(item)
  if (arr.length > cap) arr.splice(0, arr.length - cap)
}

export interface OpenCaseInput {
  caseId?: unknown
  title: unknown
  runId?: unknown
  workspaceRoot: unknown
  actor: unknown
  claims?: unknown
}

export function openCase(input: OpenCaseInput): TrustCase {
  const actor = text(input.actor, '操作者', 120)
  const title = text(input.title, '案件标题', 200)
  const workspaceRoot = safeRoot(input.workspaceRoot)
  const id = optText(input.caseId, 80) ?? newId('trust')
  if (loadCase(id)) throw new ServiceError(409, '案件编号已存在')
  const rawClaims = input.claims == null ? [] : input.claims
  if (!Array.isArray(rawClaims)) throw new ServiceError(400, 'claims 必须是数组')
  if (rawClaims.length > MAX_CLAIMS) throw new ServiceError(400, `claims 最多 ${MAX_CLAIMS} 条`)
  const now = Date.now()
  const runId = optText(input.runId, 120)
  const c: TrustCase = {
    id,
    title,
    ...(runId ? { runId } : {}),
    workspaceRoot,
    createdAt: now,
    updatedAt: now,
    state: 'open',
    forgeAttempts: 0,
    claims: rawClaims.map((x) => normalizeClaim(x, actor)),
    audits: [],
    decisions: [],
    baseline: null,
    integrity: null,
    checkpoints: [],
  }
  saveCase(c)
  appendLedger({ at: now, caseId: c.id, kind: 'case_opened', actor, body: { title, workspaceRoot, claims: c.claims.length } })
  return c
}

export function addClaims(caseId: string, rawClaims: unknown, actorRaw: unknown): TrustClaim[] {
  const actor = text(actorRaw, '操作者', 120)
  const c = mustCase(caseId)
  if (!Array.isArray(rawClaims) || rawClaims.length === 0) throw new ServiceError(400, 'claims 必须是非空数组')
  const existing = new Set(c.claims.map((x) => x.id))
  const added: TrustClaim[] = []
  for (const raw of rawClaims) {
    const claim = normalizeClaim(raw, actor)
    if (existing.has(claim.id)) throw new ServiceError(409, '主张编号已存在', { claimId: claim.id })
    existing.add(claim.id)
    added.push(claim)
  }
  if (c.claims.length + added.length > MAX_CLAIMS) throw new ServiceError(400, `单案主张最多 ${MAX_CLAIMS} 条`)
  c.claims.push(...added)
  // 新主张出现后，之前的准入结论不再完整，状态回到待裁决。
  c.state = 'open'
  c.blockedReason = undefined
  c.updatedAt = Date.now()
  saveCase(c)
  appendLedger({ at: c.updatedAt, caseId, kind: 'claims_added', actor, body: { claimIds: added.map((x) => x.id) } })
  return added
}

export function beginAudit(caseId: string, actorRaw: unknown, overrides: Rec = {}) {
  const actor = text(actorRaw, '操作者', 120)
  const c = mustCase(caseId)
  const manifest = scan(c.workspaceRoot, overrides)
  saveManifest(caseId, manifest)
  c.baseline = { manifestId: manifest.id, digest: manifest.digest, at: manifest.generatedAt, auto: false }
  c.integrity = null
  c.updatedAt = Date.now()
  saveCase(c)
  appendLedger({ at: c.updatedAt, caseId, kind: 'audit_begun', actor, body: { manifestId: manifest.id, digest: manifest.digest, auto: false } })
  return { caseId, baseline: c.baseline, manifest: manifestSummary(manifest) }
}

export function recordAudits(caseId: string, rawAudits: unknown, actorRaw: unknown): ClaimAudit[] {
  const actor = text(actorRaw, '操作者', 120)
  const c = mustCase(caseId)
  if (!Array.isArray(rawAudits) || rawAudits.length === 0) throw new ServiceError(400, 'audits 必须是非空数组')
  if (c.audits.length + rawAudits.length > MAX_AUDITS) throw new ServiceError(400, `单案审计记录最多 ${MAX_AUDITS} 条`)

  // 审计必须基于审计阶段开始前的基线；缺失时补采一次并在事件账如实标注 auto=true。
  if (!c.baseline) {
    const m = scan(c.workspaceRoot)
    saveManifest(caseId, m)
    c.baseline = { manifestId: m.id, digest: m.digest, at: m.generatedAt, auto: true }
    appendLedger({ at: Date.now(), caseId, kind: 'audit_begun', actor, body: { manifestId: m.id, digest: m.digest, auto: true } })
  }
  const baseline = loadManifest(caseId, c.baseline.manifestId)
  if (!baseline) throw new ServiceError(409, '完整性基线清单缺失，请重新执行 begin-audit')

  const claimMap = new Map(c.claims.map((x) => [x.id, x]))
  const added: ClaimAudit[] = []
  for (const raw of rawAudits) {
    const r = rec(raw)
    const claimId = text(r.claimId, 'claimId', 80)
    const claim = claimMap.get(claimId)
    if (!claim) throw new ServiceError(404, '主张不存在', { claimId })
    const verdict = String(r.verdict ?? '') as ClaimVerdict
    if (!(CLAIM_VERDICTS as readonly string[]).includes(verdict)) {
      throw new ServiceError(400, '裁决必须是 verified/unverified/refuted', { claimId })
    }
    const auditor = optText(r.auditor, 120) ?? actor
    if (auditor === claim.claimedBy) {
      throw new ServiceError(400, 'auditor 不能与主张人相同', { claimId, auditor })
    }
    const observations = stringList(r.observations, '复核观察', 20)
    if ((verdict === 'verified' || verdict === 'refuted') && observations.length === 0) {
      throw new ServiceError(400, `${verdict} 至少需要一条复核观察`, { claimId })
    }
    const counterEvidence = optText(r.counterEvidence, MAX_TEXT)
    if (verdict === 'refuted' && !counterEvidence) {
      throw new ServiceError(400, 'refuted 必须给出反证', { claimId })
    }
    if (verdict === 'verified') assertVerifiableEvidence(claim, baseline)
    added.push({
      id: newId('audit'),
      claimId,
      auditor,
      verdict,
      observations,
      ...(counterEvidence ? { counterEvidence } : {}),
      at: Date.now(),
    })
  }
  c.audits.push(...added)
  c.state = 'open'
  c.blockedReason = undefined
  c.updatedAt = Date.now()
  saveCase(c)
  appendLedger({
    at: c.updatedAt, caseId, kind: 'audit_recorded', actor,
    body: { audits: added.map((a) => ({ claimId: a.claimId, auditor: a.auditor, verdict: a.verdict })) },
  })
  return added
}

export interface AdmitResult {
  decision: TrustDecision
  summary: TrustCaseSummary
  forgeAttempts: number
}

/**
 * 完成态双准入。调用方只能提交"我认为完成了"的提议；是否准入由本函数读取
 * 最新审计裁决与框架自己采的工作区清单决定。提议里夹带 state 一律忽略。
 */
export function admit(caseId: string, actorRaw: unknown, body: Rec = {}): AdmitResult {
  const actor = text(actorRaw, '操作者', 120)
  const c = mustCase(caseId)
  const claims = c.claims
  const proposalRaw = body.proposal
  let proposal: string[]
  if (proposalRaw == null) {
    proposal = claims.map((x) => x.id)
  } else {
    proposal = stringList(proposalRaw, 'proposal', MAX_CLAIMS)
    const known = new Set(claims.map((x) => x.id))
    const unknown = proposal.filter((id) => !known.has(id))
    if (unknown.length > 0) throw new ServiceError(400, 'proposal 含未知主张', { unknown })
    const missing = claims.filter((x) => !proposal.includes(x.id)).map((x) => x.id)
    if (missing.length > 0) throw new ServiceError(400, 'proposal 必须覆盖全部主张；不能只准入一部分', { missing })
  }

  const selfReportedRaw = body.auditorReportedIntegrity ?? body.selfReportedIntegrity
  let selfReported: IntegrityState | undefined
  if (selfReportedRaw != null) {
    const s = String(selfReportedRaw)
    if (!(INTEGRITY_STATES as readonly string[]).includes(s)) {
      throw new ServiceError(400, '完整性自报值必须是 clean/violated/unknown')
    }
    selfReported = s as IntegrityState
  }

  const baseline = c.baseline ? loadManifest(caseId, c.baseline.manifestId) : null
  const current = existsSync(c.workspaceRoot) ? scan(c.workspaceRoot) : null
  const integrity = reportIntegrity(baseline, current, selfReported)
  const verdicts = latestVerdicts(c)
  const surface: ToolSurfaceReport = checkSurfaceChain()

  const blockers: AdmissionBlocker[] = []
  const warnings: string[] = []
  if (claims.length === 0) blockers.push({ code: 'no_claims', detail: '案件没有任何完成主张' })
  if (!c.baseline || !baseline) {
    blockers.push({ code: 'integrity_baseline_missing', detail: '尚未采集审计前的完整性基线' })
  } else if (integrity.state === 'violated') {
    blockers.push({
      code: 'integrity_violated',
      detail: `审计阶段工作区有 ${integrity.changeTotal} 处变化；以框架观察为准`,
    })
  } else if (integrity.state !== 'clean') {
    blockers.push({ code: 'integrity_unknown', detail: '无法采集当前工作区，完整性未知' })
  }
  if (integrity.truncated) warnings.push('integrity_truncated')
  for (const claim of claims) {
    const v = verdicts.get(claim.id) ?? null
    if (v === 'refuted') blockers.push({ code: 'claim_refuted', claimId: claim.id, detail: '审计观察到反证' })
    else if (v !== 'verified') blockers.push({ code: 'claim_unverified', claimId: claim.id, detail: v === 'unverified' ? '证据不足' : '缺少审计记录' })
  }
  if (!surface.valid) blockers.push({ code: 'tool_surface_not_monotonic', detail: surface.violations.join('；') })

  const result: TrustDecision['result'] = blockers.length === 0 ? 'admitted' : 'untrusted'
  const now = Date.now()
  const decision: TrustDecision = {
    id: newId('decision'),
    at: now,
    actor,
    result,
    proposal,
    blockers,
    warnings,
    claimStates: claims.map((x) => ({ claimId: x.id, verdict: verdicts.get(x.id) ?? null })),
    integrity,
    surfaceValid: surface.valid,
  }
  pushCapped(c.decisions, decision, MAX_DECISIONS)
  c.state = result
  c.integrity = integrity
  c.blockedReason = blockers[0]?.code
  if (result === 'untrusted') c.forgeAttempts += 1
  c.updatedAt = now
  saveCase(c)
  appendLedger({
    at: now, caseId, kind: 'admission_decided', actor,
    body: { decisionId: decision.id, result, blockers: blockers.map((b) => b.code), forgeAttempts: c.forgeAttempts },
  })
  return { decision, summary: caseSummary(c), forgeAttempts: c.forgeAttempts }
}

export function writeCheckpoint(caseId: string, actorRaw: unknown, body: Rec = {}): TrustCheckpoint {
  const actor = text(actorRaw, '操作者', 120)
  const c = mustCase(caseId)
  const rawRound = body.round
  let round: number
  if (rawRound == null) {
    round = c.checkpoints.reduce((max, x) => Math.max(max, x.round), 0) + 1
  } else {
    round = Number(rawRound)
    if (!Number.isInteger(round) || round < 0) throw new ServiceError(400, 'round 必须是非负整数')
  }
  const manifest = scan(c.workspaceRoot)
  saveManifest(caseId, manifest)
  const checkpoint: TrustCheckpoint = {
    id: newId('ckpt'),
    caseId,
    round,
    at: Date.now(),
    actor,
    caseDigest: caseDigest(c),
    workspaceManifestId: manifest.id,
    workspaceDigest: manifest.digest,
    workspaceRoot: c.workspaceRoot,
  }
  pushCapped(c.checkpoints, checkpoint, MAX_CHECKPOINTS)
  c.updatedAt = checkpoint.at
  saveCase(c)
  appendLedger({
    at: checkpoint.at, caseId, kind: 'checkpoint_written', actor,
    body: { checkpointId: checkpoint.id, round, caseDigest: checkpoint.caseDigest, workspaceDigest: checkpoint.workspaceDigest },
  })
  return checkpoint
}

export function verifyCheckpoint(caseId: string, checkpointId?: string): CheckpointVerification {
  const c = mustCase(caseId)
  const checkpoint = checkpointId
    ? c.checkpoints.find((x) => x.id === checkpointId) ?? null
    : c.checkpoints.length > 0 ? c.checkpoints[c.checkpoints.length - 1] : null
  if (!checkpoint) {
    return { status: 'no_checkpoint', checkpoint: null, currentDigest: null, changes: [], caseChanged: false, checkedAt: Date.now() }
  }
  const caseChanged = caseDigest(c) !== checkpoint.caseDigest
  let current: IntegrityManifest
  try {
    current = scan(checkpoint.workspaceRoot)
  } catch {
    return { status: 'workspace_missing', checkpoint, currentDigest: null, changes: [], caseChanged, checkedAt: Date.now() }
  }
  if (current.digest === checkpoint.workspaceDigest) {
    return { status: 'consistent', checkpoint, currentDigest: current.digest, changes: [], caseChanged, checkedAt: Date.now() }
  }
  const before = loadManifest(caseId, checkpoint.workspaceManifestId)
  const changes = before ? reportIntegrity(before, current).changes : []
  return { status: 'diverged', checkpoint, currentDigest: current.digest, changes, caseChanged, checkedAt: Date.now() }
}

export function listCaseSummaries(): TrustCaseSummary[] {
  return listCases().map(caseSummary)
}

export function getCase(caseId: string): TrustCase {
  return mustCase(caseId)
}

export function overview(): TrustOverview {
  const cases = listCases()
  const chain = verifyLedger()
  return {
    cases: cases.length,
    open: cases.filter((c) => c.state === 'open').length,
    admitted: cases.filter((c) => c.state === 'admitted').length,
    untrusted: cases.filter((c) => c.state === 'untrusted').length,
    forgeAttempts: cases.reduce((n, c) => n + (c.forgeAttempts ?? 0), 0),
    integrityViolations: cases.filter((c) => c.integrity?.state === 'violated').length,
    ledgerIntact: chain.intact,
    ledgerEntries: chain.total,
    surfaceValid: checkSurfaceChain().valid,
  }
}

export function ledgerTail(limitRaw: unknown): TrustLedgerEvent[] {
  const n = Math.min(500, Math.max(1, Number(limitRaw) || 50))
  return readLedger().slice(-n)
}

export function ledgerVerification() {
  return verifyLedger()
}
