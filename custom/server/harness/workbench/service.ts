// overlay/custom/server/harness/workbench/service.ts
// 改进实验台服务层：状态机 + 证据绑定 + 门禁 + 写盘/回滚。
// 所有对外的写操作都走 mutateStore 串行化；错误抛 ServiceError（带 HTTP 状态）。
import { execFile } from 'child_process'
import { readFileSync } from 'fs'
import { appendApprovalLog } from '../../approvals/approval-log'
import { listCandidates } from '../../expcandidates/exp-store'
import type { ExpCandidate } from '../../expcandidates/exp-types'
import { applyEnabled, applyProposalFile, fileDigest, rollbackProposalFile } from './apply'
import { attachRegression, readEvalEvidence, readRegressionEvidence } from './evidence'
import {
  DEFAULT_BUDGET_CAP_USD, MAX_VARIANTS, annealedEditBudget, behaviorContrast, candidateDiversity,
  composedVariant, diffSummary, diffSummaryTree, evaluatePromotion, evolutionReport,
  findBenchmarkLeakage, findGraderMarkers, findGraderMarkersInPath, hypothesisRetries,
  leakageBlockers, maxEditCount, paretoReportOf, probeCost, pruneSignal, rsiConfig, sha256,
  stallDetection, submitReadiness,
  surfaceRound, treeDigest, validateTree, variantContent, variantSetDigest,
} from './loop'
import { getSet } from '../../eval/store'
import { runReplayEval } from '../../eval/runner'
import { loadEvalConfig } from '../../eval/types'
import type { AskFn } from '../../eval/judge'
import type { OutcomeRunContext } from '../../eval/outcome'
import { assertTreeRunnable, runProbeTasks, DEFAULT_TASK_COST_ESTIMATE_USD, type SpawnRun } from './probe-runner'
import { nextId, mutateStore, readStore } from './store'
import { collectSurfaces, hermesHome, resolveManagedTarget, surfaceDef } from './surface-registry'
import { experienceFreshness, type ExperienceFreshness } from './experience-freshness'
import type {
  BehaviorContrast, Champion, EditableSurface, EvolutionReport, Experience, ExperienceStatus,
  GateBlocker, ParetoReport, Probe, ProbeMetrics, Proposal, ProposalStatus, PromotionGateReport,
  RegularizationDerived, SurfaceKey, Variant,
} from './types'

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
}

export type ProposalView = Proposal & { derived: ProposalDerived }

function nowIso(): string {
  return new Date().toISOString()
}

function currentChampionOf(champions: Champion[], surfaceKey: SurfaceKey, excludeProposalId?: string): Champion | null {
  return champions
    .filter((c) => c.surfaceKey === surfaceKey && !c.rolledBack && c.proposalId !== excludeProposalId)
    .sort((a, b) => (a.promotedAt < b.promotedAt ? 1 : -1))[0] ?? null
}

function requireProposal(store: { proposals: Proposal[] }, id: string): Proposal {
  const p = store.proposals.find((x) => x.id === id)
  if (!p) throw new ServiceError(404, `提案不存在：${id}`)
  return p
}

function derive(
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
  }
}

