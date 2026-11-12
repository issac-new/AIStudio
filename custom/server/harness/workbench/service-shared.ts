// workbench 服务共享核心（v0.4 单文件体量治理：第二批拆分，来自 service.ts，行为不变）。
// overlay/custom/server/harness/workbench/service.ts
// 改进实验台服务层：状态机 + 证据绑定 + 门禁 + 写盘/回滚。
// 所有对外的写操作都走 mutateStore 串行化；错误抛 ServiceError（带 HTTP 状态）。
import { execFile } from 'child_process'
import { readFileSync } from 'fs'
import { appendApprovalLog } from '../../approval-inbox/approval-log'
import { listCandidates } from '../../expcandidates/exp-store'
import type { ExpCandidate } from '../../expcandidates/exp-types'
import { applyEnabled, applyProposalFile, fileDigest, rollbackProposalFile } from './apply'
import { attachRegression, readEvalEvidence, readRegressionEvidence } from './evidence'
import type { RegressionEvidence } from './types'
import {
  DEFAULT_BUDGET_CAP_USD, MAX_VARIANTS, annealedEditBudget, behaviorContrast, candidateDiversity,
  composedVariant, diffSummary, diffSummaryTree, evaluatePromotion, evolutionReport,
  findBenchmarkLeakage, findGraderMarkers, findGraderMarkersInPath, hypothesisRetries,
  leakageBlockers, maxEditCount, paretoReportOf, probeCost, proposalArchive,
  proposerEvolutionHistory, deletionProposalTemplate, pruneSignal, verificationTierOf,
  rsiConfig, sha256, stallDetection, submitReadiness,
  surfaceRound, treeDigest, validateTree, variantContent, variantSetDigest,
} from './loop'
import { behavioralDiversity, decomposeSearch, gainRetention, objectivePointsOf } from './multi-objective'
import { createSet, getSet } from '../../eval/store'
import { runReplayEval } from '../../eval/runner'
import { loadEvalConfig } from '../../eval/types'
import type { AskFn } from '../../eval/judge'
import type { OutcomeRunContext } from '../../eval/outcome'
import { assertTreeRunnable, runProbeTasks, DEFAULT_TASK_COST_ESTIMATE_USD, type SpawnRun } from './probe-runner'
import { nextId, mutateStore, readStore, persistAutoJob, listOrphanAutoJobs } from './store'
import { listComponents, librarySummary, recordComponent } from './component-library'
import { ensureScheduleFile, readSchedulePolicy, validateSchedulePolicy, normalizeSchedulePolicy, DEFAULT_SCHEDULE_POLICY, SCHEDULE_REL } from './schedule-policy'
import { collectSurfaces, hermesHome, resolveManagedTarget, surfaceDef } from './surface-registry'
import { experienceFreshness, memoryConsolidationPolicy, type ExperienceFreshness } from './experience-freshness'
import type {
  BehaviorContrast, Champion, EditableSurface, EvolutionReport, Experience, ExperienceStatus,
  ConstraintCheck, GateBlocker, ParetoReport, Probe, ProbeMetrics, Proposal, ProposalStatus, PromotionGateReport,
  RegularizationDerived, SurfaceKey, Variant,
} from './types'
import type { ArchiveSteppingStone } from './loop'


