// workbench 一键自动探测（v0.4 单文件体量治理：第二批拆分，来自 service.ts，行为不变）。
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
import { computeExecutionTrace, executionMarkersOf } from './execution-trace'
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

import { ServiceError, nowIso, requireProposal, view, recordProbe, profileFromTarget } from './service-shared'

// ---------- 一键自动探测（spec §13：批准后自动发起，不自动提出候选） ----------

/** 在途自动探测（同提案并发二次发起 409；服务重启后 running 态失联，需重新发起）。 */
export const runningProbes = new Set<string>()

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
  /** 并发峰值（调度面 probeConcurrency>1 时才会 >1；如实呈现并发有没有真的生效）。 */
  peakInFlight?: number
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
  // managed 面写盘要求目标文件已存在——调度策略文件在本台首次使用时 bootstrap 出缺省值
  ensureScheduleFile()
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
  // 调度面：策略文件存在则按它取每题上限（Harmony 吸收轮——调度是因子化演化的一块，
  // 改策略文件即改变探测行为；显式 opts.maxTasks 优先，便于单次覆盖）
  const policy = readSchedulePolicy()
  const maxTasks = Math.max(1, Math.min(50, opts.maxTasks ?? policy.probeMaxTasks))
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
  // R11：任务态落盘（SQLite 后端生效）——进程崩溃后重启可查「上次未完成的探测」，
  // 不自动续跑（续跑属下一阶段），但不再静默丢失。
  persistAutoJob(id, { proposalId: id, status: 'running', variantsTotal: job.variantsTotal, startedAt: nowIso() })
  void runAutoProbeJob(id, pendingVariants.map((v) => v.id), opts, { setId: set.id, regressionSetId: regressionSet?.id }, { maxTasks, estimate }, job)
    .catch((e) => { job.status = 'failed'; job.error = e instanceof Error ? e.message : String(e) })
    .finally(() => { runningProbes.delete(id); persistAutoJob(id, null) })
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
    // W1（2026-11-05）：候选引入的 skill/子代理名 → 执行证迹标记；不可观测面为空，不参与判定。
    const markerInfo = executionMarkersOf(variant)
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

    // R4（D4 匹配预算口径）：k=2 默认；预算不足以支撑双样本全程时降 1（如实降级不造假）。
    const perTask = limits.estimate
    const wantK = Math.max(1, Math.min(readSchedulePolicy().probeK, 10))
    const affordableK = remaining >= tasks.length * perTask * wantK ? wantK : 1
    const result = await runProbeTasks({
      prompts: tasks,
      baseHome: hermesHome(),
      profile,
      variantTree: tree,
      budgetRemainingUsd: Math.max(0, remaining),
      estimatePerTaskUsd: limits.estimate,
      k: affordableK,
      concurrency: readSchedulePolicy().probeConcurrency,
      markers: markerInfo.markers,
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
      // W1：采集到标记才写证迹；未下传标记（纯指令面）如实缺席，由门按配置处置。
      executionTrace: result.markerHits
        ? computeExecutionTrace(result.markerHits.markers, result.markerHits.hits, result.markerHits.scannedChars)
        : null,
    })

    // ---- R2（2026-10-31 二批执行）：三类证据自动供给 ----
    // ①噪声：未改动 harness 同集×2（baseline 运行×2 → calibrateNoise 自动标定）；
    // ②等预算：未改动 harness 同集×1（预算与候选相当 → equalBudgetBaseline）；
    // 反事实（③）依赖 R3 变体集的运行编排，属下一轮（本批供变换器本体）。
    // 未改动 harness＝variantTree 全 null 的物化（probe-runner materializeHome 语义）。
    try {
      const pNow = readStore().proposals.find((x) => x.id === id)
      if (pNow) {
        const noiseNeeded = pNow.noise == null
        const eqNeeded = (() => {
          const sel = composedVariant(pNow)
          const pr2 = sel ? pNow.probes.find((x) => x.variantId === sel.id && x.status === 'recorded') : null
          return pr2?.evidence?.equalBudgetBaseline == null
        })()
        // R2③（2026-11-01 残项）：反事实档自动编排——R3 变换器产出 rename_ids 变体，
        // 注册为临时 eval 集后跑候选树探测，replay 判分写回 evidence.counterfactual。
        const selNow = composedVariant(pNow)
        const selProbeNow = selNow ? pNow.probes.find((x) => x.variantId === selNow.id && x.status === 'recorded') : null
        const cfNeeded = selProbeNow?.evidence?.counterfactual == null
        if (cfNeeded && selNow) {
          const { buildCounterfactualVariant } = await import('./counterfactual-variants')
          const variant = buildCounterfactualVariant(evalSet.id, 'rename_ids')
          if (variant) {
            const cfSetCreated = createSet({
              name: `cf-${evalSet.id}-${id.slice(3)}-${Date.now().toString(36)}`,
              track: evalSet.track,
              ...(evalSet.module ? { module: evalSet.module } : {}),
              tasks: variant.tasks.map((vt) => ({
                id: vt.id,
                problem: vt.problem,
                expectedBehavior: vt.expectedBehavior,
                rubric: evalSet.tasks.map((st) => st.rubric).flat().slice(0, 1),
              })),
            })
            if (cfSetCreated.ok) {
              const cfRemaining = pNow.budgetCapUsd - (probeCost(pNow).total + job.costUsd)
              if (cfRemaining >= limits.estimate) {
                const cfResult = await runProbeTasks({
                  prompts: cfSetCreated.set.tasks.map((vt) => ({ taskId: vt.id, prompt: vt.problem })),
                  baseHome: hermesHome(),
                  profile,
                  variantTree: tree,
                  budgetRemainingUsd: Math.max(0, cfRemaining),
                  estimatePerTaskUsd: limits.estimate,
                  k: 1,
                  spawnRun: opts.spawnRun,
                })
                if (cfResult.ok && Object.keys(cfResult.samples).length > 0) {
                  const cfReplay = await runReplayEval(
                    {
                      setId: cfSetCreated.set.id,
                      samples: cfResult.samples,
                      target: { profile, harnessRef: `${id}:${variantId}:counterfactual` },
                      actor: 'workbench-auto',
                      note: `R2③ 反事实（rename_ids 变体）${id}/${variantId}`,
                    },
                    { judge: { config: loadEvalConfig(), ...(opts.judgeAsk ? { ask: opts.judgeAsk } : {}) }, outcomeCtx: probeOutcomeContext() },
                  )
                  if (cfReplay.ok) {
                    const cfMetrics = readEvalEvidence(cfReplay.run.id)
                    await mutateStore((st) => {
                      const pp2 = requireProposal(st, id)
                      const sel2 = composedVariant(pp2)
                      const target2 = sel2 ? pp2.probes.find((x) => x.variantId === sel2.id && x.status === 'recorded') : null
                      if (target2?.evidence && cfMetrics) {
                        target2.evidence.counterfactual = { runId: cfMetrics.evalRunId, setId: cfMetrics.setId, passAt1: cfMetrics.passAt1 }
                      }
                      pp2.updatedAt = nowIso()
                    })
                  }
                }
              }
            }
          }
        }
        const runsWanted = (noiseNeeded ? 2 : 0) + (eqNeeded ? 1 : 0)
        if (runsWanted > 0) {
          const nullTree: Record<string, string | null> = {}
          for (const key of Object.keys(tree)) nullTree[key] = null
          const baseRemaining = pNow.budgetCapUsd - (probeCost(pNow).total + job.costUsd)
          const baseRunIds: string[] = []
          for (let r = 0; r < runsWanted; r += 1) {
            const baseResult = await runProbeTasks({
              prompts: tasks,
              baseHome: hermesHome(),
              profile,
              variantTree: nullTree,
              budgetRemainingUsd: Math.max(0, baseRemaining),
              estimatePerTaskUsd: limits.estimate,
              k: 1,
              spawnRun: opts.spawnRun,
            })
            if (!baseResult.ok || Object.keys(baseResult.samples).length === 0) break
            const baseReplay = await runReplayEval(
              {
                setId: evalSet.id,
                samples: baseResult.samples,
                target: { profile, harnessRef: `${id}:baseline:${r}` },
                actor: 'workbench-auto',
                note: `R2 基线运行 ${id}:${r}${noiseNeeded && r < 2 ? '（噪声标定）' : '（等预算）'}`,
              },
              { judge: { config: loadEvalConfig(), ...(opts.judgeAsk ? { ask: opts.judgeAsk } : {}) }, outcomeCtx: probeOutcomeContext() },
            )
            if (baseReplay.ok) baseRunIds.push(baseReplay.run.id)
          }
          await mutateStore((st) => {
            const pp = requireProposal(st, id)
            if (noiseNeeded && baseRunIds.length >= 2) {
              const m1 = readEvalEvidence(baseRunIds[0])
              const m2 = readEvalEvidence(baseRunIds[1])
              if (m1 && m2 && m1.passAt1 != null && m2.passAt1 != null) {
                pp.noise = {
                  runIds: baseRunIds.slice(0, 2),
                  setId: m1.setId,
                  delta: Number((Math.abs(m1.passAt1 - m2.passAt1) / 2).toFixed(4)),
                  method: 'half-range',
                  samples: [m1.passAt1, m2.passAt1],
                  computedAt: nowIso(),
                }
              }
            }
            if (eqNeeded && baseRunIds.length >= 1) {
              const sel = composedVariant(pp)
              const target = sel ? pp.probes.find((x) => x.variantId === sel.id && x.status === 'recorded') : null
              if (target?.evidence) {
                const eqIdx = noiseNeeded && baseRunIds.length >= 3 ? 2 : Math.min(baseRunIds.length - 1, noiseNeeded ? baseRunIds.length - 1 : 0)
                const mEq = readEvalEvidence(baseRunIds[eqIdx])
                if (mEq) target.evidence.equalBudgetBaseline = { runId: mEq.evalRunId, setId: mEq.setId, passAt1: mEq.passAt1 }
              }
            }
            pp.updatedAt = nowIso()
          })
        }
      }
    } catch {
      // R2 证据供给失败不阻断主探测（证据可后补；如实静默跳过——note 不撒谎）
    }

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
    if (result.peakInFlight != null) job.peakInFlight = Math.max(job.peakInFlight ?? 1, result.peakInFlight)
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