function emptyRegularization(proposal: Proposal): RegularizationDerived {
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
function regularizationOf(store: { proposals: Proposal[]; champions: Champion[] }, p: Proposal): RegularizationDerived {
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
function leakageForProposal(p: Proposal): GateBlocker[] {
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

function view(store: { proposals: Proposal[]; champions: Champion[] }, proposal: Proposal): ProposalView {
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

export function listProposals(): ProposalView[] {
  const store = readStore()
  return store.proposals
    .slice()
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .map((p) => view(store, p))
}

export function overview(): {
  surfaces: EditableSurface[]
  counts: Record<string, number>
  budget: { observedUsd: number; capUsd: number; proposalsWithBudget: number }
  proposals: ProposalView[]
  champions: Champion[]
  experiences: Array<Experience & { freshness: ExperienceFreshness }>
  evolution: EvolutionReport
  meta: { note: string; source: string; boundary: string }
} {
  const store = readStore()
  const surfaces = collectSurfaces()
  const proposals = store.proposals.map((p) => view(store, p))
  const openStatuses: ProposalStatus[] = ['draft', 'submitted', 'approved', 'probing', 'composed']
  const observedUsd = store.proposals.reduce((sum, p) => sum + probeCost(p).total, 0)
  const capUsd = store.proposals.reduce((sum, p) => sum + p.budgetCapUsd, 0)
  // HP-7 保鲜排序（2026-10-23）：采纳优先于候选/退役，同状态按数值置信降序——
  // 过期未再验证的旧教训沉底（腾讯文误区三：检索应回当前主张，不是原始事实堆砌）。
  const statusRank: Record<ExperienceStatus, number> = { adopted: 0, candidate: 1, retired: 2 }
  const experiences = store.experiences
    .map((e) => ({ ...e, freshness: experienceFreshness(e) }))
    .sort((a, b) => {
      const byStatus = statusRank[a.status] - statusRank[b.status]
      if (byStatus !== 0) return byStatus
      if (a.freshness.confidenceScore !== b.freshness.confidenceScore) {
        return b.freshness.confidenceScore - a.freshness.confidenceScore
      }
      return a.createdAt < b.createdAt ? 1 : -1
    })
    .slice(0, 50)
  return {
    surfaces,
    counts: {
      surfaces: surfaces.length,
      managedSurfaces: surfaces.filter((s) => s.applyMode === 'managed').length,
      proposals: store.proposals.length,
      openProposals: store.proposals.filter((p) => openStatuses.includes(p.status)).length,
      recordedProbes: store.proposals.reduce((n, p) => n + p.probes.filter((x) => x.status === 'recorded').length, 0),
      champions: store.champions.filter((c) => !c.rolledBack).length,
      experiences: store.experiences.length,
      adoptedExperiences: store.experiences.filter((e) => e.status === 'adopted').length,
    },
    budget: { observedUsd, capUsd, proposalsWithBudget: store.proposals.length },
    proposals: proposals.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 50),
    champions: store.champions,
    experiences,
    evolution: evolutionReport(surfaces.map((s) => s.key), store.proposals, store.champions),
    meta: {
      note: '候选、探测、组合、冠军四段闭环；探测证据只来自 Eval Studio 真实运行。',
      source: 'HERMES_HOME 八面产物 + ~/.hermes-web-ui/harness-workbench/workbench.json + Eval Studio 运行。',
      boundary: '本台不替用户跑模型；可直接写盘仅系统提示词与 Skills，且需人工批准 + HARNESS2_APPLY=1；其余六面只出建议。',
    },
  }
}

export interface CreateProposalInput {
  title: string
  hypothesis: string
  surfaceKey: SurfaceKey
  targetPath?: string | null
  treeRoot?: string | null
  mode?: 'parallel' | 'sequential'
  domain?: string
  budgetCapUsd?: number
  evidenceRefs?: string[]
  experienceIds?: string[]
  variants: Array<{ label?: string; content?: string; files?: Array<{ path: string; content: string }>; deletions?: string[] }>
  profile?: string | null
  createdBy?: string
}

export async function createProposal(input: CreateProposalInput): Promise<ProposalView> {
  const def = surfaceDef(input.surfaceKey)
  if (!def) throw new ServiceError(400, `未知可编辑面：${input.surfaceKey}`)
  const title = String(input.title ?? '').trim()
  const hypothesis = String(input.hypothesis ?? '').trim()
  if (!title) throw new ServiceError(400, '缺少标题')
  if (!hypothesis) throw new ServiceError(400, '缺少改进假设')
  const rawVariants = Array.isArray(input.variants) ? input.variants : []
  if (rawVariants.length === 0) throw new ServiceError(400, '至少需要一个候选修改')
  if (rawVariants.length > MAX_VARIANTS) throw new ServiceError(400, `候选数上限 ${MAX_VARIANTS}`)

  let targetPath: string | null = null
  let base: Proposal['base'] = null
  if (input.targetPath) {
    if (def.applyMode === 'managed') {
      const resolved = resolveManagedTarget(input.surfaceKey, input.targetPath, hermesHome())
      if (!resolved.ok || !resolved.rel || !resolved.abs) throw new ServiceError(400, resolved.error ?? '目标路径不可用')
      targetPath = resolved.rel
      const content = readFileSafe(resolved.abs)
      if (content == null) throw new ServiceError(400, '目标文件不可读')
      base = { content, digest: sha256(content), revision: null, exists: true }
    } else {
      // 建议面：targetPath 仅作锚点；若在 HERMES_HOME 内则尽力读基线用于 diff。
      targetPath = String(input.targetPath).trim() || null
      const content = readHomeFileSafe(targetPath)
      if (content != null) base = { content, digest: sha256(content), revision: null, exists: true }
    }
  }

  const budgetCapUsd = Number(input.budgetCapUsd)
  const variants: Variant[] = rawVariants.map((v, i) => {
    const isTree = Array.isArray(v.files) && v.files.length > 0
    const content = isTree ? '' : String(v.content ?? '')
    if (!isTree && !content.trim()) throw new ServiceError(400, `候选 ${i + 1} 内容为空`)
    const label = String(v.label ?? `候选 ${i + 1}`).slice(0, 80)
    const pathMarkers = findGraderMarkersInPath(label)
    if (pathMarkers.length > 0) {
      throw new ServiceError(400, `候选 ${i + 1} 标签含评测判词标记，不能写入 harness`, { markers: pathMarkers })
    }
    if (isTree) {
      const files = (v.files ?? []).map((f) => {
        const path = String(f.path ?? '').trim()
        if (!path) throw new ServiceError(400, `候选 ${i + 1} 文件路径为空`)
        const markers = findGraderMarkers(f.content ?? '')
        if (markers.length > 0) {
          throw new ServiceError(400, `候选 ${i + 1} 文件 ${path} 含评测判词标记，不能写入 harness`, { markers })
        }
        const pMarkers = findGraderMarkersInPath(path)
        if (pMarkers.length > 0) {
          throw new ServiceError(400, `候选 ${i + 1} 文件路径 ${path} 含评测判词标记`, { markers: pMarkers })
        }
        return { path, content: String(f.content ?? ''), digest: sha256(String(f.content ?? '')) }
      })
      const deletions = Array.isArray(v.deletions) ? v.deletions.map(String) : []
      const digest = treeDigest(files, deletions)
      const tree: Record<string, string> = Object.fromEntries(files.map((f) => [f.path, f.content]))
      const validation = validateTree(tree)
      if (!validation.ok) {
        throw new ServiceError(400, `候选 ${i + 1} 树校验失败`, validation.issues)
      }
      const baseFiles = base ? [{ path: targetPath ?? 'base', content: base.content }] : []
      return {
        id: `v${i + 1}`,
        label,
        content: files.map((f) => f.content).join('\n\n'),
        digest,
        diffSummary: base ? diffSummaryTree(baseFiles, files, deletions) : diffSummaryTree([], files, deletions),
        files,
        deletions,
      }
    }
    const markers = findGraderMarkers(content)
    if (markers.length > 0) {
      throw new ServiceError(400, `候选 ${i + 1} 含评测判词标记，不能写入 harness`, { markers })
    }
    return {
      id: `v${i + 1}`,
      label,
      content,
      digest: sha256(content),
      diffSummary: base ? diffSummary(base.content, content) : diffSummary('', content),
    }
  })

  return mutateStore((store) => {
    const id = nextId(store, 'hw')
    const now = nowIso()
    const proposal: Proposal = {
      id,
      title,
      hypothesis,
      surfaceKey: input.surfaceKey,
      targetPath,
      treeRoot: input.treeRoot ? String(input.treeRoot).trim() || null : null,
      profile: input.profile?.trim() || profileFromTarget(targetPath),
      risk: def.risk,
      mode: input.mode === 'sequential' ? 'sequential' : 'parallel',
      domain: String(input.domain ?? 'general').trim().slice(0, 80) || 'general',
      status: 'draft',
      budgetCapUsd: Number.isFinite(budgetCapUsd) && budgetCapUsd >= 0 ? budgetCapUsd : DEFAULT_BUDGET_CAP_USD,
      evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs.map(String).filter(Boolean).slice(0, 20) : [],
      experienceIds: Array.isArray(input.experienceIds) ? input.experienceIds.map(String).filter(Boolean).slice(0, 20) : [],
      baselineRunId: null,
      baseline: null,
      base,
      variants,
      probes: [],
      approval: null,
      composition: null,
      promotion: null,
      rollback: null,
      createdBy: input.createdBy || 'operator',
      createdAt: now,
      updatedAt: now,
    }
    store.proposals.push(proposal)
    return view(store, proposal)
  })
}

function readFileSafe(abs: string): string | null {
  try {
    return readFileSync(abs, 'utf8')
  } catch {
    return null
  }
}

function readHomeFileSafe(rel: string | null): string | null {
  if (!rel || rel.startsWith('/') || rel.split('/').includes('..')) return null
  return readFileSafe(`${hermesHome()}/${rel}`)
}

/** 从 targetPath（profiles/<name>/...）推导探测运行的基准档案；推不出返回 null。 */
export function profileFromTarget(targetPath: string | null): string | null {
  if (!targetPath) return null
  const m = targetPath.match(/^profiles\/([^/]+)\//)
  return m ? m[1] : null
}

export async function attachBaseline(id: string, evalRunId: string): Promise<ProposalView> {
  const metrics = readEvalEvidence(evalRunId)
  if (!metrics) throw new ServiceError(400, `评测运行不存在或未聚合：${evalRunId}`)
  return mutateStore((store) => {
    const p = requireProposal(store, id)
    if (p.status !== 'draft' && p.status !== 'submitted') {
      throw new ServiceError(409, '只有草稿/已提交提案可以更换基线')
    }
    p.baselineRunId = metrics.evalRunId
    p.baseline = metrics
    p.updatedAt = nowIso()
    return view(store, p)
  })
}

/**
 * 噪声标定（RRSI S2）：用 ≥2 条「未改动基线」的同集真实运行算 passAt1 半极差 = δ。
 * δ 刻意不提供 env 调参（论文纪律：调低 δ 只会买到噪声分）。
 */
export async function calibrateNoise(id: string, runIds: string[]): Promise<ProposalView> {
  const ids = [...new Set((runIds ?? []).map(String).map((s) => s.trim()).filter(Boolean))]
  if (ids.length < 2) throw new ServiceError(400, '噪声标定至少需要 2 条同评测集的基线真实运行（重复跑未改动的 harness）')
  const metricsList = ids.map((rid) => {
    const m = readEvalEvidence(rid)
    if (!m) throw new ServiceError(400, `评测运行不存在或未聚合：${rid}`)
    if ((m.evidenceMode ?? 'explicit') !== 'explicit') {
      throw new ServiceError(400, `origin/mixed 是诊断证据，不可用于噪声标定：${rid}`)
    }
    return m
  })
  const setIds = new Set(metricsList.map((m) => m.setId))
  if (setIds.size > 1) {
    throw new ServiceError(400, `噪声标定的运行必须来自同一评测集（收到 ${[...setIds].join(', ')}）`)
  }
  const samples = metricsList.map((m) => m.passAt1)
  const valid = samples.filter((x): x is number => x != null)
  if (valid.length < 2) throw new ServiceError(400, '至少需要 2 条带 passAt1 读数的运行才能算离散度')
  const delta = (Math.max(...valid) - Math.min(...valid)) / 2
  return mutateStore((store) => {
    const p = requireProposal(store, id)
    if (!['draft', 'submitted', 'approved', 'probing'].includes(p.status)) {
      throw new ServiceError(409, `当前状态 ${p.status} 不可标定噪声（组合/晋级后重开提案再标）`)
    }
    if (p.baseline && p.baseline.setId !== metricsList[0].setId) {
      throw new ServiceError(400, `标定运行所属集 ${metricsList[0].setId} 与基线集 ${p.baseline.setId} 不一致`)
    }
    p.noise = {
      runIds: ids,
      setId: metricsList[0].setId,
      delta,
      method: 'half-range',
      samples,
      computedAt: nowIso(),
    }
    p.updatedAt = nowIso()
    return view(store, p)
  })
}

// ---------- AI 起草器（RRSI proposer 的受治理形态：只起草，不审批、不探测） ----------

/** 与探测同通道的 CLI 调用形态；测试注入假实现。 */
export type SuggestCli = (args: string[], prompt: string, timeoutMs: number) => Promise<{ ok: boolean; stdout: string; error?: string }>

function hermesCliBin(): string {
  return process.env.HERMES_PROBE_HERMES_BIN?.trim() || 'hermes'
}

const defaultSuggestCli: SuggestCli = (args, prompt, timeoutMs) =>
  new Promise((resolve) => {
    execFile(hermesCliBin(), [...args, prompt], { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error) resolve({ ok: false, stdout: String(stdout ?? ''), error: String(error.message ?? error).slice(0, 300) })
      else resolve({ ok: true, stdout: String(stdout ?? '') })
    })
  })

export interface SuggestProposalInput {
  surfaceKey: SurfaceKey
  targetPath?: string | null
  profile?: string | null
  domain?: string | null
  actor?: string
  /** 测试注入：不真起 CLI。 */
  cli?: SuggestCli
  timeoutMs?: number
}

interface SuggestDraft {
  title: string
  hypothesis: string
  /** 追加段形态（有目标文件时）：只起草一个待追加小节，服务端组装全文。 */
  section?: string
  /** 全文形态（无目标文件）：直接产出完整候选内容。 */
  content?: string
}

function extractJsonObject(text: string): SuggestDraft | null {
  const match = text.match(/\{[\s\S]*?\}/)
  if (!match) return null
  // 逐步扩展到平衡的花括号（起草器输出常带 markdown 围栏）
  let depth = 0
  let start = -1
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '{') {
      if (depth === 0) start = i
      depth += 1
    } else if (text[i] === '}') {
      depth -= 1
      if (depth === 0 && start >= 0) {
        try {
          const doc = JSON.parse(text.slice(start, i + 1)) as Partial<SuggestDraft>
          if (typeof doc.title === 'string' && typeof doc.hypothesis === 'string'
            && (typeof doc.content === 'string' || typeof doc.section === 'string')) {
            return {
              title: doc.title,
              hypothesis: doc.hypothesis,
              ...(typeof doc.section === 'string' ? { section: doc.section } : {}),
              ...(typeof doc.content === 'string' ? { content: doc.content } : {}),
            }
          }
          return null
        } catch {
          start = -1
        }
      }
    }
  }
  return null
}

/**
 * 按面起草一个 draft 提案（走既有 createProposal 全部校验）。
 * 提示词按 RRSI 论文 proposer 的证据面组装：基线内容＋进化状态＋已采纳经验＋失败假设清单。
 */
export async function suggestProposal(input: SuggestProposalInput): Promise<ProposalView> {
  const def = surfaceDef(input.surfaceKey)
  if (!def) throw new ServiceError(400, `未知可编辑面：${input.surfaceKey}`)
  const store = readStore()
  const mine = store.proposals.filter((p) => p.surfaceKey === input.surfaceKey)
  const cfg = rsiConfig()
  const round = surfaceRound(store.champions, input.surfaceKey)
  const editBudget = annealedEditBudget(round, cfg)
  const stalled = stallDetection(mine, cfg.stallWindow)
  const prune = pruneSignal(mine, cfg.pruneN)
  const failedHypotheses = mine
    .filter((p) => p.status === 'rejected' || p.status === 'rolled_back')
    .slice(-8)
    .map((p) => `- [${p.status}] ${p.hypothesis.slice(0, 160)}`)
  const adoptedExperiences = store.experiences
    .filter((e) => e.status === 'adopted' && (e.surfaceKey === null || e.surfaceKey === input.surfaceKey))
    .slice(0, 3)
    .map((e) => `- ${e.statement.slice(0, 200)}`)

  const baseContent = input.targetPath ? readHomeFileSafe(String(input.targetPath)) : null
  const sectionMode = baseContent != null
  let basePreview = '（未提供目标文件，按从零起草）'
  if (baseContent != null) {
    basePreview = baseContent.length > 6000 ? `${baseContent.slice(0, 6000)}\n…（截断）` : baseContent
  }

  const prompt = [
    '你是 Agent Harness 改进提案起草器。只输出一个 JSON 对象，不要任何解释或 markdown 围栏。',
    sectionMode
      ? 'JSON 字段：title（≤30 字）、hypothesis（一句话：改什么、预期改善什么）、section（一个待追加到目标文件末尾的 markdown 小节，≤2000 字，以「## 」标题开头）。'
      : 'JSON 字段：title（≤30 字）、hypothesis（一句话：改什么、预期改善什么）、content（完整的新文件全文）。',
    '',
    `可编辑面：${def.nameZh}（${input.surfaceKey}，${def.applyMode === 'managed' ? '可写盘' : '只建议'}，风险 ${def.risk}）`,
    input.targetPath ? `目标文件：${input.targetPath}` : '目标文件：无（自由起草）',
    '',
    '当前基线文件内容：',
    basePreview,
    '',
    `该面进化状态：已采纳 ${round} 轮（编辑预算 b_t=${editBudget}，本轮起草改动文件数必须 ≤ ${editBudget}）；${stalled ? '搜索停滞（连续提案无采纳，考虑换思路）；' : ''}${prune ? '近期探测无正增益，优先考虑做减法（删无贡献的机制）；' : ''}该面提案总数 ${mine.length}。`,
    adoptedExperiences.length ? `\n已采纳经验（可参考）：\n${adoptedExperiences.join('\n')}` : '',
    failedHypotheses.length ? `\n同面已失败假设（禁止换皮重提）：\n${failedHypotheses.join('\n')}` : '',
    '',
    '起草纪律：',
    '1. 通用改进——对一类任务普遍有效，禁止引用任何具体评测任务、题目内容或答案（泄漏批评者会拦）。',
    '2. 保持基线结构，最小必要改动；不要堆砌指令（成本规则会拦 token 增长过大的改动）。',
    '3. content 是替换目标文件的完整新全文，不是 diff。',
  ].filter(Boolean).join('\n')

  const cli = input.cli ?? defaultSuggestCli
  const profile = input.profile?.trim() || 'orchestrator'
  const res = await cli(
    ['-p', profile, '--cli', '--accept-hooks', 'chat', '-q'],
    prompt,
    input.timeoutMs ?? 180_000,
  )
  if (!res.ok) throw new ServiceError(502, `起草器执行失败：${res.error ?? 'unknown'}`)
  const draft = extractJsonObject(res.stdout)
  if (!draft) {
    throw new ServiceError(502, `起草器输出未包含合法 JSON（title/hypothesis/${sectionMode ? 'section' : 'content'}），输出前 200 字：${res.stdout.slice(0, 200)}`)
  }
  if (sectionMode && draft.section == null) {
    throw new ServiceError(502, `起草器输出缺少 section（追加段形态），输出前 200 字：${res.stdout.slice(0, 200)}`)
  }
  if (!sectionMode && draft.content == null) {
    throw new ServiceError(502, `起草器输出缺少 content（全文形态），输出前 200 字：${res.stdout.slice(0, 200)}`)
  }
  // 追加段形态：候选全文 = 基线原样 + 小节（最小改动纪律；不重写基线）
  const assembled = sectionMode
    ? `${baseContent as string}\n\n${(draft.section as string).trim()}\n`
    : (draft.content as string)
  return createProposal({
    title: draft.title.slice(0, 80),
    hypothesis: draft.hypothesis.slice(0, 500),
    surfaceKey: input.surfaceKey,
    targetPath: input.targetPath ?? null,
    mode: 'sequential',
    domain: input.domain ?? 'general',
    budgetCapUsd: DEFAULT_BUDGET_CAP_USD,
    evidenceRefs: [`draft:rrsi-suggester:${input.actor ?? 'operator'}`],
    variants: [{ label: 'AI 起草 A', content: assembled }],
    profile: input.profile ?? null,
    createdBy: input.actor?.trim() || 'rrsi-suggester',
  })
}

/** 删除纯占位提案：仅 draft 且无探测、无裁决（有任何审计线索不可删）。 */
export async function deleteProposal(id: string): Promise<{ id: string }> {
  return mutateStore((store) => {
    const p = requireProposal(store, id)
    if (p.status !== 'draft') throw new ServiceError(409, `当前状态 ${p.status} 不可删除（仅纯草稿占位可删）`)
    if (p.probes.length > 0) throw new ServiceError(409, '已有探测记录，不可删除（审计线索）')
    if (p.approval) throw new ServiceError(409, '已有裁决记录，不可删除（审计线索）')
    store.proposals = store.proposals.filter((x) => x.id !== id)
    return { id }
  })
}

export async function submitProposal(id: string): Promise<ProposalView> {
  return mutateStore((store) => {
    const p = requireProposal(store, id)
    if (p.status !== 'draft') throw new ServiceError(409, `当前状态 ${p.status} 不可提交`)
    const blockers = submitReadiness(p)
    // RRSI 提案端双闸（评测前拦，省探测预算）：退火编辑预算 + 泄漏批评者（按基线集）
    const reg = regularizationOf(store, p)
    if (reg.editBudgetExceeded && reg.maxEditCount != null) {
      blockers.push({
        code: 'edit_budget_exceeded',
        message: `第 ${reg.round} 轮编辑预算 ${reg.editBudget} 个文件（余弦退火），候选最大捆绑 ${reg.maxEditCount} 个——拆成多轮单变量提案`,
      })
    }
    blockers.push(...leakageForProposal(p))
    if (blockers.length > 0) throw new ServiceError(400, '提案条件不满足', blockers)
    p.status = 'submitted'
    p.updatedAt = nowIso()
    return view(store, p)
  })
}

export async function decideProposal(
  id: string,
  decision: 'approve' | 'reject',
  actor: string,
  note: string,
): Promise<ProposalView> {
  const who = String(actor ?? '').trim()
  if (!who) throw new ServiceError(400, '批准/驳回必须记录操作人')
  return mutateStore((store) => {
    const p = requireProposal(store, id)
    if (p.status !== 'submitted') throw new ServiceError(409, `当前状态 ${p.status} 不可裁决`)
    const digest = variantSetDigest(p.variants)
    p.approval = {
      decision: decision === 'approve' ? 'approved' : 'rejected',
      actor: who,
      note: String(note ?? '').slice(0, 500),
      variantSetDigest: digest,
      at: nowIso(),
    }
    p.status = decision === 'approve' ? 'approved' : 'rejected'
    p.updatedAt = nowIso()
    if (decision === 'approve') {
      try {
        const entry = appendApprovalLog({
          id: `harness:${p.id}:${Date.now()}`,
          actor: who,
          targetKind: 'harness',
          targetId: p.id,
          targetTitle: p.title,
          decision: 'approve',
          note: `Harness² 提案批准（候选摘要 ${digest.slice(0, 12)}）${note ? `：${note}` : ''}`,
          risk: p.risk === 'high' ? 'high' : p.risk === 'medium' ? 'medium' : 'low',
        })
        p.approval.approvalLogId = entry?.id
      } catch { /* 审批日志失败不阻断本地裁决，但不会伪造 approvalLogId */ }
    }
    return view(store, p)
  })
}

export async function createProbes(
  id: string,
  opts: { variantIds?: string[]; estimatedCostPerProbeUsd?: number } = {},
): Promise<ProposalView> {
  const estimate = Number(opts.estimatedCostPerProbeUsd)
  return mutateStore((store) => {
    const p = requireProposal(store, id)
    if (p.status !== 'approved' && p.status !== 'probing') {
      throw new ServiceError(409, `当前状态 ${p.status} 不可建探测（须先批准）`)
    }
    const wanted = Array.isArray(opts.variantIds) && opts.variantIds.length > 0
      ? p.variants.filter((v) => opts.variantIds?.includes(v.id))
      : p.variants
    if (wanted.length === 0) throw new ServiceError(400, '没有匹配的候选')
    const existing = new Set(p.probes.map((x) => x.variantId))
    const todo = wanted.filter((v) => !existing.has(v.id))
    if (todo.length === 0) throw new ServiceError(409, '这些候选已经建过探测')
    if (Number.isFinite(estimate) && estimate > 0 && estimate * p.variants.length > p.budgetCapUsd) {
      throw new ServiceError(400, `预算不足：预计 $${(estimate * p.variants.length).toFixed(2)} > 上限 $${p.budgetCapUsd.toFixed(2)}`)
    }
    const now = nowIso()
    for (const v of todo) {
      p.probes.push({
        id: `pr-${p.id.slice(3)}-${v.id}`,
        variantId: v.id,
        status: 'planned',
        createdAt: now,
      })
    }
    p.status = 'probing'
    p.updatedAt = now
    return view(store, p)
  })
}

export interface RecordProbeInput {
  evalRunId: string
  regressionRunId?: string | null
  note?: string
  actor?: string
}

export async function recordProbe(id: string, probeId: string, input: RecordProbeInput): Promise<ProposalView> {
  const metrics = readEvalEvidence(input.evalRunId)
  if (!metrics) throw new ServiceError(400, `评测运行不存在或未聚合：${input.evalRunId}`)
  if ((metrics.evidenceMode ?? 'explicit') !== 'explicit') {
    throw new ServiceError(400, 'origin/mixed 是诊断证据，不能作为候选探测；请绑定 fresh explicit 评测运行')
  }
  let regression = null
  if (input.regressionRunId) {
    regression = readRegressionEvidence(input.regressionRunId)
    if (!regression) throw new ServiceError(400, `回归运行不存在：${input.regressionRunId}`)
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
    const withRegression: ProbeMetrics = regression ? attachRegression(metrics, regression) : metrics
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

export async function composeProposal(
  id: string,
  opts: { variantId?: string; mergedContent?: string; rationale: string; actor?: string },
): Promise<ProposalView> {
  const rationale = String(opts.rationale ?? '').trim()
  if (!rationale) throw new ServiceError(400, '组合必须写明理由')
  return mutateStore((store) => {
    const p = requireProposal(store, id)
    if (p.status !== 'probing' && p.status !== 'composed') throw new ServiceError(409, `当前状态 ${p.status} 不可组合`)
    const missing = p.variants.filter((v) => !p.probes.some((x) => x.variantId === v.id && x.status === 'recorded'))
    if (missing.length > 0) throw new ServiceError(409, `${missing.length} 个候选尚未记录探测，不能组合`)
    if (opts.variantId) {
      const v = p.variants.find((x) => x.id === opts.variantId)
      if (!v) throw new ServiceError(404, `候选不存在：${opts.variantId}`)
      p.composition = {
        variantId: v.id,
        digest: v.digest,
        rationale,
        actor: String(opts.actor ?? 'operator'),
        at: nowIso(),
      }
    } else if (opts.mergedContent != null) {
      const digest = sha256(String(opts.mergedContent))
      const matched = p.variants.find((v) => v.digest === digest)
      if (!matched) throw new ServiceError(400, '合并内容没有对应的候选探测证据（摘要不匹配任何已探测候选）')
      p.composition = {
        variantId: matched.id,
        digest,
        rationale,
        actor: String(opts.actor ?? 'operator'),
        at: nowIso(),
      }
    } else {
      throw new ServiceError(400, '必须选择 variantId 或提供 mergedContent')
    }
    p.status = 'composed'
    p.updatedAt = nowIso()
    return view(store, p)
  })
}

export interface ReflectionInput {
  cue?: string
  lesson?: string
  evidence?: string
  confidence?: 'low' | 'medium' | 'high'
}

export async function promoteProposal(
  id: string,
  opts: { actor?: string; apply?: boolean; reflection?: ReflectionInput } = {},
): Promise<{ proposal: ProposalView; gate: PromotionGateReport; applied: boolean; experience?: Experience }> {
  const store = readStore()
  const p0 = store.proposals.find((x) => x.id === id)
  if (!p0) throw new ServiceError(404, `提案不存在：${id}`)
  const champion = currentChampionOf(store.champions, p0.surfaceKey, p0.id)
  let targetDigestNow: string | null | undefined
  let targetExists: boolean | undefined
  if (opts.apply) {
    const resolved = p0.targetPath ? resolveManagedTarget(p0.surfaceKey, p0.targetPath, hermesHome()) : null
    if (resolved) {
      targetExists = resolved.ok
      targetDigestNow = resolved.ok && resolved.abs ? fileDigest(resolved.abs) : null
    }
  }
  const gate = evaluatePromotion({
    proposal: p0,
    currentChampion: champion,
    applyRequested: opts.apply === true,
    applyEnvEnabled: applyEnabled(),
    targetDigestNow,
    targetExists,
    regularization: regularizationOf(store, p0),
    leakage: leakageForProposal(p0),
  })
  if (!gate.ok) throw new ServiceError(409, '晋级门禁未通过', gate.blockers)

  let applied = false
  let backupPath: string | undefined
  if (opts.apply) {
    const res = applyProposalFile(p0)
    if (!res.ok) throw new ServiceError(409, `写盘失败：${res.error}`, [{ code: 'apply_failed', message: res.error ?? '写盘失败' }])
    applied = true
    backupPath = res.backupPath
  }
  const selected = composedVariant(p0)
  if (!selected) throw new ServiceError(409, '组合内容缺失')

  return mutateStore((store2) => {
    const p = requireProposal(store2, id)
    const now = nowIso()
    const previous = currentChampionOf(store2.champions, p.surfaceKey, p.id)
    const champ: Champion = {
      id: nextId(store2, 'ch'),
      surfaceKey: p.surfaceKey,
      proposalId: p.id,
      variantId: selected.id,
      digest: selected.digest,
      label: selected.label,
      previousDigest: previous?.digest ?? p.base?.digest ?? null,
      previousProposalId: previous?.proposalId ?? null,
      targetPath: p.targetPath,
      applied,
      promotedAt: now,
      promotedBy: String(opts.actor ?? 'operator'),
    }
    store2.champions.push(champ)
    p.promotion = {
      actor: String(opts.actor ?? 'operator'),
      at: now,
      digest: selected.digest,
      applied,
      targetPath: p.targetPath ?? undefined,
      backupPath,
    }
    p.status = 'promoted'
    p.updatedAt = now

    // HarnessPro 轮 HP-7 保鲜（2026-10-23）：采纳=对引用经验的一次再验证（腾讯文
    // 误区三「三个月前的决策被当成今天的真理」——再验证刷新保鲜时钟）。
    for (const exp of store2.experiences) {
      if (p.experienceIds.includes(exp.id)) {
        exp.lastValidatedAt = now
        exp.updatedAt = now
      }
    }

    // 源文 selection.reflect_adoption/_distil：采纳后沉淀 cue/lesson/evidence/confidence，
    // 并把被采纳的 harness 整份存进域内经验库（不是只存一句摘要）。
    let experience: Experience | undefined
    const reflection = opts.reflection
    if (reflection && reflection.cue?.trim() && reflection.lesson?.trim() && reflection.evidence?.trim()) {
      const probe = p.probes.find((x) => x.variantId === selected.id && x.status === 'recorded')
      const refs = [p.id, ...(p.baselineRunId ? [`run:${p.baselineRunId}`] : []), ...(probe?.evalRunId ? [`run:${probe.evalRunId}`] : [])]
      experience = {
        id: nextId(store2, 'exp'),
        surfaceKey: p.surfaceKey,
        domain: p.domain,
        statement: reflection.lesson.trim().slice(0, 1000),
        cue: reflection.cue.trim().slice(0, 400),
        lesson: reflection.lesson.trim().slice(0, 1000),
        evidenceText: reflection.evidence.trim().slice(0, 1000),
        evidenceRefs: refs,
        confidence: reflection.confidence === 'high' || reflection.confidence === 'low' ? reflection.confidence : 'medium',
        status: 'adopted',
        sourceProposalId: p.id,
        snapshot: { variantId: selected.id, digest: selected.digest, targetPath: p.targetPath, content: variantContent(selected) },
        createdAt: now,
        updatedAt: now,
        lastValidatedAt: now,
      }
      store2.experiences.push(experience)
    }
    return { proposal: view(store2, p), gate, applied, ...(experience ? { experience } : {}) }
  })
}

export async function rollbackProposal(
  id: string,
  opts: { actor?: string; reason: string },
): Promise<ProposalView> {
  const reason = String(opts.reason ?? '').trim()
  if (!reason) throw new ServiceError(400, '回滚必须写明原因')
  const store0 = readStore()
  const p0 = store0.proposals.find((x) => x.id === id)
  if (!p0) throw new ServiceError(404, `提案不存在：${id}`)
  if (p0.status !== 'promoted') throw new ServiceError(409, `当前状态 ${p0.status} 不可回滚`)
  const fileRes = rollbackProposalFile(p0)
  if (!fileRes.ok) throw new ServiceError(409, `回滚失败：${fileRes.error}`, [{ code: 'rollback_failed', message: fileRes.error ?? '回滚失败' }])
  return mutateStore((store) => {
    const p = requireProposal(store, id)
    // 回滚=撤销本次冠军：直接移除该 champion 记录，让 currentChampionOf 自动落回上一条未回滚记录。
    store.champions = store.champions.filter((c) => !(c.proposalId === p.id && !c.rolledBack))
    p.rollback = {
      actor: String(opts.actor ?? 'operator'),
      at: nowIso(),
      reason,
      restoredDigest: fileRes.digest ?? p.base?.digest ?? null,
      fileRestored: p.promotion?.applied === true,
    }
    // 源文「没有收益就重新删除」：回滚时把该提案沉淀的经验一并退役，避免下一次还按旧教训提议。
    for (const exp of store.experiences) {
      if (exp.sourceProposalId === p.id && exp.status === 'adopted') {
        exp.status = 'retired'
        exp.updatedAt = nowIso()
      }
    }
    // HP-7：回滚撤销该次再验证——只清除由本次晋级写入的时间戳（精确匹配，不误伤后续验证）。
    const promotedAt = p.promotion?.at
    if (promotedAt) {
      for (const exp of store.experiences) {
        if (p.experienceIds.includes(exp.id) && exp.lastValidatedAt === promotedAt) {
          delete exp.lastValidatedAt
          exp.updatedAt = nowIso()
        }
      }
    }
    p.status = 'rolled_back'
    p.updatedAt = nowIso()
    return view(store, p)
  })
}


// ---------- 一键自动探测（spec §13：批准后自动发起，不自动提出候选） ----------

/** 在途自动探测（同提案并发二次发起 409；服务重启后 running 态失联，需重新发起）。 */
const runningProbes = new Set<string>()

export interface AutoProbeOptions {
  setId: string
  regressionSetId?: string
  maxTasks?: number
  estimatedCostPerTaskUsd?: number
  actor?: string
  /** 测试注入：不真起 agent。 */
  spawnRun?: SpawnRun
  /** 测试注入：判分通道（生产缺省走本地 clef 裁判）。 */
  judgeAsk?: AskFn
}

export interface AutoProbeJob {
  proposalId: string
  status: 'running' | 'done' | 'failed'
  variantsTotal: number
  variantsDone: number
  costUsd: number
  estimatedTasks: number
  error?: string
}

function probeOutcomeContext(): OutcomeRunContext {
  const roots = process.env.EVAL_OUTCOME_ALLOWED_ROOTS?.split(',').map((s) => s.trim()).filter(Boolean)
  const baseUrl = process.env.EVAL_KANBAN_BASE_URL?.trim()
  const token = process.env.EVAL_KANBAN_TOKEN?.trim()
  const board = process.env.EVAL_KANBAN_BOARD?.trim()
  return {
    runStartedAt: Date.now(),
    ...(roots && roots.length ? { allowedRoots: roots } : {}),
    ...(baseUrl ? { kanban: { baseUrl, ...(token ? { token } : {}), ...(board ? { board } : {}) } } : {}),
  }
}

/** 发起自动探测：预检同步完成（状态/预算/可执行件闸），任务异步跑。 */
export async function startAutoProbe(id: string, opts: AutoProbeOptions): Promise<AutoProbeJob> {
  if (runningProbes.has(id)) throw new ServiceError(409, '该提案已有在途自动探测')
  const store = readStore()
  const p = store.proposals.find((x) => x.id === id)
  if (!p) throw new ServiceError(404, `提案不存在：${id}`)
  if (p.status !== 'approved' && p.status !== 'probing') {
    throw new ServiceError(409, `当前状态 ${p.status} 不可自动探测（须先人工批准）`)
  }
  const set = getSet(String(opts.setId ?? ''))
  if (!set) throw new ServiceError(400, `评测集不存在：${opts.setId}`)
  let regressionSet = null
  if (opts.regressionSetId) {
    regressionSet = getSet(opts.regressionSetId)
    if (!regressionSet) throw new ServiceError(400, `回归集不存在：${opts.regressionSetId}`)
  }
  const maxTasks = Math.max(1, Math.min(50, opts.maxTasks ?? 5))
  const estimate = opts.estimatedCostPerTaskUsd ?? DEFAULT_TASK_COST_ESTIMATE_USD
  const pendingVariants = p.variants.filter((v) => !p.probes.some((x) => x.variantId === v.id && x.status === 'recorded'))
  if (pendingVariants.length === 0) throw new ServiceError(409, '全部候选都已记录探测')

  // 可执行件闸：先把不能跑的挑出来如实拒绝（不静默跳过）
  const blocked: Array<{ variantId: string; problems: string[] }> = []
  for (const v of pendingVariants) {
    const r = assertTreeRunnable(v)
    if (!r.ok) blocked.push({ variantId: v.id, problems: r.problems })
  }
  if (blocked.length > 0) {
    throw new ServiceError(400, `候选含可执行件，自动探测禁跑：${blocked.map((b) => `${b.variantId}（${b.problems[0]}）`).join('；')}`, blocked)
  }

  // 预算预估闸：预估 > 剩余额度即拒（实际花费在跑中逐题硬停）
  const spent = probeCost(p).total
  const remaining = p.budgetCapUsd - spent
  const worst = pendingVariants.length * maxTasks * estimate * (regressionSet ? 2 : 1)
  if (remaining <= 0 || worst > remaining) {
    throw new ServiceError(400, `预算不足：剩余 $${remaining.toFixed(2)}，预估最高 $${worst.toFixed(2)}（${pendingVariants.length} 候选 × ${maxTasks} 题 × $${estimate}${regressionSet ? ' × 2（含回归）' : ''}）`)
  }

  // 为未建探测的候选先建探测（置 planned）
  await mutateStore((st) => {
    const pp = requireProposal(st, id)
    const now = nowIso()
    for (const v of pendingVariants) {
      if (!pp.probes.some((x) => x.variantId === v.id)) {
        pp.probes.push({ id: `pr-${pp.id.slice(3)}-${v.id}`, variantId: v.id, status: 'planned', createdAt: now })
      }
    }
    pp.status = 'probing'
    pp.updatedAt = now
  })

  const job: AutoProbeJob = {
    proposalId: id,
    status: 'running',
    variantsTotal: pendingVariants.length,
    variantsDone: 0,
    costUsd: 0,
    estimatedTasks: 0,
  }
  runningProbes.add(id)
  void runAutoProbeJob(id, pendingVariants.map((v) => v.id), opts, { setId: set.id, regressionSetId: regressionSet?.id }, { maxTasks, estimate }, job)
    .catch((e) => { job.status = 'failed'; job.error = e instanceof Error ? e.message : String(e) })
    .finally(() => { runningProbes.delete(id) })
  return job
}

async function runAutoProbeJob(
  id: string,
  variantIds: string[],
  opts: AutoProbeOptions,
  sets: { setId: string; regressionSetId?: string },
  limits: { maxTasks: number; estimate: number },
  job: AutoProbeJob,
): Promise<void> {
  for (const variantId of variantIds) {
    const store = readStore()
    const p = store.proposals.find((x) => x.id === id)
    if (!p) throw new ServiceError(404, `提案不存在：${id}`)
    const variant = p.variants.find((v) => v.id === variantId)
    const probe = p.probes.find((x) => x.variantId === variantId)
    if (!variant || !probe) continue
    const tree = treeOfVariant(variant, p.targetPath)
    const profile = p.profile ?? profileFromTarget(p.targetPath) ?? 'orchestrator'
    const evalSet = getSet(sets.setId)
    if (!evalSet) throw new ServiceError(400, `评测集不存在：${sets.setId}`)
    const tasks = evalSet.tasks.slice(0, limits.maxTasks).map((t) => ({ taskId: t.id, prompt: t.problem }))
    const spent = probeCost(p).total + job.costUsd
    const remaining = p.budgetCapUsd - spent

    await mutateStore((st) => {
      const pp = requireProposal(st, id)
      const pr = pp.probes.find((x) => x.variantId === variantId)
      if (pr) {
        pr.autoRun = {
          status: 'running', setId: evalSet.id, tasksTotal: tasks.length, tasksDone: 0,
          costUsd: 0, estimatedTasks: 0, startedAt: nowIso(),
        }
        pp.updatedAt = nowIso()
      }
    })

    const result = await runProbeTasks({
      prompts: tasks,
      baseHome: hermesHome(),
      profile,
      variantTree: tree,
      budgetRemainingUsd: Math.max(0, remaining),
      estimatePerTaskUsd: limits.estimate,
      spawnRun: opts.spawnRun,
      onProgress: (done, costUsd, estimatedTasks) => {
        job.costUsd = costUsd
        job.estimatedTasks = estimatedTasks
        void mutateStore((st) => {
          const pp = requireProposal(st, id)
          const pr = pp.probes.find((x) => x.variantId === variantId)
          if (pr?.autoRun) {
            pr.autoRun.tasksDone = done
            pr.autoRun.costUsd = costUsd
            pr.autoRun.estimatedTasks = estimatedTasks
          }
        })
      },
    })

    if (!result.ok) {
      await mutateStore((st) => {
        const pp = requireProposal(st, id)
        const pr = pp.probes.find((x) => x.variantId === variantId)
        if (pr) {
          pr.status = 'failed'
          if (pr.autoRun) { pr.autoRun.status = 'failed'; pr.autoRun.error = result.error; pr.autoRun.finishedAt = nowIso() }
          pr.note = result.error ?? '自动探测失败'
        }
        pp.updatedAt = nowIso()
      })
      job.variantsDone += 1
      continue
    }

    if (Object.keys(result.samples).length === 0) {
      await mutateStore((st) => {
        const pp = requireProposal(st, id)
        const pr = pp.probes.find((x) => x.variantId === variantId)
        if (pr) {
          pr.status = 'failed'
          if (pr.autoRun) { pr.autoRun.status = 'stopped'; pr.autoRun.reason = 'budget_stop'; pr.autoRun.finishedAt = nowIso() }
          pr.note = '预算在第一题前已耗尽，未产生样本'
        }
        pp.updatedAt = nowIso()
      })
      job.variantsDone += 1
      break
    }

    const replay = await runReplayEval(
      {
        setId: evalSet.id,
        samples: result.samples,
        target: { profile, harnessRef: `${id}:${variantId}` },
        actor: 'workbench-auto',
        note: `一键自动探测 ${id}/${variantId}${result.stoppedBy ? `（${result.stoppedBy}：${result.tasksDone}/${tasks.length} 题）` : ''}`,
      },
      { judge: { config: loadEvalConfig(), ...(opts.judgeAsk ? { ask: opts.judgeAsk } : {}) }, outcomeCtx: probeOutcomeContext() },
    )
    if (!replay.ok) {
      const problems = (replay as { ok: false; problems: string[] }).problems
      await mutateStore((st) => {
        const pp = requireProposal(st, id)
        const pr = pp.probes.find((x) => x.variantId === variantId)
        if (pr) {
          pr.status = 'failed'
          if (pr.autoRun) { pr.autoRun.status = 'failed'; pr.autoRun.error = problems.join('；'); pr.autoRun.finishedAt = nowIso() }
          pr.note = `判分失败：${problems.join('；')}`
        }
        pp.updatedAt = nowIso()
      })
      job.variantsDone += 1
      continue
    }

    let regressionRunId: string | undefined
    if (sets.regressionSetId) {
      const regSet = getSet(sets.regressionSetId)
      if (regSet) {
        const regTasks = regSet.tasks.map((t) => ({ taskId: t.id, prompt: t.problem }))
        const regRemaining = p.budgetCapUsd - (probeCost(p).total + job.costUsd)
        const regResult = await runProbeTasks({
          prompts: regTasks,
          baseHome: hermesHome(),
          profile,
          variantTree: tree,
          budgetRemainingUsd: Math.max(0, regRemaining),
          estimatePerTaskUsd: limits.estimate,
          spawnRun: opts.spawnRun,
        })
        if (regResult.ok && Object.keys(regResult.samples).length > 0) {
          const regReplay = await runReplayEval(
            {
              setId: regSet.id,
              samples: regResult.samples,
              target: { profile, harnessRef: `${id}:${variantId}:regression` },
              actor: 'workbench-auto',
              note: `一键自动探测（回归）${id}/${variantId}`,
            },
            { judge: { config: loadEvalConfig(), ...(opts.judgeAsk ? { ask: opts.judgeAsk } : {}) }, outcomeCtx: probeOutcomeContext() },
          )
          if (regReplay.ok) regressionRunId = regReplay.run.id
        }
      }
    }

    await recordProbe(id, probe.id, {
      evalRunId: replay.run.id,
      regressionRunId: regressionRunId ?? null,
      note: `一键自动探测${result.stoppedBy ? `（${result.stoppedBy}）` : ''}`,
      actor: opts.actor ?? 'workbench-auto',
    })
    await mutateStore((st) => {
      const pp = requireProposal(st, id)
      const pr = pp.probes.find((x) => x.variantId === variantId)
      if (pr?.autoRun) {
        pr.autoRun.status = result.stoppedBy ? 'stopped' : 'done'
        pr.autoRun.reason = result.stoppedBy
        pr.autoRun.finishedAt = nowIso()
      }
    })
    job.variantsDone += 1
    if (result.stoppedBy === 'budget_stop') break
  }
  job.status = 'done'
}

/** 候选 → 隔离树（rel → content|null）；单文件候选映射为 targetPath 一个文件。 */
function treeOfVariant(variant: Variant, targetPath: string | null): Record<string, string | null> {
  const tree: Record<string, string | null> = {}
  if (variant.files && variant.files.length > 0) {
    for (const f of variant.files) tree[f.path] = f.content
    for (const d of variant.deletions ?? []) tree[d] = null
  } else if (targetPath && variant.content) {
    tree[targetPath] = variant.content
  }
  return tree
}

export function autoProbeRunning(id: string): boolean {
  return runningProbes.has(id)
}

// ---------- 经验库 ----------

export function listExperiences(): Experience[] {
  return readStore().experiences
}

export async function addExperience(input: {
  surfaceKey?: SurfaceKey | null
  domain?: string | null
  statement: string
  cue?: string
  lesson?: string
  evidenceText?: string
  evidenceRefs?: string[]
  confidence?: 'low' | 'medium' | 'high'
  actor?: string
}): Promise<Experience> {
  const statement = String(input.statement ?? '').trim()
  if (!statement) throw new ServiceError(400, '经验陈述不能为空')
  return mutateStore((store) => {
    const now = nowIso()
    const exp: Experience = {
      id: nextId(store, 'exp'),
      surfaceKey: input.surfaceKey ?? null,
      domain: String(input.domain ?? '').trim().slice(0, 80) || null,
      statement: statement.slice(0, 1000),
      cue: input.cue?.trim().slice(0, 400) || undefined,
      lesson: input.lesson?.trim().slice(0, 1000) || undefined,
      evidenceText: input.evidenceText?.trim().slice(0, 1000) || undefined,
      evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs.map(String).filter(Boolean).slice(0, 20) : [],
      confidence: input.confidence === 'high' || input.confidence === 'low' ? input.confidence : 'medium',
      status: 'candidate',
      createdAt: now,
      updatedAt: now,
    }
    store.experiences.push(exp)
    return exp
  })
}

export async function setExperienceStatus(id: string, status: ExperienceStatus): Promise<Experience> {
  if (!['candidate', 'adopted', 'retired'].includes(status)) throw new ServiceError(400, '非法经验状态')
  return mutateStore((store) => {
    const exp = store.experiences.find((e) => e.id === id)
    if (!exp) throw new ServiceError(404, `经验不存在：${id}`)
    exp.status = status
    exp.updatedAt = nowIso()
    return exp
  })
}

function candidateToExperience(store: { nextSeq: number }, c: ExpCandidate): Experience {
  const now = nowIso()
  const exp: Experience = {
    id: nextId(store, 'exp'),
    surfaceKey: null,
    domain: 'general',
    statement: c.statement,
    evidenceRefs: [c.id, ...c.evidence.map((e) => `task:${e.taskId}`)].slice(0, 20),
    confidence: c.evidence.length >= 2 ? 'medium' : 'low',
    status: 'candidate',
    sourceCandidateId: c.id,
    createdAt: now,
    updatedAt: now,
  }
  return exp
}

export async function importExperiences(): Promise<{ imported: number; skipped: number; experiences: Experience[] }> {
  const candidates = listCandidates().filter((c) => c.status === 'approved')
  return mutateStore((store) => {
    const known = new Set(store.experiences.map((e) => e.sourceCandidateId).filter(Boolean))
    const added: Experience[] = []
    for (const c of candidates) {
      if (known.has(c.id)) continue
      const exp = candidateToExperience(store, c)
      store.experiences.push(exp)
      added.push(exp)
    }
    return { imported: added.length, skipped: candidates.length - added.length, experiences: added }
  })
}
