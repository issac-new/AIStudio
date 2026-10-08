// Release Evidence Package（L5.7，v0.1 §71）：qgate release-report 的数据组装。
// 输出 markdown（人读）+ JSON（机读），供 delivery.release-evidence 门与人类签核消费。
// v0.3.1（上游 v1.25/1.26/1.28/1.31 吸收轮）：Gate Summary 加来源列与来源分布行
// （核验/声明/降级/无信号，非 PASS 显示 —）；Claim Coverage 从"声明面覆盖"升级为
// "实况关联"（逐 claim 列关联门与当轮判定，未验证区分成因）；新增 advisory 可见面
// （CONDITIONAL 不阻断但必须可见）；Unresolved 附修复优先纪律句——修复只改制品不改验收线。

import type { Claim, Evidence, GateRun, GateSpec, Risk, ExceptionWaiver } from './types.js'
import { latestRuns, loadRun, loadRunEvidence, listRisks, listWaivers, storePaths } from './store.js'
import { VERDICT_TO_DELIVERY, DOMAIN_TO_GATES } from './align.js'
import { resolveProfile, findProfile, effectivePolicy } from './profile.js'
import { SOURCE_LABEL_ZH, sourceDistribution as aggregateSourceDistribution, type SourceBucket, type SourceDistribution } from './sources.js'
import type { LoadResult } from './loader.js'

/** 修复优先纪律（上游 v1.25 受控表达）：放松验收不是修复选项。 */
export const FIX_FIRST_DISCIPLINE =
  'fix artifacts, not acceptance lines — disabling gates, loosening thresholds, adding waivers or rewriting acceptance criteria is an acceptance change requiring explicit decision and registration (qgate waive/intent), never a fix action'

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
    /** 来源信号桶（PASS/CONDITIONAL/WAIVED 才分类；FAIL/INCONCLUSIVE/NOT_APPLICABLE 为 undefined → 渲染 —）。 */
    sourceBucket?: SourceBucket
    evidence: Array<{ type: string; result: string; execution: string; producer: string; summary?: string }>
  }>
  sourceDistribution: SourceDistribution
  claimCoverage: Array<{
    claimId: string
    statement: string
    coveredBy: string[]
    /** 逐关联门实况判定（最新 run；未跑过的门不在列）。 */
    linked: Array<{ gateId: string; verdict: GateRun['verdict'] }>
    /** 未验证成因（上游 v1.28 区分）：no-gate=无关联门；gate-not-run=关联门全未执行；
        null=已有门执行（通过与否由 linked 呈现，读者自判）。 */
    unverifiedCause: 'no-gate' | 'gate-not-run' | null
  }>
  /** advisory 可见面（上游 v1.26：CONDITIONAL 不阻断判定，但不得静默）。 */
  advisory: Array<{ gateId: string; conditions: string[] }>
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
      sourceBucket: run?.sourceSignal?.bucket,
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

  // 来源分布聚合行：只统计已分类门禁（非 PASS 不入桶——"—"不冒充"无信号"）
  const sourceDistribution = aggregateSourceDistribution(
    gates.map((g) => (g.sourceBucket ? { labels: [], bucket: g.sourceBucket } : undefined)),
  )

  const claimCoverage = loaded.config.claims.map((claim: Claim) => {
    const coveredBy = enabledGates.filter((g) => g.spec.claims.includes(claim.id)).map((g) => g.metadata.id)
    const linked = coveredBy
      .filter((gid) => state[gid])
      .map((gid) => ({ gateId: gid, verdict: state[gid].verdict as GateRun['verdict'] }))
    const unverifiedCause: ReleaseReportData['claimCoverage'][number]['unverifiedCause'] =
      coveredBy.length === 0 ? 'no-gate' : linked.length === 0 ? 'gate-not-run' : null
    return { claimId: claim.id, statement: claim.statement, coveredBy, linked, unverifiedCause }
  })
  // 声明了 claim 但无门引用 → unresolved
  const orphanClaims = claimCoverage.filter((c) => c.coveredBy.length === 0).map((c) => `claim ${c.claimId} not covered by any enabled gate`)

  const now = Date.now()
  const exceptions = listWaivers(paths).map((w) => ({ ...w, active: w.expiresAt > now }))
  // advisory = warn 档降级出的 CONDITIONAL（非阻断，但必须可见）
  const advisory = gates
    .filter((g) => g.verdict === 'CONDITIONAL')
    .map((g) => ({ gateId: g.gateId, conditions: g.conditions ?? [] }))
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
    sourceDistribution,
    claimCoverage,
    advisory,
    openRisks: listRisks(paths).filter((r) => r.status === 'open'),
    exceptions,
    unresolved,
  }
}

export function renderReleaseReportMd(data: ReleaseReportData): string {
  const lines: string[] = []
  const when = new Date(data.generatedAt).toISOString()
  lines.push(`# Release Evidence Package`, ``, `- generated: ${when}`, `- profile: ${data.profile}${data.tier ? ` (tier=${data.tier})` : ''}`, `- workspace: ${data.workspace}`, ``)

  lines.push(`## Gate Summary`, ``, `| gate | domain | verdict (delivery) | source | run |`, `|---|---|---|---|---|`)
  for (const g of data.gates) {
    const src = g.sourceBucket ? SOURCE_LABEL_ZH[g.sourceBucket] : '—'
    lines.push(`| ${g.gateId} | ${g.domain} | ${g.verdict} (${g.deliveryVerdict}) | ${src} | ${g.runId ?? '-'} |`)
  }
  lines.push(``, `- 来源分布: 核验 ${data.sourceDistribution.verified} · 声明 ${data.sourceDistribution.declared} · 降级 ${data.sourceDistribution.degraded} · 无信号 ${data.sourceDistribution.none}（优先级 降级＞核验＞声明；非 PASS 门禁不计入并显示 —）`, ``)

  lines.push(`## Claim Coverage`, ``)
  if (data.claimCoverage.length === 0) lines.push(`(no claims declared)`)
  for (const c of data.claimCoverage) {
    lines.push(`- **${c.claimId}** — ${c.statement}`)
    if (c.coveredBy.length === 0) lines.push(`  - 未验证（无关联门禁执行 — 声明未被任何门背书）`)
    else if (c.unverifiedCause === 'gate-not-run') lines.push(`  - 未验证（关联门禁未执行: ${c.coveredBy.join(', ')}）`)
    else {
      const linked = c.linked.map((l) => `${l.gateId}=${l.verdict}`).join(', ')
      lines.push(`  - 声明关联: ${linked}`)
    }
  }
  lines.push(`  - 边界：门禁 PASS 证明其配置输入与观察，不等于声明全文已被证明`, ``)

  lines.push(`## Advisory (${data.advisory.length})`, ``)
  if (data.advisory.length === 0) lines.push(`(none)`)
  for (const a of data.advisory) {
    lines.push(`- ${a.gateId}: ${a.conditions.join('; ') || '(conditional)'}（不阻断判定，解除条件清零前不得视为 PASS）`)
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
  lines.push(``, `> ${FIX_FIRST_DISCIPLINE}`, ``)
  return lines.join('\n')
}
