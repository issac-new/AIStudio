// overlay/secaudit 域：候选登记与三态裁决（判定纪律的后端执行）。
import { createHash } from 'node:crypto'
import type {
  AuditCandidate, AuditProject, FindingVerification, RuleResult, RuleViolation, SecAuditFinding,
} from './types'
import {
  confirmedRequirements, defenseInDepthNormalization, forbidSelfVerification, needsValidationRules, rejectedRules,
} from './types'

export function candidateHash(candidate: AuditCandidate): string {
  return createHash('sha1').update(JSON.stringify({
    s: candidate.surfaceClass, t: candidate.title, d: candidate.detail,
    c: candidate.traceChain ?? '', o: candidate.observation ?? '',
  })).digest('hex').slice(0, 16)
}

/** 登记候选：挂到项目 findings（状态初始 needs_validation，待独立验证）。 */
export function registerCandidate(
  project: AuditProject,
  input: Omit<AuditCandidate, 'candidateId' | 'createdAt'>,
  now: number,
): RuleResult<SecAuditFinding> {
  const candidateId = `cand-${project.nextSeq.toString().padStart(4, '0')}`
  const candidate: AuditCandidate = { ...input, candidateId, createdAt: now }
  const finding: SecAuditFinding = {
    findingId: `f-${candidateId}`,
    candidate,
    verifications: [],
    status: 'needs_validation',
    unknownFact: '未判定（候选登记后须独立验证）',
    recordReviews: [],
  }
  project.findings.push(finding)
  project.nextSeq += 1
  return { ok: true, value: finding }
}

/** 裁决：独立验证 + 三态门槛（后端硬约束）。 */
export function decideFinding(
  project: AuditProject,
  findingId: string,
  input: {
    verifier: string
    status: 'confirmed' | 'needs_validation' | 'rejected'
    refutation?: string
    unknownFact?: string
    severity?: 'high' | 'medium' | 'low'
    defenseInDepth?: boolean
  },
  now: number,
): RuleResult<SecAuditFinding> {
  const finding = project.findings.find((f) => f.findingId === findingId)
  if (!finding) return { ok: false, problems: [{ code: 'finding_not_found', detail: '发现不存在' }] }

  const problems: RuleViolation[] = []
  const self = forbidSelfVerification(finding.candidate.author, input.verifier)
  if (self) problems.push(self)

  // 三态各自的门槛
  if (input.status === 'confirmed') problems.push(...confirmedRequirements(finding.candidate))
  if (input.status === 'needs_validation') problems.push(...needsValidationRules(input.unknownFact, input.severity))
  if (input.status === 'rejected') problems.push(...rejectedRules(input.refutation))

  if (problems.length > 0) return { ok: false, problems }

  // 纵深防御缺口归口：强制 needs_validation + 去 severity
  const norm = defenseInDepthNormalization(input.status, input.defenseInDepth === true, input.severity)
  const verification: FindingVerification = {
    verificationId: `v-${findingId}-${now.toString(36)}`,
    verifier: input.verifier,
    status: norm.status,
    ...(input.refutation ? { refutation: input.refutation } : {}),
    ...(input.unknownFact ? { unknownFact: input.unknownFact } : {}),
    ...(norm.severity ? { severity: norm.severity } : {}),
    ...(input.defenseInDepth ? { defenseInDepth: true } : {}),
    at: now,
    recordHash: candidateHash(finding.candidate),
  }
  finding.verifications.push(verification)
  finding.status = norm.status
  finding.severity = norm.severity
  finding.unknownFact = norm.status === 'needs_validation' ? (input.unknownFact ?? finding.unknownFact) : undefined
  finding.refutation = norm.status === 'rejected' ? input.refutation : undefined
  finding.defenseInDepth = input.defenseInDepth === true || undefined
  finding.decidedBy = input.verifier
  finding.decidedAt = now
  return { ok: true, value: finding }
}
