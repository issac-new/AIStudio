// overlay[eval] 数据飞轮：台账 + 转化漏斗 + 坏例通过率退化门（2026-10-25 吸收轮，件三）。
//
// 范式来源：《AI Agent 数据飞轮》——错误转化率（事故→入库用例/变体的转化漏斗，
// 文化从追责转向转化）+ CI 红线（k 次采样容忍度：每条历史 Bad Case 跑 3~5 次，
// 通过率低于阈值才判退化，任一历史 Bug 复现一票否决）。
//
// 台账独立 JSON（spec D6）：不动 EvalTask 类型与集指纹语义；提炼/变体记录
// 登记在册，读数全派生、无数据 null 不造数（fail-soft）。存储与 eval-store
// 同目录同原子写模式（EVAL_STORE env → 测试隔离共享）。
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import type { BadCaseRootCause } from './badcase-distill'
import { ROOT_CAUSE_LABELS } from './badcase-distill'
import type { EvalRun, EvalSet, RemediationRecord } from './types'
import { atomicWriteJson } from '../lib/fs-store'
import { underWebUi } from '../lib/paths'

// ---------- 台账 ----------

export interface DistillLedgerEntry {
  id: string
  /** 提炼产出的回归任务 id（bd-*）。 */
  taskId: string
  sourceRunId: string
  sourceTaskId: string
  sampleIdx: number
  rootCause: BadCaseRootCause
  tabooActions: string[]
  failedSteps: number | null
  stepRedline: number | null
  targetSetId: string
  actor?: string
  at: number
  /** 坏例题面快照（round 2 D16：源集非密封才存；fewshot 召回的触发场景源）。 */
  problem?: string
  /** 正确做法快照（同上；fewshot 三元组的正确示范源）。 */
  expectedBehavior?: string
  /** LLM 归因并联复核（round 2 D13：只入台账供人工复核，不改主判；缺省=未开启）。 */
  attribution?: {
    verdict: 'confirmed' | 'disputed' | 'unknown' | 'offline'
    /** 判定端 P(yes)（confirmed/disputed/unknown 携带；offline 缺席）。 */
    p?: number
    model?: string
    reason?: string
    at: number
  }
}

export interface VariantBatchEntry {
  id: string
  /** 蓝本任务 id（回归库坏例）。 */
  blueprintTaskId: string
  variantIds: string[]
  dimensions: string[]
  targetSetId: string
  actor?: string
  at: number
}

interface LedgerShape {
  distills: DistillLedgerEntry[]
  variantBatches: VariantBatchEntry[]
  nextSeq: number
}

function ledgerDir(): string {
  const env = process.env.EVAL_STORE?.trim()
  return env || underWebUi('eval')
}

function ledgerPath(): string {
  return join(ledgerDir(), 'flywheel-ledger.json')
}

function readLedger(): LedgerShape {
  let raw: Partial<LedgerShape>
  try {
    raw = JSON.parse(readFileSync(ledgerPath(), 'utf8')) as Partial<LedgerShape>
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return { distills: [], variantBatches: [], nextSeq: 1 }
    }
    throw e
  }
  return {
    distills: Array.isArray(raw.distills) ? raw.distills : [],
    variantBatches: Array.isArray(raw.variantBatches) ? raw.variantBatches : [],
    nextSeq: typeof raw.nextSeq === 'number' ? raw.nextSeq : 1,
  }
}

/** tmp+rename 原子写（eval-store 同模式）。 */
function writeLedger(ledger: LedgerShape): void {
  mkdirSync(ledgerDir(), { recursive: true })
  const file = ledgerPath()
  atomicWriteJson(file, ledger)
}

