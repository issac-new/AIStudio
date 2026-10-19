// overlay/custom/server/harness/workbench/service.ts
// 改进实验台服务层：状态机 + 证据绑定 + 门禁 + 写盘/回滚。
// 所有对外的写操作都走 mutateStore 串行化；错误抛 ServiceError（带 HTTP 状态）。
import { readFileSync } from 'fs'
import { appendApprovalLog } from '../../approvals/approval-log'
import { listCandidates } from '../../expcandidates/exp-store'
import type { ExpCandidate } from '../../expcandidates/exp-types'
import { applyEnabled, applyProposalFile, fileDigest, rollbackProposalFile } from './apply'
import { attachRegression, readEvalEvidence, readRegressionEvidence } from './evidence'
import {
  DEFAULT_BUDGET_CAP_USD, MAX_VARIANTS, behaviorContrast, candidateDiversity, composedVariant,
  diffSummary, evaluatePromotion, findGraderMarkers, findGraderMarkersInPath, probeCost, sha256, submitReadiness, variantSetDigest,
} from './loop'
import { nextId, mutateStore, readStore } from './store'
import { collectSurfaces, hermesHome, resolveManagedTarget, surfaceDef } from './surface-registry'
import type {
  BehaviorContrast, Champion, EditableSurface, Experience, ExperienceStatus, Probe,
  ProbeMetrics, Proposal, ProposalStatus, PromotionGateReport, SurfaceKey, Variant,
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

function derive(proposal: Proposal, champion: Champion | null): ProposalDerived {
  const gate = evaluatePromotion({
    proposal,
    currentChampion: champion,
    applyRequested: false,
    applyEnvEnabled: applyEnabled(),
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
  }
}

function view(store: { champions: Champion[] }, proposal: Proposal): ProposalView {
  return { ...proposal, derived: derive(proposal, currentChampionOf(store.champions, proposal.surfaceKey)) }
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
  experiences: Experience[]
  meta: { note: string; source: string; boundary: string }
} {
  const store = readStore()
  const surfaces = collectSurfaces()
  const proposals = store.proposals.map((p) => view(store, p))
  const openStatuses: ProposalStatus[] = ['draft', 'submitted', 'approved', 'probing', 'composed']
  const observedUsd = store.proposals.reduce((sum, p) => sum + probeCost(p).total, 0)
  const capUsd = store.proposals.reduce((sum, p) => sum + p.budgetCapUsd, 0)
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
    experiences: store.experiences.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 50),
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
  mode?: 'parallel' | 'sequential'
  domain?: string
  budgetCapUsd?: number
  evidenceRefs?: string[]
  experienceIds?: string[]
  variants: Array<{ label?: string; content: string }>
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
    const content = String(v.content ?? '')
    if (!content.trim()) throw new ServiceError(400, `候选 ${i + 1} 内容为空`)
    // 源文防泄漏：harness 文件不得携带评测器判词（core/context.py 的 marker 清单）。
    const markers = findGraderMarkers(content)
    if (markers.length > 0) {
      throw new ServiceError(400, `候选 ${i + 1} 含评测判词标记，不能写入 harness`, { markers })
    }
    const pathMarkers = findGraderMarkersInPath(v.label ?? '')
    if (pathMarkers.length > 0) {
      throw new ServiceError(400, `候选 ${i + 1} 标签含评测判词标记，不能写入 harness`, { markers: pathMarkers })
    }
    return {
      id: `v${i + 1}`,
      label: String(v.label ?? `候选 ${i + 1}`).slice(0, 80),
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

export async function submitProposal(id: string): Promise<ProposalView> {
  return mutateStore((store) => {
    const p = requireProposal(store, id)
    if (p.status !== 'draft') throw new ServiceError(409, `当前状态 ${p.status} 不可提交`)
    const blockers = submitReadiness(p)
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
        snapshot: { variantId: selected.id, digest: selected.digest, targetPath: p.targetPath, content: selected.content },
        createdAt: now,
        updatedAt: now,
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
    p.status = 'rolled_back'
    p.updatedAt = nowIso()
    return view(store, p)
  })
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
