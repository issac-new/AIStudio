// Release Evidence Package（L5.7，v0.1 §71）：qgate release-report 的数据组装。
// 输出 markdown（人读）+ JSON（机读），供 delivery.release-evidence 门与人类签核消费。

import type { Claim, Evidence, GateRun, GateSpec, Risk, ExceptionWaiver } from './types.js'
import { latestRuns, loadRun, loadRunEvidence, listRisks, listWaivers, storePaths } from './store.js'
import { VERDICT_TO_DELIVERY, DOMAIN_TO_GATES } from './align.js'
import { resolveProfile, findProfile, effectivePolicy } from './profile.js'
import type { LoadResult } from './loader.js'

export interface ReleaseReportData {
  generatedAt: number
  profile: string
  tier?: string
  workspace: string
  gates: Array<{
    gateId: string
    domain: string
    deliveryGates: string[]
    verdict: GateRun['verdict']
    deliveryVerdict: 'pass' | 'conditional' | 'reject'
    runId?: string
    conditions?: string[]
    failureSummary?: string
    evidence: Array<{ type: string; result: string; execution: string; producer: string; summary?: string }>
  }>
  claimCoverage: Array<{ claimId: string; statement: string; coveredBy: string[] }>
  openRisks: Risk[]
  exceptions: Array<ExceptionWaiver & { active: boolean }>
  unresolved: string[]
}

export function buildReleaseReport(loaded: LoadResult): ReleaseReportData {
  const paths = storePaths(loaded.qgateDir)
  const profile = findProfile(loaded.profiles, loaded.config.profile)
  const resolved = resolveProfile(loaded.gates, profile, loaded.config.profile)
  const enabledGates = loaded.gates.filter((g) => resolved.enabled.get(g.metadata.id) === true)
  const state = latestRuns(paths)

  const gates: ReleaseReportData['gates'] = enabledGates.map((spec: GateSpec) => {
    const entry = state[spec.metadata.id]
    const run = entry ? loadRun(paths, entry.runId) : undefined
    const evidence = run ? loadRunEvidence(paths, run.runId) : []
    const requiredTypes = spec.spec.evidence.required
    return {
      gateId: spec.metadata.id,
      domain: spec.spec.domain,
      deliveryGates: DOMAIN_TO_GATES[spec.spec.domain] ?? [],
      verdict: run?.verdict ?? 'INCONCLUSIVE',
      deliveryVerdict: VERDICT_TO_DELIVERY[run?.verdict ?? 'INCONCLUSIVE'],
      runId: run?.runId,
      conditions: run?.conditions,
      failureSummary: run?.failureSummary,
      evidence: requiredTypes.map((type) => {
        const latest = evidence
          .filter((e) => e.type === type)
          .reduce<Evidence | undefined>((a, b) => (b.provenance.startedAt >= (a?.provenance.startedAt ?? 0) ? b : a), undefined)
        return {
          type,
          result: latest?.result ?? 'MISSING',
          execution: latest?.execution ?? '-',
          producer: latest?.producer ?? '-',
          summary: latest?.summary,
        }
      }),
    }
  })

  const claimById = new Map(loaded.config.claims.map((c: Claim) => [c.id, c]))
  const claimCoverage = loaded.config.claims.map((claim: Claim) => ({
    claimId: claim.id,
    statement: claim.statement,
    coveredBy: enabledGates.filter((g) => g.spec.claims.includes(claim.id)).map((g) => g.metadata.id),
  }))
  // 声明了 claim 但无门引用 → unresolved
  const orphanClaims = claimCoverage.filter((c) => c.coveredBy.length === 0).map((c) => `claim ${c.claimId} not covered by any enabled gate`)

  const now = Date.now()
  const exceptions = listWaivers(paths).map((w) => ({ ...w, active: w.expiresAt > now }))
  const unresolved = [
    ...orphanClaims,
    ...gates
      .filter((g) => g.verdict === 'FAIL' || g.verdict === 'INCONCLUSIVE')
      .map((g) => `${g.gateId}: ${g.verdict}${g.failureSummary ? ` — ${g.failureSummary}` : ''}`),
  ]

  return {
    generatedAt: now,
    profile: resolved.profileId,
    tier: resolved.tier,
    workspace: loaded.projectRoot,
    gates,
    claimCoverage,
    openRisks: listRisks(paths).filter((r) => r.status === 'open'),
    exceptions,
    unresolved,
  }
}

export function renderReleaseReportMd(data: ReleaseReportData): string {
  const lines: string[] = []
  const when = new Date(data.generatedAt).toISOString()
  lines.push(`# Release Evidence Package`, ``, `- generated: ${when}`, `- profile: ${data.profile}${data.tier ? ` (tier=${data.tier})` : ''}`, `- workspace: ${data.workspace}`, ``)

  lines.push(`## Gate Summary`, ``, `| gate | domain | verdict (delivery) | run |`, `|---|---|---|---|`)
  for (const g of data.gates) {
    lines.push(`| ${g.gateId} | ${g.domain} | ${g.verdict} (${g.deliveryVerdict}) | ${g.runId ?? '-'} |`)
  }
  lines.push(``)

  lines.push(`## Claim Coverage`, ``)
  if (data.claimCoverage.length === 0) lines.push(`(no claims declared)`)
  for (const c of data.claimCoverage) {
    lines.push(`- **${c.claimId}** — ${c.statement}`, `  - covered by: ${c.coveredBy.length ? c.coveredBy.join(', ') : '⚠ NONE'}`)
  }
  lines.push(``)

  lines.push(`## Evidence Index`, ``)
  for (const g of data.gates) {
    if (!g.runId) continue
    lines.push(`- ${g.gateId} (${g.runId}):`)
    for (const e of g.evidence) lines.push(`  - ${e.type}: ${e.result}/${e.execution} by ${e.producer}${e.summary ? ` — ${e.summary}` : ''}`)
  }
  lines.push(``)

  lines.push(`## Open Risks (${data.openRisks.length})`, ``)
  for (const r of data.openRisks) lines.push(`- ${r.severity.toUpperCase()} ${r.id}: ${r.description}`)
  lines.push(``)

  lines.push(`## Exceptions (${data.exceptions.length})`, ``)
  for (const e of data.exceptions) {
    lines.push(`- ${e.gateId} by ${e.approver} — ${e.reason} [${e.active ? 'active' : 'EXPIRED'}, expires ${new Date(e.expiresAt).toISOString()}]`)
  }
  lines.push(``)

  lines.push(`## Unresolved (${data.unresolved.length})`, ``)
  if (data.unresolved.length === 0) lines.push(`(none)`)
  for (const u of data.unresolved) lines.push(`- ${u}`)
  lines.push(``)
  return lines.join('\n')
}