/** 登记一次提炼（幂等：同 sourceRunId+sourceTaskId+sampleIdx 已在册则跳过；重复提交可补快照/归因复核）。 */
export function recordDistill(entry: Omit<DistillLedgerEntry, 'id' | 'at'>): { ok: true; id: string; duplicate: boolean } {
  const ledger = readLedger()
  const dup = ledger.distills.find(
    (d) => d.sourceRunId === entry.sourceRunId && d.sourceTaskId === entry.sourceTaskId && d.sampleIdx === entry.sampleIdx,
  )
  if (dup) {
    // 旧记录缺文本快照 → 补齐（fewshot 召回随即生效）；归因复核重复执行以最近一次为准
    let mutated = false
    if (!dup.problem && entry.problem) { dup.problem = entry.problem; mutated = true }
    if (!dup.expectedBehavior && entry.expectedBehavior) { dup.expectedBehavior = entry.expectedBehavior; mutated = true }
    if (entry.attribution) { dup.attribution = entry.attribution; mutated = true }
    if (mutated) writeLedger(ledger)
    return { ok: true, id: dup.id, duplicate: true }
  }
  const id = `fw-${String(ledger.nextSeq).padStart(4, '0')}`
  ledger.distills.push({ ...entry, id, at: Date.now() })
  ledger.nextSeq += 1
  writeLedger(ledger)
  return { ok: true, id, duplicate: false }
}

/** 登记一次变体扩产（幂等：同蓝本+同维度集已在册则跳过）。 */
export function recordVariantBatch(entry: Omit<VariantBatchEntry, 'id' | 'at'>): { ok: true; id: string; duplicate: boolean } {
  const ledger = readLedger()
  const key = (dims: string[]) => [...dims].sort().join(',')
  const dup = ledger.variantBatches.find(
    (b) => b.blueprintTaskId === entry.blueprintTaskId && key(b.dimensions) === key(entry.dimensions),
  )
  if (dup) return { ok: true, id: dup.id, duplicate: true }
  const id = `fwv-${String(ledger.nextSeq).padStart(4, '0')}`
  ledger.variantBatches.push({ ...entry, id, at: Date.now() })
  ledger.nextSeq += 1
  writeLedger(ledger)
  return { ok: true, id, duplicate: false }
}

export function listLedger(): { distills: DistillLedgerEntry[]; variantBatches: VariantBatchEntry[] } {
  const ledger = readLedger()
  return { distills: ledger.distills, variantBatches: ledger.variantBatches }
}

/** 测试便利（与 store._useStoreDirForTests 同通道：共享 EVAL_STORE 隔离）。 */
export function _ledgerFileExistsForTests(): boolean {
  return existsSync(ledgerPath())
}

// ---------- 转化漏斗（错误转化率） ----------

export interface FlywheelFunnel {
  /** 捕获分母：全库 runs 中失败 attempt 数（task×sample 粒度）。 */
  badCases: number
  /** 已回流：跨集带 origin 的任务数（按 taskId 去重）。 */
  reflowed: number
  /** 已提炼：台账 distill 条数。 */
  distilled: number
  /** 变体蓝本数 / 变体任务数（台账 variantBatches 派生）。 */
  variantBlueprints: number
  variantTasks: number
  /** 处置单开单/关闭数（修复闭环面）。 */
  remediationOpen: number
  remediationClosed: number
  /** 转化率=reflowed/badCases，截顶 1（幂等去重防假 >1）；0 分母 null 不造数。 */
  conversionRate: number | null
}

export interface RootCauseBucket {
  rootCause: BadCaseRootCause
  label: string
  count: number
}

export interface FlywheelReadout {
  funnel: FlywheelFunnel
  /** 按根因聚类（源文：入库后按根因聚类统计 Top 缺陷类型）；降序。 */
  byRootCause: RootCauseBucket[]
  /** 全库任务中的变体资产数（id 含 `-cf` 段；台账之外的历史变体也计入）。 */
  variantTasksInSets: number
}

