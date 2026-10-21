// overlay/secaudit 域：报告期独立记录复核。
//
// 阶段 5（Cloudflare 六阶段之"独立记录复核"）：最终报告里的每条发现，
// 由一个没参与发现与裁决的人/角色再复核一遍；复核绑定记录哈希，
// 内容一旦改动，既有复核自动失效——防止"复核完又偷偷改结论"。
import type { AuditProject, RuleResult, SecAuditFinding } from './types'
import { candidateHash } from './validate'

export interface RecordReviewSummary {
  total: number
  verified: number
  replaced: number
  stale: number
}

export function reviewFindingRecord(
  project: AuditProject,
  findingId: string,
  input: { reviewer: string; outcome: 'verified' | 'replaced' },
  now: number,
): RuleResult<SecAuditFinding> {
  const finding = project.findings.find((f) => f.findingId === findingId)
  if (!finding) return { ok: false, problems: [{ code: 'finding_not_found', detail: '发现不存在' }] }
  if (finding.candidate.author === input.reviewer) {
    return { ok: false, problems: [{ code: 'self_review_forbidden', detail: '发现者不得复核自己的记录' }] }
  }
  const hash = candidateHash(finding.candidate)
  finding.recordReviews.push({
    reviewId: `rr-${findingId}-${now.toString(36)}`,
    reviewer: input.reviewer,
    outcome: input.outcome,
    at: now,
    recordHash: hash,
  })
  return { ok: true, value: finding }
}

/** 记录复核汇总：被改过的记录（hash 不匹配）计入 stale，不算已复核。 */
export function recordReviewSummary(findings: SecAuditFinding[]): RecordReviewSummary {
  let verified = 0
  let replaced = 0
  let stale = 0
  let total = 0
  for (const f of findings) {
    if (f.status === 'rejected') continue  // rejected 不进报告，不强求复核
    total += 1
    const hash = candidateHash(f.candidate)
    const latest = f.recordReviews[f.recordReviews.length - 1]
    if (!latest) continue
    if (latest.recordHash !== hash) {
      stale += 1
      continue
    }
    if (latest.outcome === 'verified') verified += 1
    else replaced += 1
  }
  return { total, verified, replaced, stale }
}

/** 是否允许出报告：所有 confirmed/needs_validation 记录都有未失效的复核。 */
export function recordReviewGate(findings: SecAuditFinding[]): { pass: boolean; missing: string[] } {
  const missing: string[] = []
  for (const f of findings) {
    if (f.status === 'rejected') continue
    const hash = candidateHash(f.candidate)
    const latest = f.recordReviews[f.recordReviews.length - 1]
    if (!latest || latest.recordHash !== hash) missing.push(f.findingId)
  }
  return { pass: missing.length === 0, missing }
}
