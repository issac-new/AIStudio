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

import { ServiceError, nowIso, currentChampionOf, requireProposal, derive, emptyRegularization, regularizationOf, leakageForProposal, view, recordProbe, readFileSafe, readHomeFileSafe, profileFromTarget } from './service-shared'
import { runningProbes } from './service-auto-probe'
import type { ProposalDerived, ProposalView } from './service-shared'
export { ServiceError } from './service-shared'
export { recordProbe, profileFromTarget } from './service-shared'
export type { RecordProbeInput } from './service-shared'
export type { ProposalDerived, ProposalView } from './service-shared'
export * from './service-auto-probe'
export * from './service-experience'

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
  /** 垫脚石档案（D3）：被拒/回滚提案的最佳读数投影，供提案端复用。 */
  archive: ArchiveSteppingStone[]
  /** 记忆压缩/遗忘策略（D11）：stale 采纳再验证＋孤儿候选退役建议（纯派生）。 */
  memoryPolicy: import('./experience-freshness').MemoryConsolidationPolicy
  /** R11：上次进程退出时仍在 running 的自动探测（SQLite 后端才有；JSON 后端空表）。 */
  interruptedProbes: Array<{ proposalId: string; startedAt?: string }>
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
    evolution: (() => {
      const report = evolutionReport(surfaces.map((s) => s.key), store.proposals, store.champions)
      // R10（2026-10-31 三批）：任务族聚合增益（HCAST 范式）——族→平均增益＋背离警示。
      // family 标签来自 eval 集登记（EvalSet.family），探测证据带 setId 可溯源。
      const familyDeltas = new Map<string, number[]>()
      for (const p2 of store.proposals) {
        for (const probe of p2.probes) {
          if (probe.status !== 'recorded' || probe.contrast?.passAt1Delta == null) continue
          const set = getSet(probe.evidence?.setId ?? '')
          const fam = set?.family
          if (!fam) continue
          const arr = familyDeltas.get(fam) ?? []
          arr.push(probe.contrast.passAt1Delta)
          familyDeltas.set(fam, arr)
        }
      }
      const familyGains = [...familyDeltas.entries()].map(([family, deltas]) => ({
        family,
        avgDelta: Number((deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(4)),
        rounds: deltas.length,
      }))
      // 背离警示：面级平均增益>0 而某族平均<0 → 该面在该族退化（单任务特化信号）
      const warnings = [...report.healthWarnings]
      for (const s of report.surfaces) {
        const live = s.timeline.filter((r) => !r.rolledBack && r.passAt1Delta != null)
        if (live.length === 0) continue
        const surfaceAvg = live.reduce((a, r) => a + (r.passAt1Delta ?? 0), 0) / live.length
        for (const fg of familyGains) {
          if (fg.rounds >= 2 && surfaceAvg > 0 && fg.avgDelta < 0) {
            warnings.push({
              surfaceKey: s.surfaceKey,
              code: 'family_specialization' as const,
              detail: `面级平均增益 +${(surfaceAvg * 100).toFixed(1)}pp 但族「${fg.family}」平均 ${ (fg.avgDelta * 100).toFixed(1)}pp（${fg.rounds} 次探测）——增益可能来自单任务特化（R10）`,
            })
          }
        }
      }
      return { ...report, familyGains, healthWarnings: warnings }
    })(),
    archive: proposalArchive(store.proposals),
    memoryPolicy: memoryConsolidationPolicy(store.experiences),
    interruptedProbes: listOrphanAutoJobs()
      .filter((r) => !runningProbes.has(r.probeKey))
      .map((r) => ({ proposalId: r.probeKey, ...(typeof r.payload.startedAt === 'string' ? { startedAt: r.payload.startedAt } : {}) })),
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
  // D7（2026-10-31 P2 批）：全历史注入——冠军（含增益）/拒绝（含理由）/回滚（含理由）
  const history = proposerEvolutionHistory(store.proposals, store.champions, input.surfaceKey)
  // D10（2026-10-31 P2 批）：剪枝命中时给删除型提案模板（替代一句「优先做减法」）
  const deletion = deletionProposalTemplate(store.proposals, input.surfaceKey, cfg)
  // R8（2026-10-31 首批执行）：加权检索取代静态前 3——
  // score = confidenceScore（HP-7 半衰期现算）× 面域匹配（同面 1.0/跨面 0.5）× domain 匹配（同域 1.0/异域 0.7）
  const staleRefreshList: string[] = []
  const adoptedExperiences = store.experiences
    .filter((e) => e.status === 'adopted')
    .map((e) => {
      const fresh = experienceFreshness(e)
      const surfaceW = e.surfaceKey === input.surfaceKey ? 1.0 : e.surfaceKey === null ? 0.7 : 0.5
      const domainW = (e.domain ?? 'general') === (input.domain ?? 'general') ? 1.0 : 0.7
      const score = fresh.confidenceScore * surfaceW * domainW
      if (fresh.band === 'stale' && surfaceW >= 0.7) staleRefreshList.push(`- ${e.statement.slice(0, 160)}（上次验证 ${Math.round(fresh.ageDays)} 天前）`)
      return { e, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ e }) => `- ${e.statement.slice(0, 200)}`)

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
    `该面进化状态：已采纳 ${round} 轮（编辑预算 b_t=${editBudget}，本轮起草改动文件数必须 ≤ ${editBudget}）；${stalled ? '搜索停滞（连续提案无采纳，考虑换思路）；' : ''}该面提案总数 ${mine.length}。`,
    `\n【该面进化全史（D7）】${history.summary}\n${history.entries.length ? history.entries.map((e) => `- [${e.kind === 'adopted' ? '已采纳' : e.kind === 'rejected' ? '被拒' : '已回滚'}] ${e.proposalId}「${e.title}」：${e.detail}`).join('\n') : '（该面尚无历史提案——首提案属结构性探索，带内增益可豁免）'}\n纪律：被拒/回滚假设禁止换皮重提；低分祖先常是垫脚石，可显式改造其思路（注明来源 proposal id）。`,
    adoptedExperiences.length ? `\n已采纳经验（按置信×保鲜×面域加权取 top3）：\n${adoptedExperiences.join('\n')}` : '',
    staleRefreshList.length ? `\n【记忆整理（D11）】以下 stale 采纳经验建议在本提案中引用以刷新验证：\n${staleRefreshList.slice(0, 5).join('\n')}` : '',
    deletion.suggested ? `\n${deletion.scaffold}` : '',
    (!deletion.suggested && failedHypotheses.length) ? `\n同面已失败假设（禁止换皮重提）：\n${failedHypotheses.join('\n')}` : '',
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


export async function attachHeldout(
  id: string,
  input: { setId: string; answers: Array<{ index: number; answer: string }>; actor?: string },
): Promise<ProposalView> {
  const { scoreSet } = await import('../../heldout/held-out-store')
  const r = scoreSet(input.setId, input.answers, input.actor?.trim() || `workbench:${id}`)
  if (!r.ok) {
    const problems = (r as { ok: false; problems: string[] }).problems
    throw new ServiceError(400, problems.join('；'))
  }
  return mutateStore((store) => {
    const p = requireProposal(store, id)
    if (p.status === 'promoted' || p.status === 'rolled_back') {
      throw new ServiceError(409, `当前状态 ${p.status} 不可绑定留出读数`)
    }
    p.heldout = {
      runId: `${input.setId}@${Date.now()}`,
      n: r.result.n,
      passRate: r.result.passRate,
    }
    p.updatedAt = nowIso()
    return view(store, p)
  })
}

export interface RecordConstraintsInput {
  checks: Array<{
    id: string
    statement: string
    status: 'pass' | 'fail' | 'unknown'
    evidenceRef?: string
    detail?: string
  }>
  actor: string
  note?: string
}

/**
 * 记录约束保持断言（D5，2026-10-31 吸收轮）。
 * 约束是「不许退化」的人审断言，不是能力指标；记录 actor 与 evidenceRef 以便审计。
 */
export async function recordConstraints(id: string, input: RecordConstraintsInput): Promise<ProposalView> {
  const actor = String(input.actor ?? '').trim()
  if (!actor) throw new ServiceError(400, '记录约束检查必须写明操作人')
  const checks = Array.isArray(input.checks) ? input.checks : []
  if (checks.length === 0) throw new ServiceError(400, '至少需要一条约束检查')
  const seen = new Set<string>()
  const normalized: ConstraintCheck[] = checks.map((c) => {
    const cid = String(c?.id ?? '').trim()
    const statement = String(c?.statement ?? '').trim()
    if (!cid || !statement) throw new ServiceError(400, '约束检查缺少 id 或 statement')
    if (seen.has(cid)) throw new ServiceError(400, `约束检查 id 重复：${cid}`)
    seen.add(cid)
    if (c.status !== 'pass' && c.status !== 'fail' && c.status !== 'unknown') {
      throw new ServiceError(400, `约束检查 ${cid} 的 status 非法（只接受 pass/fail/unknown）`)
    }
    return {
      id: cid,
      statement,
      status: c.status,
      evidenceRef: c.evidenceRef ? String(c.evidenceRef).slice(0, 300) : undefined,
      detail: c.detail ? String(c.detail).slice(0, 500) : undefined,
    }
  })
  return mutateStore((store) => {
    const p = requireProposal(store, id)
    if (p.status === 'promoted' || p.status === 'rolled_back') {
      throw new ServiceError(409, `当前状态 ${p.status} 不可记录约束检查`)
    }
    p.constraints = {
      checks: normalized,
      actor,
      at: nowIso(),
      note: String(input.note ?? '').slice(0, 500),
    }
    p.updatedAt = nowIso()
    return view(store, p)
  })
}

/**
 * R5（2026-10-31 二批执行）：缺口驱动提案——读 RSI 内核 gap_register capability 条目，
 * 映射为 workbench draft（evidenceRefs 引 gap id）。只读桥；内核文件缺席返回空数组不猜。
 */
export async function createGapDrivenProposals(limit = 5): Promise<ProposalView[]> {
  const { readCapabilityGaps, gapToDraft } = await import('./gap-source')
  const gaps = readCapabilityGaps()
  if (gaps == null || gaps.length === 0) return []
  const created: ProposalView[] = []
  for (const gap of gaps.slice(0, limit)) {
    const draft = gapToDraft(gap)
    try {
      created.push(await createProposal({
        title: draft.title,
        hypothesis: draft.hypothesis,
        surfaceKey: draft.surfaceKey,
        targetPath: null,
        mode: 'sequential',
        domain: draft.domain,
        budgetCapUsd: DEFAULT_BUDGET_CAP_USD,
        evidenceRefs: draft.evidenceRefs,
        variants: [],
        createdBy: 'gap-bridge',
      }))
    } catch {
      // 单条失败（如面不可用）不阻断其余缺口
    }
  }
  return created
}

/**
 * R7（2026-10-31 三批执行）：advisory 面冠军的结构化建议产物导出。
 * memory 面＝经验条目清单 JSON（供既有记忆管理面人审导入）；tool_guidance 面＝
 * 工具描述覆盖片段（供 tool contract 面人审应用）。只导出不直写——advisory 面无写盘授权。
 */
export function surfaceArtifactsOf(id: string): { surfaceKey: SurfaceKey; kind: string; payload: string } | null {
  const store = readStore()
  const p2 = store.proposals.find((x) => x.id === id)
  if (!p2 || p2.status !== 'promoted') return null
  const selected = composedVariant(p2)
  if (!selected) return null
  if (p2.surfaceKey === 'memory') {
    // memory 面：候选内容按行拆条目（每行一条记忆建议）
    const lines = variantContent(selected).split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    return {
      surfaceKey: 'memory',
      kind: 'memory-items',
      payload: JSON.stringify({ source: id, items: lines.map((text, i) => ({ id: `mem-${id}-${i}`, text })) }, null, 2),
    }
  }
  if (p2.surfaceKey === 'tool_guidance') {
    return {
      surfaceKey: 'tool_guidance',
      kind: 'tool-guidance-override',
      payload: variantContent(selected),
    }
  }
  return null
}

/**
 * R7：标记某晋级的建议产物已由既有管理面应用（人审后调用）。
 * applied=false 的 advisory 面冠军从此有了可追踪的应用通道；回读验证＝
 * 下一轮提案基线即新产物生效态（面板提示用户新建验证提案）。
 */
export async function markSurfaceApplied(id: string, actor: string): Promise<ProposalView> {
  const who = String(actor ?? '').trim()
  if (!who) throw new ServiceError(400, '标记应用必须记录操作人')
  return mutateStore((store) => {
    const p2 = requireProposal(store, id)
    if (p2.status !== 'promoted') throw new ServiceError(409, `当前状态 ${p2.status} 不可标记应用`)
    if (!['memory', 'tool_guidance'].includes(p2.surfaceKey)) {
      throw new ServiceError(400, `面 ${p2.surfaceKey} 不在 R7 执行回路范围（memory/tool_guidance）`)
    }
    if (!p2.promotion) throw new ServiceError(409, '晋级记录缺失')
    p2.promotion.appliedVia = 'via-surface'
    p2.updatedAt = nowIso()
    return view(store, p2)
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

  const result = await mutateStore((store2) => {
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
      verificationTier: verificationTierOf(p),
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

  // PluginRSI 吸收轮（2026-11-03）：晋级即把选中变体作为**组件**入库（幂等，append-only）。
  // 入库失败不阻断晋级——库是复用资产，不是晋级前置条件（如实吞掉并在下次重试）。
  try {
    const probe = p0.probes.find((x) => x.variantId === selected.id && x.status === 'recorded')
    recordComponent(
      p0,
      selected,
      {
        proposalId: p0.id,
        variantId: selected.id,
        ...(probe?.evalRunId ? { evalRunId: probe.evalRunId } : {}),
        passAt1: probe?.evidence?.passAt1 ?? null,
        delta: probe?.contrast?.passAt1Delta ?? null,
        ...(verificationTierOf(p0) ? { verificationTier: verificationTierOf(p0) } : {}),
      },
      { actor: String(opts.actor ?? 'operator') },
    )
  } catch {
    /* 组件库写入失败不影响晋级结果（fail-soft） */
  }
  return result
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


// ── 调度面（Harmony 吸收轮）：策略读写与校验 ─────────────────────
export { DEFAULT_SCHEDULE_POLICY, SCHEDULE_REL }

/** 读当前调度策略（文件缺席返回缺省；坏档已隔离）。 */
export function schedulePolicy(): { policy: ReturnType<typeof readSchedulePolicy>; file: string } {
  return { policy: readSchedulePolicy(), file: SCHEDULE_REL }
}

/** 确保策略文件存在（bootstrap；返回是否新建）。 */
export function ensureSchedulePolicyFile(): { created: boolean; file: string } {
  return ensureScheduleFile()
}

export { validateSchedulePolicy, normalizeSchedulePolicy }

// ── 组件库（PluginRSI 吸收轮）：只读投影 ─────────────────────────
export function componentLibrary(): {
  summary: ReturnType<typeof librarySummary>
  list: (q?: Parameters<typeof listComponents>[0]) => ReturnType<typeof listComponents>
} {
  return { summary: librarySummary(), list: (q) => listComponents(q) }
}
