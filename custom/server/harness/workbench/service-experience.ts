// workbench 经验库（v0.4 单文件体量治理：第二批拆分，来自 service.ts，行为不变）。
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

import { ServiceError, nowIso } from './service-shared'

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