/** 全派生读数：从 eval store 实体 + 飞轮台账汇总（纯函数，不写库）。 */
export function flywheelReadoutOf(
  sets: EvalSet[],
  runs: EvalRun[],
  remediations: RemediationRecord[],
  ledger: { distills: DistillLedgerEntry[]; variantBatches: VariantBatchEntry[] },
): FlywheelReadout {
  let badCases = 0
  for (const run of runs) {
    for (const attempt of run.attempts) {
      if (attempt.passed === false) badCases += 1
    }
  }
  const reflowedIds = new Set<string>()
  let variantTasksInSets = 0
  for (const set of sets) {
    for (const task of set.tasks) {
      if (task.origin) reflowedIds.add(task.id)
      if (task.id.includes('-cf')) variantTasksInSets += 1
    }
  }
  const counts = new Map<BadCaseRootCause, number>()
  for (const d of ledger.distills) counts.set(d.rootCause, (counts.get(d.rootCause) ?? 0) + 1)
  const byRootCause: RootCauseBucket[] = [...counts.entries()]
    .map(([rootCause, count]) => ({ rootCause, label: ROOT_CAUSE_LABELS[rootCause], count }))
    .sort((a, b) => b.count - a.count)

  const reflowed = reflowedIds.size
  return {
    funnel: {
      badCases,
      reflowed,
      distilled: ledger.distills.length,
      variantBlueprints: ledger.variantBatches.length,
      variantTasks: ledger.variantBatches.reduce((sum, b) => sum + b.variantIds.length, 0),
      remediationOpen: remediations.filter((r) => r.status === 'open').length,
      remediationClosed: remediations.filter((r) => r.status === 'closed').length,
      conversionRate: badCases === 0 ? null : Math.min(1, reflowed / badCases),
    },
    byRootCause,
    variantTasksInSets,
  }
}

// ---------- 坏例通过率退化门（k 次采样容忍度 + 一票否决） ----------

export interface GateTaskRow {
  taskId: string
  samples: number
  passed: number
  passRate: number | null
}

export interface FlywheelGate {
  /** no_data=回归库无运行；insufficient=k<2（单跑不作门禁）；fail=任一坏例复现；pass。 */
  status: 'no_data' | 'insufficient' | 'fail' | 'pass'
  runId?: string
  k?: number
  minPassRate: number
  minSamples: number
  tasks: GateTaskRow[]
  /** 判「历史 Bug 复现」的任务 id（fail 时非空）。 */
  reproduced: string[]
  riskVeto?: boolean
  note?: string
}

export interface GateOptions {
  minPassRate?: number
  minSamples?: number
}

function num(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const v = Number(raw)
  return Number.isFinite(v) ? v : fallback
}

export function gateThresholds(opts: GateOptions = {}): { minPassRate: number; minSamples: number } {
  return {
    minPassRate: opts.minPassRate ?? num('FLYWHEEL_GATE_MIN_PASS_RATE', 0.8),
    minSamples: opts.minSamples ?? num('FLYWHEEL_GATE_MIN_SAMPLES', 3),
  }
}

/**
 * 回归库 run → 任务粒度 k 次采样通过率门。
 *
 * 与 pass@k 的分工（spec D7）：pass@k 是「任一通过即过」的统计基线口径；
 * 本门是源文 CI 红线口径——每个历史坏例独立算 k 次通过率，低于阈值
 * （默认 0.80，字面抖动容忍）且样本数够（默认 ≥3）判「历史 Bug 复现」，
 * 任一复现 → fail（一票否决）；riskVeto 命中同样 fail。纯函数。
 */