export class ServiceError extends Error {
  status: number
  detail?: unknown
  constructor(status: number, message: string, detail?: unknown) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

export interface ProposalDerived {
  gate: PromotionGateReport
  cost: { total: number; complete: boolean; missing: string[] }
  recordedProbes: number
  totalProbes: number
  selectedVariantId: string | null
  selectedContrast: BehaviorContrast | null
  diversity: { n: number; nDistinct: number; meanLineJaccard: number }
  /** RRSI 正则化读数（2026-10-23 吸收轮；视图现算不落盘）。 */
  regularization: RegularizationDerived
  /** HarnessPro 帕累托三档报告（2026-10-23 吸收轮；视图现算不落盘）。 */
  pareto: ParetoReport
  /** Harmony 多目标搜索报告（2026-11-03 吸收轮）：分解代表解、增益保留率、行为多样性监测。 */
  search: {
    decomposition: ReturnType<typeof decomposeSearch>
    retention: ReturnType<typeof gainRetention>
    diversity: ReturnType<typeof behavioralDiversity>
  }
}

export type ProposalView = Proposal & { derived: ProposalDerived }

export function nowIso(): string {
  return new Date().toISOString()
}

export function currentChampionOf(champions: Champion[], surfaceKey: SurfaceKey, excludeProposalId?: string): Champion | null {
  return champions
    .filter((c) => c.surfaceKey === surfaceKey && !c.rolledBack && c.proposalId !== excludeProposalId)
    .sort((a, b) => (a.promotedAt < b.promotedAt ? 1 : -1))[0] ?? null
}

export function requireProposal(store: { proposals: Proposal[] }, id: string): Proposal {
  const p = store.proposals.find((x) => x.id === id)
  if (!p) throw new ServiceError(404, `提案不存在：${id}`)
  return p
}

export function derive(
  proposal: Proposal,
  champion: Champion | null,
  regularization: RegularizationDerived | null = null,
  leakage: GateBlocker[] = [],
): ProposalDerived {
  const gate = evaluatePromotion({
    proposal,
    currentChampion: champion,
    applyRequested: false,
    applyEnvEnabled: applyEnabled(),
    regularization,
    leakage,
  })
  const cost = probeCost(proposal)
  const selected = composedVariant(proposal)
  const selectedProbe = selected ? proposal.probes.find((p) => p.variantId === selected.id && p.status === 'recorded') : null
  return {
    gate,
    cost,
    recordedProbes: proposal.probes.filter((p) => p.status === 'recorded').length,
    totalProbes: proposal.probes.length,
    selectedVariantId: selected?.id ?? null,
    selectedContrast: selectedProbe?.contrast ?? null,
    diversity: candidateDiversity(proposal.variants),
    regularization: regularization ?? emptyRegularization(proposal),
    pareto: paretoReportOf(proposal),
    search: (() => {
      const { points, excluded } = objectivePointsOf(proposal)
      const decomposition = decomposeSearch(points)
      decomposition.excluded = excluded
      const sel = composedVariant(proposal)
      const probe = sel ? proposal.probes.find((p) => p.variantId === sel.id && p.status === 'recorded') : null
      const ev = probe?.evidence
      const retention = gainRetention({
        passAt1: ev?.passAt1 ?? null,
        baselinePassAt1: ev?.equalBudgetBaseline?.passAt1 ?? null,
        heldoutPassRate: proposal.heldout?.passRate ?? null,
        heldoutBaselinePassRate: ev?.heldoutBaselinePassRate ?? null,
      })
      return {
        decomposition,
        retention,
        diversity: behavioralDiversity(proposal.variants.map((v) => v.content)),
      }
    })(),
  }
}

export function emptyRegularization(proposal: Proposal): RegularizationDerived {
  const cfg = rsiConfig()
  const mec = maxEditCount(proposal.variants)
  const budget = annealedEditBudget(0, cfg)
  return {
    round: 0,
    horizon: cfg.horizon,
    editBudget: budget,
    maxEditCount: mec,
    editBudgetExceeded: mec != null && mec > budget,
    noiseDelta: proposal.noise?.delta ?? null,
    noiseRuns: proposal.noise?.runIds.length ?? 0,
    stalled: false,
    stallWindow: cfg.stallWindow,
    firstOnSurface: true,
    hypothesisRetry: [],
  }
}

/** RRSI 提案端读数：轮次/预算/噪声/停滞/失败假设复提（service 层从全store 现算）。 */
export function regularizationOf(store: { proposals: Proposal[]; champions: Champion[] }, p: Proposal): RegularizationDerived {
  const cfg = rsiConfig()
  const round = surfaceRound(store.champions, p.surfaceKey)
  const editBudget = annealedEditBudget(round, cfg)
  const mec = maxEditCount(p.variants)
  const surfaceProposals = store.proposals.filter((x) => x.surfaceKey === p.surfaceKey)
  return {
    round,
    horizon: cfg.horizon,
    editBudget,
    maxEditCount: mec,
    editBudgetExceeded: mec != null && mec > editBudget,
    noiseDelta: p.noise?.delta ?? null,
    noiseRuns: p.noise?.runIds.length ?? 0,
    stalled: stallDetection(surfaceProposals, cfg.stallWindow),
    stallWindow: cfg.stallWindow,
    firstOnSurface: surfaceProposals.filter((x) => x.id !== p.id).length === 0,
    hypothesisRetry: hypothesisRetries(store.proposals, p.surfaceKey, p.id, p.hypothesis),
  }
}

/**
 * 泄漏批评者（S1）：按探测证据集（缺席按基线集）做确定性扫描。
 * 评测前（未组合）扫全部候选——这是论文「critic 在评测前读 diff」的本仓落点，省探测预算；
 * 组合后只扫选中候选。密封集内容不出 API 面——扫描照做，但 blocker 文案不携带内容摘录。
 */
export function leakageForProposal(p: Proposal): GateBlocker[] {
  const selected = composedVariant(p)
  const targets: Variant[] = selected ? [selected] : p.variants
  if (targets.length === 0) return []
  const probe = selected ? p.probes.find((x) => x.variantId === selected.id && x.status === 'recorded') : null
  const setId = probe?.evidence?.setId ?? p.baseline?.setId ?? null
  if (!setId) return []
  const set = getSet(setId)
  if (!set) return []
  const parts: Array<{ where: string; content: string }> = targets.flatMap((v) => [
    { where: v.label, content: v.label },
    { where: v.label, content: v.content },
    ...(v.files ?? []).flatMap((f) => [
      { where: `${v.label} :: ${f.path}`, content: f.content },
      { where: `${v.label} :: 路径`, content: f.path },
    ]),
    ...(v.deletions ?? []).map((d) => ({ where: `${v.label} :: 删除 ${d}`, content: d })),
  ])
  const findings = findBenchmarkLeakage(parts, { id: set.id, tasks: set.tasks })
  if (set.sealed) {
    return findings.map((f) => ({
      code: 'benchmark_leakage',
      message: `候选携带评测集内容（${f.where}，类型 ${f.kind}；密封集不展示原文）——benchmark 特化而非通用改进（RRSI 泄漏批评者）`,
    }))
  }
  return leakageBlockers(findings)
}

export function view(store: { proposals: Proposal[]; champions: Champion[] }, proposal: Proposal): ProposalView {
  return {
    ...proposal,
    derived: derive(
      proposal,
      currentChampionOf(store.champions, proposal.surfaceKey),
      regularizationOf(store, proposal),
      leakageForProposal(proposal),
    ),
  }
}

export async function recordProbe(id: string, probeId: string, input: RecordProbeInput): Promise<ProposalView> {
  const metrics = readEvalEvidence(input.evalRunId)
  if (!metrics) throw new ServiceError(400, `评测运行不存在或未聚合：${input.evalRunId}`)
  if ((metrics.evidenceMode ?? 'explicit') !== 'explicit') {
    throw new ServiceError(400, 'origin/mixed 是诊断证据，不能作为候选探测；请绑定 fresh explicit 评测运行')
  }
  // strictNullChecks 下 `= null` 只推得 null 型，按 readRegressionEvidence 返回形状注解
  let regression: RegressionEvidence | null = null
  if (input.regressionRunId) {
    regression = readRegressionEvidence(input.regressionRunId)
    if (!regression) throw new ServiceError(400, `回归运行不存在：${input.regressionRunId}`)
  }
  let equalBudget: ProbeMetrics['equalBudgetBaseline'] = null
  if (input.equalBudgetBaselineRunId) {
    const eq = readEvalEvidence(input.equalBudgetBaselineRunId)
    if (!eq) throw new ServiceError(400, `等预算基线运行不存在或未聚合：${input.equalBudgetBaselineRunId}`)
    if ((eq.evidenceMode ?? 'explicit') !== 'explicit') {
      throw new ServiceError(400, '等预算基线必须是 fresh explicit 评测运行（origin/mixed 只能诊断）')
    }
    if (eq.setId !== metrics.setId) {
      throw new ServiceError(400, `等预算基线必须与候选同一评测集（${eq.setId} ≠ ${metrics.setId}）`)
    }
    if (eq.evalRunId === input.evalRunId) {
      throw new ServiceError(400, '等预算基线不能与候选探测复用同一运行')
    }
    equalBudget = { runId: eq.evalRunId, setId: eq.setId, passAt1: eq.passAt1 }
  }
  let counterfactual: ProbeMetrics['counterfactual'] = null
  if (input.counterfactualRunId) {
    const cf = readEvalEvidence(input.counterfactualRunId)
    if (!cf) throw new ServiceError(400, `反事实运行不存在或未聚合：${input.counterfactualRunId}`)
    if ((cf.evidenceMode ?? 'explicit') !== 'explicit') {
      throw new ServiceError(400, '反事实运行必须是 fresh explicit 评测运行（origin/mixed 只能诊断）')
    }
    if (cf.evalRunId === input.evalRunId) {
      throw new ServiceError(400, '反事实运行不能与候选探测复用同一运行')
    }
    counterfactual = { runId: cf.evalRunId, setId: cf.setId, passAt1: cf.passAt1 }
  }
  return mutateStore((store) => {
    const p = requireProposal(store, id)
    if (p.status !== 'approved' && p.status !== 'probing' && p.status !== 'composed') {
      throw new ServiceError(409, `当前状态 ${p.status} 不可记录探测`)
    }
    const probe = p.probes.find((x) => x.id === probeId)
    if (!probe) throw new ServiceError(404, `探测不存在：${probeId}`)
    if (p.baselineRunId && input.evalRunId === p.baselineRunId) {
      throw new ServiceError(400, '候选探测不能复用基线运行')
    }
    if (!p.baseline) throw new ServiceError(400, '提案缺少基线，无法做行为对比')
    const withRegression: ProbeMetrics = {
      ...(regression ? attachRegression(metrics, regression) : metrics),
      ...(equalBudget ? { equalBudgetBaseline: equalBudget } : {}),
      ...(counterfactual ? { counterfactual } : {}),
      // W1（2026-11-05）：执行证迹随探测一起落账；null/缺席=未采集（门按配置处置）。
      ...(input.executionTrace !== undefined ? { executionTrace: input.executionTrace } : {}),
    }
    const contrast = behaviorContrast(p.baseline, withRegression)
    probe.status = 'recorded'
    probe.evalRunId = input.evalRunId
    probe.regressionRunId = input.regressionRunId ?? undefined
    probe.evidence = withRegression
    probe.contrast = contrast
    probe.note = String(input.note ?? '').slice(0, 500)
    probe.recordedBy = String(input.actor ?? 'operator')
    probe.recordedAt = nowIso()
    p.updatedAt = nowIso()
    return view(store, p)
  })
}

/**
 * R6（2026-10-31 二批执行）：绑定密封留出集读数（heldout-store scoreSet 形状）。
 * 只接受 {runId,n,passRate}——内容永不出库（held-out-store 防探测契约）。
 */

export interface RecordProbeInput {
  evalRunId: string
  regressionRunId?: string | null
  /** HDA 等预算基线运行（可选；必须是同评测集、explicit 的真实运行）。 */
  equalBudgetBaselineRunId?: string | null
  /** CHASE 反事实变体运行（可选；语义保持、协议变换集上的 explicit 真实运行）。 */
  counterfactualRunId?: string | null
  /** 执行证迹（W1，2026-11-05）：自动探测采集；手填入口不提供该字段。 */
  executionTrace?: ProbeMetrics['executionTrace']
  note?: string
  actor?: string
}

export function readFileSafe(abs: string): string | null {
  try {
    return readFileSync(abs, 'utf8')
  } catch {
    return null
  }
}

export function profileFromTarget(targetPath: string | null): string | null {
  if (!targetPath) return null
  const m = targetPath.match(/^profiles\/([^/]+)\//)
  return m ? m[1] : null
}

export function readHomeFileSafe(rel: string | null): string | null {
  if (!rel || rel.startsWith('/') || rel.split('/').includes('..')) return null
  return readFileSafe(`${hermesHome()}/${rel}`)
}

/** 从 targetPath（profiles/<name>/...）推导探测运行的基准档案；推不出返回 null。 */
