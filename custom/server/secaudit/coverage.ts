// overlay/secaudit 域：覆盖账本 + 覆盖批评者。
//
// 账本回答的是"哪些面根本没看"，不是"哪些面看了觉得干净"——安全审计最大的风险
// 是后者伪装成前者。批评者专门攻击账本本身的完备性：标 full 没证据、证据先于
// 运行起点、面没映射到攻击类、全数无 rejected（要么没真审要么验证不力）。
import type {
  AuditProject, AuditRun, CoverageCriticFinding, CoverageEntry, CoverageLedger, SurfaceClass,
} from './types'
import { SURFACE_CATALOG, surfaceClasses } from './catalog'

export interface AutoEvidence {
  /** 采集器名 → { 条目数, 人话摘要 }（纯只读采集结果）。 */
  [collector: string]: { count: number; summary: string }
}

/**
 * 构建覆盖账本：
 *  - 自动面：有采集器读数即 full（读数=证据），采集器不可用/零读数且无人补 → partial。
 *  - 人工面：有人登记候选且写了证据摘要 → full；只登记候选 → partial；空 → unchecked。
 *  - 目标指纹变化：上一 run 的 full/partial 证据降级 partial（历史证据不当已覆盖）。
 */
export function buildCoverageLedger(
  project: AuditProject,
  run: AuditRun,
  auto: AutoEvidence,
  now: number,
): CoverageLedger {
  const entries: CoverageEntry[] = []
  const candidatesByClass = new Map<SurfaceClass, number>()
  for (const f of project.findings) {
    if (f.candidate.surfaceClass) {
      candidatesByClass.set(f.candidate.surfaceClass, (candidatesByClass.get(f.candidate.surfaceClass) ?? 0) + 1)
    }
  }
  // 目标指纹变化：本 run 指纹 ≠ 上一 run 指纹 → 自动与人工证据一律 partial（必须在新目标上复核）。
  const prevRun = [...project.runs]
    .filter((r) => r.runId !== run.runId)
    .sort((a, b) => b.startedAt - a.startedAt)[0]
  const targetChanged = prevRun !== undefined && prevRun.targetFingerprint !== run.targetFingerprint

  for (const def of SURFACE_CATALOG) {
    const collectorKey = def.collector
    const autoEvidence = collectorKey ? auto[collectorKey] : undefined
    const candidateCount = candidatesByClass.get(def.class) ?? 0
    let status: CoverageEntry['status']
    let evidenceSummary: string | undefined
    let partialReason: string | undefined
    let checkedAt: number | undefined
    let checkedBy: string | undefined
    let autoFindingCount: number | undefined

    if (autoEvidence !== undefined) {
      // 自动面：读数本身就是证据；零发现也是证据（"查过，没发现"）。
      autoFindingCount = autoEvidence.count
      evidenceSummary = autoEvidence.summary
      status = targetChanged ? 'partial' : 'full'
      if (targetChanged) partialReason = '目标指纹已变，上一轮采集证据降级（需在当前目标上复核）'
      checkedAt = now
      checkedBy = collectorKey
    } else if (candidateCount > 0) {
      // 人工面：有候选登记；无证据摘要只算 partial。
      const withEvidence = project.findings.some(
        (f) => f.candidate.surfaceClass === def.class && !!(f.candidate.observation?.trim() || f.candidate.traceChain?.trim()),
      )
      status = targetChanged ? 'partial' : withEvidence ? 'full' : 'partial'
      partialReason = targetChanged
        ? '目标指纹已变，上一轮候选证据降级'
        : withEvidence ? undefined : '已登记候选但缺完整证据摘要'
      checkedBy = 'manual'
    } else {
      status = 'unchecked'
    }

    entries.push({
      id: `${def.class}`,
      surfaceClass: def.class,
      status,
      ...(evidenceSummary ? { evidenceSummary } : {}),
      ...(autoFindingCount !== undefined ? { autoFindingCount } : {}),
      ...(candidateCount > 0 ? { candidateCount } : {}),
      ...(checkedBy ? { checkedBy } : {}),
      ...(checkedAt !== undefined ? { checkedAt } : {}),
      ...(partialReason ? { partialReason } : {}),
    })
  }

  const summary = {
    total: entries.length,
    full: entries.filter((e) => e.status === 'full').length,
    partial: entries.filter((e) => e.status === 'partial').length,
    unchecked: entries.filter((e) => e.status === 'unchecked').length,
    coverageRatio: entries.length === 0 ? 0 : entries.filter((e) => e.status === 'full').length / entries.length,
  }
  return { entries, critic: criticizeCoverage(entries, project, run), summary }
}

/** 覆盖批评者：攻击账本完备性，产出不可信信号。 */
export function criticizeCoverage(
  entries: CoverageEntry[],
  project: AuditProject,
  run: AuditRun,
): CoverageCriticFinding[] {
  const out: CoverageCriticFinding[] = []
  const registered = new Set(surfaceClasses())
  for (const e of entries) {
    if (e.status === 'unchecked') {
      out.push({ id: `unchecked:${e.surfaceClass}`, kind: 'unchecked_surface', surfaceClass: e.surfaceClass, detail: `面未检查：${e.surfaceClass}` })
    }
    if (e.status === 'full' && !e.evidenceSummary?.trim()) {
      out.push({ id: `no-evidence:${e.surfaceClass}`, kind: 'no_evidence', surfaceClass: e.surfaceClass, detail: `标 full 但无证据摘要：${e.surfaceClass}` })
    }
    if (e.status !== 'unchecked' && e.checkedAt !== undefined && e.checkedAt < run.startedAt) {
      out.push({ id: `stale:${e.surfaceClass}`, kind: 'stale_evidence', surfaceClass: e.surfaceClass, detail: `证据早于本轮起点：${e.surfaceClass}` })
    }
    if (!registered.has(e.surfaceClass)) {
      out.push({ id: `unmapped:${e.surfaceClass}`, kind: 'unmapped_class', surfaceClass: e.surfaceClass, detail: `未映射到攻击面类：${e.surfaceClass}` })
    }
  }
  const anyRejected = project.findings.some((f) => f.status === 'rejected')
  if (project.findings.length > 0 && !anyRejected) {
    out.push({ id: 'no-rejected', kind: 'no_rejected_findings', detail: '全部候选无一被证伪——要么审计没真对抗，要么验证不力' })
  }
  return out
}