export function passRateGateOf(run: EvalRun | undefined, opts: GateOptions = {}): FlywheelGate {
  const { minPassRate, minSamples } = gateThresholds(opts)
  if (!run) {
    return { status: 'no_data', minPassRate, minSamples, tasks: [], reproduced: [], note: '回归样本库尚无运行，门读数缺席（no_data）' }
  }
  if (run.k < 2) {
    return { status: 'insufficient', runId: run.id, k: run.k, minPassRate, minSamples, tasks: [], reproduced: [], note: 'k<2：单跑不作门禁' }
  }
  const samplesByTask = new Map<string, { passed: number; total: number }>()
  for (const attempt of run.attempts) {
    const slot = samplesByTask.get(attempt.taskId) ?? { passed: 0, total: 0 }
    slot.total += 1
    if (attempt.passed === true) slot.passed += 1
    samplesByTask.set(attempt.taskId, slot)
  }
  const tasks: GateTaskRow[] = [...samplesByTask.entries()]
    .map(([taskId, { passed, total }]) => ({ taskId, samples: total, passed, passRate: total === 0 ? null : passed / total }))
    .sort((a, b) => (a.passRate ?? 1) - (b.passRate ?? 1))
  const reproduced = tasks
    .filter((t) => t.samples >= minSamples && t.passRate !== null && t.passRate < minPassRate)
    .map((t) => t.taskId)
  const riskVeto = run.aggregates?.riskVeto === true
  const status: FlywheelGate['status'] = reproduced.length > 0 || riskVeto ? 'fail' : 'pass'
  return {
    status,
    runId: run.id,
    k: run.k,
    minPassRate,
    minSamples,
    tasks,
    reproduced,
    ...(riskVeto ? { riskVeto } : {}),
    ...(status === 'fail'
      ? { note: `历史 Bug 复现 ${reproduced.length} 条（通过率<${minPassRate} 且样本≥${minSamples}）${riskVeto ? '；riskVeto 命中' : ''}——一票否决，拒绝合入判定` }
      : { note: `全部 ${tasks.length} 条坏例通过率≥${minPassRate}（字面抖动容忍口径）` }),
  }
}

/** 回归库最新 run（controller 用：集名缺省 REGRESSION_SET_NAME）。 */
export function latestRunOfSet(runs: EvalRun[], setId: string): EvalRun | undefined {
  const scoped = runs.filter((r) => r.setId === setId)
  return scoped.length === 0 ? undefined : scoped.reduce((latest, r) => (r.createdAt > latest.createdAt ? r : latest))
}

// ---------- 合入门（round 2 挂账 2：三类变更触发回归库门） ----------

/** 变更清单三类（与 EvalRunTarget 三锚对齐：profile=提示词档、model、harnessRef=编排）。 */
export interface ChangeManifest {
  prompt?: boolean
  model?: boolean
  orchestration?: boolean
}

export interface MergeGateResult {
  /** not_required=三类变更皆未动；blocked=红线未过（fail-closed）；pass=可合入。 */
  status: 'not_required' | 'blocked' | 'pass'
  /** 命中的变更类（呈现面）。 */
  changedClasses: Array<'prompt' | 'model' | 'orchestration'>
  /** blocked 时的逐条理由（执法面 fail-closed：证据缺任何一环即拦）。 */
  reasons: string[]
  /** 所依据的回归库 run（缺省=no run）。 */
  runId?: string
}

/**
 * 合入门（spec D14，源文 CI 红线「改 Prompt/升级模型/调编排，合并前必须通过
 * 历史 Bad Case 回放」的 in-product 承接）：三类变更任一为真 → 回归库最新 run
 * 必须存在、k≥2、通过率门 pass、无 riskVeto，任一不满足即 blocked。
 * 无相关变更 → not_required（不扩权）。纯函数。
 */
export function mergeGateOf(manifest: ChangeManifest, latestRun: EvalRun | undefined, opts: GateOptions = {}): MergeGateResult {
  const changedClasses = (['prompt', 'model', 'orchestration'] as const).filter((k) => manifest?.[k] === true)
  if (changedClasses.length === 0) {
    return { status: 'not_required', changedClasses: [], reasons: ['三类变更（Prompt/模型/编排）皆未动，不触发坏例回放门'] }
  }
  const reasons: string[] = []
  if (!latestRun) {
    reasons.push('回归样本库无运行：变更后未做过历史坏例回放')
    return { status: 'blocked', changedClasses, reasons }
  }
  if (latestRun.k < 2) {
    // k<2 时 passRateGateOf 只会回 insufficient，此处直接给人话理由
    reasons.push(`k=${latestRun.k} < 2：单跑不作门禁`)
  } else {
    const gate = passRateGateOf(latestRun, opts)
    if (gate.status === 'fail') reasons.push(gate.note ?? '坏例通过率门未过')
  }
  if (latestRun.aggregates?.riskVeto === true) reasons.push('riskVeto 命中：红线断言一票否决')
  return {
    status: reasons.length > 0 ? 'blocked' : 'pass',
    changedClasses,
    reasons,
    runId: latestRun.id,
  }
}
