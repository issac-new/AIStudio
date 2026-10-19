// overlay[eval] Eval Studio · JSON store（heldout 同模式：tmp+rename 原子写、
// 仅 ENOENT 按空账、_useStoreDirForTests 隔离）。
//
// 密封契约（对齐 held-out-store.ts，测试逐条锁定）：
//   1. listSets 只回元数据，题目内容永不出库；
//   2. 密封集运行报告只回聚合（run 报告的剥离在 controller 层，本层留全量供审计）；
//   3. 密封集每调用方尝试上限（默认 3）：二分探测通道在限次内不可行；
//   4. 密封集不可改题——改题必须先落 RubricIterationLog（"改题凑分"结构性阻断）。
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type {
  EvalRun, EvalSet, EvalSetMeta, EvalSetRevision, EvalTask, RemediationRecord, RubricAssertion, RubricIterationLog,
} from './types'
import { isEvalDimension } from './coverage'
import type { OracleCase, OracleRunRecord } from './uioracle'
import { contentFingerprint } from './fingerprint'

interface StoreShape {
  sets: EvalSet[]
  /** 不可变考卷快照：每次资产变更追加一版（收口轮）。 */
  revisions: EvalSetRevision[]
  runs: EvalRun[]
  /** 处置单：失败样本的修复追踪（收口轮）。 */
  remediations: RemediationRecord[]
  rubricIterations: RubricIterationLog[]
  oracleCases: OracleCase[]
  oracleRuns: OracleRunRecord[]
  nextSeq: number
}

function storeDir(): string {
  const env = process.env.EVAL_STORE?.trim()
  return env || join(homedir(), '.hermes-web-ui', 'eval')
}

function storePath(): string {
  return join(storeDir(), 'eval-store.json')
}

function readStore(): StoreShape {
  let raw: Partial<StoreShape>
  try {
    raw = JSON.parse(readFileSync(storePath(), 'utf8')) as Partial<StoreShape>
  } catch (e) {
    // 仅"首装无文件"按空账处理；损坏/占用如实上抛（静默当空账会让下一次全量
    // writeStore 把评测资产整体覆写清零且 nextSeq 重置撞号）。
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        sets: [], revisions: [], runs: [], remediations: [],
        rubricIterations: [], oracleCases: [], oracleRuns: [], nextSeq: 1,
      }
    }
    throw e
  }
  return {
    sets: Array.isArray(raw.sets) ? raw.sets.map(backfillSetAsset) : [],
    revisions: Array.isArray(raw.revisions) ? raw.revisions : [],
    runs: Array.isArray(raw.runs) ? raw.runs : [],
    remediations: Array.isArray(raw.remediations) ? raw.remediations : [],
    rubricIterations: Array.isArray(raw.rubricIterations) ? raw.rubricIterations : [],
    oracleCases: Array.isArray(raw.oracleCases) ? raw.oracleCases : [],
    oracleRuns: Array.isArray(raw.oracleRuns) ? raw.oracleRuns : [],
    nextSeq: typeof raw.nextSeq === 'number' ? raw.nextSeq : 1,
  }
}

/** 旧数据回填（百度轮 B1 上线前的集无指纹）：读时补算，不落盘（下次改题自然固化）。 */
function backfillSetAsset(set: EvalSet): EvalSet {
  if (set.contentHash && typeof set.revision === 'number') return set
  return { ...set, contentHash: contentFingerprint(set), revision: set.revision ?? 1 }
}

/** 追加不可变快照；同版本同指纹幂等（建集/改题各调用一次）。 */
function snapshotSet(store: StoreShape, set: EvalSet, createdBy?: string): void {
  const latest = store.revisions.find((r) => r.setId === set.id && r.revision === set.revision)
  if (latest && latest.contentHash === set.contentHash) return
  const by = createdBy ?? set.createdBy
  store.revisions.push({
    setId: set.id,
    revision: set.revision,
    contentHash: set.contentHash,
    tasks: JSON.parse(JSON.stringify(set.tasks)) as EvalTask[],
    createdAt: Date.now(),
    ...(by ? { createdBy: by } : {}),
  })
}

/** 改题后维护资产面：重算指纹 + 修订号递增 + 追加版本快照（三条路径共用）。 */
function bumpSetAsset(store: StoreShape, set: EvalSet): void {
  set.revision = (set.revision ?? 1) + 1
  set.contentHash = contentFingerprint(set)
  snapshotSet(store, set)
}

function writeStore(store: StoreShape): void {
  mkdirSync(storeDir(), { recursive: true })
  const file = storePath()
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8')
  renameSync(tmp, file)
}

// ---------- 校验 ----------

const TRACKS = new Set(['e2e', 'process'])
const KINDS = new Set(['result', 'trajectory', 'risk'])
const OPS = new Set(['<', '<=', '>', '>='])
const METRICS = new Set(['tokens', 'steps', 'costUsd', 'durationMs'])
const LINKS = new Set(['intent', 'tool_choice', 'params', 'evidence', 'state', 'expression'])
const EXCEPTION_TYPES = new Set([
  'none', 'ambiguous_intent', 'missing_param', 'insufficient_permission',
  'tool_timeout', 'knowledge_conflict', 'user_rephrase',
])

function validateAssertion(a: unknown, i: number, problems: string[]): void {
  const it = a as Partial<RubricAssertion> | undefined
  if (!it || typeof it.id !== 'string' || !it.id.trim()) problems.push(`断言 #${i} id 必填`)
  if (!it || typeof it.text !== 'string' || !it.text.trim()) problems.push(`断言 #${i} text 必填`)
  if (!it || (it.expect !== 'yes' && it.expect !== 'no')) problems.push(`断言 #${i} expect 须为 yes/no`)
  if (!it || !KINDS.has(String(it.kind))) problems.push(`断言 #${i} kind 须为 result/trajectory/risk`)
  if (it?.kind === 'risk' && it.expect !== 'no') {
    // 红线断言语义：坏现象"是否发生"，期望必然是"否"——expect='yes' 的 risk 是建模错误。
    problems.push(`断言 #${i} risk 断言 expect 必须为 'no'（红线=坏现象不应发生）`)
  }
  if (it?.link !== undefined && !LINKS.has(String(it.link))) {
    problems.push(`断言 #${i} link 须为 intent/tool_choice/params/evidence/state/expression`)
  }
  if (it?.s0) {
    if (it.s0.kind === 'regex') {
      if (typeof it.s0.pattern !== 'string' || !it.s0.pattern) problems.push(`断言 #${i} s0.regex.pattern 必填`)
      else {
        try {
          new RegExp(it.s0.pattern, it.s0.flags ?? '')
        } catch {
          problems.push(`断言 #${i} s0.regex.pattern 非法正则`)
        }
      }
    } else if (it.s0.kind === 'threshold') {
      if (!METRICS.has(String(it.s0.metric))) problems.push(`断言 #${i} s0.threshold.metric 非法`)
      if (!OPS.has(String(it.s0.op))) problems.push(`断言 #${i} s0.threshold.op 非法`)
      if (typeof it.s0.value !== 'number' || !Number.isFinite(it.s0.value)) problems.push(`断言 #${i} s0.threshold.value 须为有限数`)
    } else if (it.s0.kind === 'similarity') {
      if (typeof it.s0.minScore !== 'number' || !Number.isFinite(it.s0.minScore) || it.s0.minScore < 0 || it.s0.minScore > 1) {
        problems.push(`断言 #${i} s0.similarity.minScore 须为 0~1`)
      }
      if (it.s0.stopwords !== undefined && (!Array.isArray(it.s0.stopwords) || it.s0.stopwords.some((w) => typeof w !== 'string'))) {
        problems.push(`断言 #${i} s0.similarity.stopwords 须为字符串数组（[] = 关闭停用词清洁）`)
      }
    } else {
      problems.push(`断言 #${i} s0.kind 须为 regex/threshold/similarity`)
    }
  }
}

function validateTask(t: unknown, i: number, problems: string[]): void {
  const it = t as Partial<EvalTask> | undefined
  if (!it || typeof it.id !== 'string' || !it.id.trim()) problems.push(`任务 #${i} id 必填`)
  if (!it || typeof it.problem !== 'string' || !it.problem.trim()) problems.push(`任务 #${i} problem 必填`)
  if (!it || typeof it.expectedBehavior !== 'string' || !it.expectedBehavior.trim()) problems.push(`任务 #${i} expectedBehavior 必填`)
  if (!it || !Array.isArray(it.rubric) || it.rubric.length === 0) problems.push(`任务 #${i} rubric 至少 1 条断言`)
  else {
    const ids = new Set<string>()
    it.rubric.forEach((a, j) => {
      validateAssertion(a, j, problems)
      const id = (a as Partial<RubricAssertion>)?.id
      if (typeof id === 'string' && ids.has(id)) problems.push(`任务 #${i} 断言 id 重复：${id}`)
      if (typeof id === 'string') ids.add(id)
    })
  }
  if (it?.outcome) {
    if (typeof it.outcome.verifier !== 'string' || !it.outcome.verifier.trim()) problems.push(`任务 #${i} outcome.verifier 必填`)
  }
  if (it?.exceptionType !== undefined && !EXCEPTION_TYPES.has(String(it.exceptionType))) {
    problems.push(`任务 #${i} exceptionType 须为 none/ambiguous_intent/missing_param/insufficient_permission/tool_timeout/knowledge_conflict/user_rephrase`)
  }
  if (it?.expectedToolCalls !== undefined) {
    if (!Array.isArray(it.expectedToolCalls) || it.expectedToolCalls.length === 0) {
      problems.push(`任务 #${i} expectedToolCalls 须为非空数组（工具名按序）`)
    } else if (it.expectedToolCalls.some((n) => typeof n !== 'string' || !n.trim())) {
      problems.push(`任务 #${i} expectedToolCalls 每项须为非空工具名`)
    }
  }
  if (it?.dimension !== undefined && !isEvalDimension(it.dimension)) {
    problems.push(`任务 #${i} dimension 须为七维之一：task_completion/tool_params/failure_recovery/long_task_state/privilege_injection/cost_loop/human_escalation`)
  }
}

export interface CreateSetInput {
  name: string
  track: string
  module?: string
  tasks: unknown[]
}

// ---------- 评测集 ----------

export function listSets(): EvalSetMeta[] {
  const store = readStore()
  return store.sets.map((s) => ({
    id: s.id,
    name: s.name,
    track: s.track,
    module: s.module,
    sealed: s.sealed,
    contentHash: s.contentHash,
    revision: s.revision,
    createdAt: s.createdAt,
    createdBy: s.createdBy,
    taskCount: s.tasks.length,
    runCount: store.runs.filter((r) => r.setId === s.id).length,
  }))
}

export function getSet(id: string): EvalSet | undefined {
  return readStore().sets.find((s) => s.id === id)
}

export function createSet(
  input: CreateSetInput,
  createdBy?: string,
): { ok: true; set: EvalSet } | { ok: false; problems: string[] } {
  const problems: string[] = []
  const name = (input?.name ?? '').trim()
  if (!name || name.length > 64) problems.push('name 必填（≤64 字符）')
  if (!TRACKS.has(String(input?.track))) problems.push('track 须为 e2e/process')
  if (input?.track !== 'process' && input?.module) problems.push('module 仅 Process 轨可填')
  if (!Array.isArray(input?.tasks) || input.tasks.length === 0) problems.push('tasks 至少 1 条')
  else input.tasks.forEach((t, i) => validateTask(t, i, problems))
  const store = readStore()
  if (!problems.length && store.sets.some((s) => s.name === name)) problems.push(`同名评测集已存在：${name}`)
  if (problems.length) return { ok: false, problems }

  const set: EvalSet = {
    id: `eset-${String(store.nextSeq).padStart(3, '0')}`,
    name,
    track: input.track as EvalSet['track'],
    module: input.track === 'process' && input.module?.trim() ? input.module.trim() : undefined,
    sealed: false,
    contentHash: '',
    revision: 1,
    createdAt: Date.now(),
    createdBy,
    tasks: input.tasks as EvalTask[],
  }
  set.contentHash = contentFingerprint(set)
  snapshotSet(store, set)
  store.sets.push(set)
  store.nextSeq += 1
  writeStore(store)
  return { ok: true, set }
}

export function sealSet(id: string, actor?: string): { ok: true } | { ok: false; problems: string[] } {
  const store = readStore()
  const set = store.sets.find((s) => s.id === id)
  if (!set) return { ok: false, problems: [`评测集不存在：${id}`] }
  if (set.sealed) return { ok: false, problems: ['评测集已密封'] }
  set.sealed = true
  if (actor) set.createdBy = set.createdBy ?? actor
  writeStore(store)
  return { ok: true }
}

/**
 * Rubric 修订（Rubric Loop 的落库动作）。
 * 结构性阻断：密封集改题必须先有该断言的 RubricIterationLog 留痕（finding 明示
 * judge_wrong/rubric_ambiguous）——只修 Agent 不留痕的"改题凑分"路径在此被拒绝。
 */
export function reviseRubric(
  setId: string,
  taskId: string,
  assertionId: string,
  revision: string,
  iterationId?: string,
): { ok: true; set: EvalSet } | { ok: false; problems: string[] } {
  const store = readStore()
  const set = store.sets.find((s) => s.id === setId)
  if (!set) return { ok: false, problems: [`评测集不存在：${setId}`] }
  const task = set.tasks.find((t) => t.id === taskId)
  if (!task) return { ok: false, problems: [`任务不存在：${taskId}`] }
  const assertion = task.rubric.find((a) => a.id === assertionId)
  if (!assertion) return { ok: false, problems: [`断言不存在：${assertionId}`] }
  if (typeof revision !== 'string' || !revision.trim()) return { ok: false, problems: ['revision 必填'] }

  if (set.sealed) {
    const iteration = iterationId
      ? store.rubricIterations.find((it) => it.id === iterationId && it.taskId === taskId && it.assertionId === assertionId)
      : store.rubricIterations.find((it) => it.taskId === taskId && it.assertionId === assertionId)
    if (!iteration) {
      return {
        ok: false,
        problems: ['密封集改题须先落 RubricIterationLog（归因双 Loop 留痕），拒绝无留痕改题'],
      }
    }
  }
  const iter = store.rubricIterations.find(
    (it) => itIdMatches(it, iterationId, taskId, assertionId),
  )
  if (iter && typeof revision === 'string') iter.revision = revision

  assertion.text = revision.trim()
  bumpSetAsset(store, set)
  writeStore(store)
  return { ok: true, set }
}

function itIdMatches(it: RubricIterationLog, iterationId: string | undefined, taskId: string, assertionId: string): boolean {
  if (iterationId) return it.id === iterationId
  return it.taskId === taskId && it.assertionId === assertionId
}

// ---------- 运行 ----------

export function appendRun(run: EvalRun): void {
  const store = readStore()
  store.runs.push(run)
  writeStore(store)
}

export function getRun(id: string): EvalRun | undefined {
  return readStore().runs.find((r) => r.id === id)
}

export function listRuns(setId?: string): EvalRun[] {
  const store = readStore()
  return setId ? store.runs.filter((r) => r.setId === setId) : store.runs
}

/** 密封集尝试计数（防探测契约 3：每调用方每集上限）。 */
export function sealedAttemptCount(setId: string, actor: string): number {
  const store = readStore()
  return store.runs.filter((r) => r.setId === setId && r.createdBy === actor).length
}

// ---------- 考卷版本快照（收口轮） ----------

/**
 * 某集的全部版本快照（升序）。历史集在快照功能上线前改过题，旧版内容不可恢复；
 * 只把「当前版本」按现状补成一条视图（不落盘），不伪造历史。
 */
export function listSetRevisions(setId: string): EvalSetRevision[] {
  const store = readStore()
  const archived = store.revisions
    .filter((r) => r.setId === setId)
    .sort((a, b) => a.revision - b.revision)
  const set = store.sets.find((s) => s.id === setId)
  if (set && !archived.some((r) => r.revision === set.revision)) {
    archived.push({
      setId: set.id,
      revision: set.revision,
      contentHash: set.contentHash,
      tasks: JSON.parse(JSON.stringify(set.tasks)) as EvalTask[],
      createdAt: set.createdAt,
      ...(set.createdBy ? { createdBy: set.createdBy } : {}),
    })
  }
  return archived
}

export function getSetRevision(setId: string, revision: number): EvalSetRevision | undefined {
  return listSetRevisions(setId).find((r) => r.revision === revision)
}

// ---------- 处置单（收口轮） ----------

export interface CreateRemediationInput {
  runId: string
  taskId: string
  sampleIdx?: number
  note?: string
  owner?: string
  createdBy?: string
}

/**
 * 建处置单：只对真实失败样本开放（已通过样本拒绝），同一 run+task+sample 幂等。
 * 密封集拒绝——任务/样本是否存在本身是可探测信息。
 */
export function createRemediation(
  input: CreateRemediationInput,
): { ok: true; remediation: RemediationRecord; created: boolean } | { ok: false; problems: string[] } {
  const store = readStore()
  const run = store.runs.find((r) => r.id === input.runId)
  if (!run) return { ok: false, problems: [`运行不存在：${input.runId}`] }
  const set = store.sets.find((s) => s.id === run.setId)
  if (!set) return { ok: false, problems: [`评测集不存在：${run.setId}`] }
  if (set.sealed) return { ok: false, problems: ['密封集不提供逐样本处置（防探测）'] }
  if (!set.tasks.some((t) => t.id === input.taskId)) return { ok: false, problems: [`任务不存在：${input.taskId}`] }
  if (!Number.isInteger(input.sampleIdx ?? 1) || (input.sampleIdx !== undefined && input.sampleIdx < 1)) {
    return { ok: false, problems: ['sampleIdx 须为 ≥1 的整数'] }
  }
  const attempts = run.attempts.filter((a) => a.taskId === input.taskId
    && (input.sampleIdx === undefined || a.sampleIdx === input.sampleIdx))
  if (attempts.length === 0) return { ok: false, problems: [`样本不存在：${input.taskId}${input.sampleIdx ? `#${input.sampleIdx}` : ''}`] }
  if (!attempts.some((a) => a.passed === false)) {
    return { ok: false, problems: ['该样本已通过，无需处置单'] }
  }

  const existing = store.remediations.find((r) => r.runId === input.runId && r.taskId === input.taskId
    && (r.sampleIdx ?? null) === (input.sampleIdx ?? null))
  if (existing) return { ok: true, remediation: existing, created: false }

  const now = Date.now()
  const remediation: RemediationRecord = {
    id: `rem-${String(store.nextSeq).padStart(4, '0')}`,
    runId: run.id,
    setId: run.setId,
    setHash: run.setHash ?? set.contentHash,
    ...(run.setRevision !== undefined ? { setRevision: run.setRevision } : {}),
    taskId: input.taskId,
    ...(input.sampleIdx !== undefined ? { sampleIdx: input.sampleIdx } : {}),
    status: 'open',
    rerunCount: 0,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    ...(input.owner?.trim() ? { owner: input.owner.trim() } : {}),
    createdAt: now,
    updatedAt: now,
    ...(input.createdBy ? { createdBy: input.createdBy } : {}),
  }
  store.remediations.push(remediation)
  store.nextSeq += 1
  writeStore(store)
  return { ok: true, remediation, created: true }
}

export function listRemediations(filter: { runId?: string; setId?: string; status?: string } = {}): RemediationRecord[] {
  const store = readStore()
  return store.remediations.filter((r) => (!filter.runId || r.runId === filter.runId)
    && (!filter.setId || r.setId === filter.setId)
    && (!filter.status || r.status === filter.status))
}

export function getRemediation(id: string): RemediationRecord | undefined {
  return readStore().remediations.find((r) => r.id === id)
}

/**
 * 复评验证：只认同一评测集、同一指纹、同一版本的复评运行；该任务任一样本通过
 * 且整轮无红线否决才关闭。没有手工关闭入口——关闭必须由复跑结果决定。
 */
export function verifyRemediation(
  id: string,
  rerunRunId: string,
): { ok: true; remediation: RemediationRecord; closed: boolean; alreadyClosed: boolean } | { ok: false; problems: string[] } {
  const store = readStore()
  const remediation = store.remediations.find((r) => r.id === id)
  if (!remediation) return { ok: false, problems: [`处置单不存在：${id}`] }
  if (remediation.status === 'closed') return { ok: true, remediation, closed: true, alreadyClosed: true }
  const rerun = store.runs.find((r) => r.id === rerunRunId)
  if (!rerun) return { ok: false, problems: [`复评运行不存在：${rerunRunId}`] }
  // 复评必须是建单之后的运行：拿建单前的旧通过运行来关闭，等于没修也放行。
  if (rerun.createdAt < remediation.createdAt) {
    return { ok: false, problems: ['复评运行早于处置单创建时间，不能作为修复证据'] }
  }
  if (rerun.setId !== remediation.setId) {
    return { ok: false, problems: [`复评须同一评测集：${remediation.setId} ≠ ${rerun.setId}`] }
  }
  if (!rerun.setHash || rerun.setHash !== remediation.setHash) {
    return { ok: false, problems: ['复评考卷指纹与处置单不一致（集已改版，不能视为同卷复评）'] }
  }
  if (remediation.setRevision !== undefined && rerun.setRevision !== undefined
    && rerun.setRevision !== remediation.setRevision) {
    return { ok: false, problems: [`复评须同一考卷版本：r${remediation.setRevision} ≠ r${rerun.setRevision}`] }
  }
  const passed = rerun.attempts.some((a) => a.taskId === remediation.taskId && a.passed === true)
  const closed = passed && !rerun.aggregates.riskVeto
  const now = Date.now()
  remediation.rerunCount += 1
  remediation.rerunRunId = rerun.id
  remediation.lastRerunPassed = passed
  remediation.updatedAt = now
  if (closed) {
    remediation.status = 'closed'
    remediation.closedAt = now
  }
  writeStore(store)
  return { ok: true, remediation, closed, alreadyClosed: false }
}

// ---------- 任务追加（红队变体扩产，百度轮后续批 B6） ----------

/**
 * 向开放集追加任务（按 id 去重，幂等）。资产语义：扩产后 bump 指纹/修订号。
 * 与 reflow 分离：reflow 带线上坏例溯源（origin），本函数是资产扩产，不混口径。
 */
export function appendTasksToSet(
  setId: string,
  tasks: EvalTask[],
): { ok: true; set: EvalSet; appended: number } | { ok: false; problems: string[] } {
  const store = readStore()
  const set = store.sets.find((s) => s.id === setId)
  if (!set) return { ok: false, problems: [`评测集不存在：${setId}`] }
  if (set.sealed) return { ok: false, problems: ['密封集不可追加任务'] }
  const problems: string[] = []
  tasks.forEach((t, i) => validateTask(t, i, problems))
  if (problems.length) return { ok: false, problems }
  const existing = new Set(set.tasks.map((t) => t.id))
  const fresh = tasks.filter((t) => !existing.has(t.id))
  if (fresh.length > 0) {
    set.tasks.push(...fresh)
    bumpSetAsset(store, set)
    writeStore(store)
  }
  return { ok: true, set, appended: fresh.length }
}

// ---------- 线上证据回填（百度轮后续批 B7） ----------

/** 人工裁决落库：改写 attempt 判词（source='human'）。冲突=人工与既有机判相反。 */
export function recordHumanVerdict(
  runId: string,
  taskId: string,
  sampleIdx: number,
  assertionId: string,
  value: 'yes' | 'no',
  aggregate: (run: EvalRun) => EvalRun,
): { ok: true; run: EvalRun } | { ok: false; problems: string[] } {
  const store = readStore()
  const run = store.runs.find((r) => r.id === runId)
  if (!run) return { ok: false, problems: [`运行不存在：${runId}`] }
  const attempt = run.attempts.find((a) => a.taskId === taskId && a.sampleIdx === sampleIdx)
  if (!attempt) return { ok: false, problems: [`attempt 不存在：${taskId}#${sampleIdx}`] }
  const verdict = attempt.verdicts.find((v) => v.assertionId === assertionId)
  if (!verdict) return { ok: false, problems: [`判词不存在：${assertionId}`] }
  const machine = verdict.value
  // 只记录第一次人工覆盖前的机判：二次改判不覆盖基线，误杀/假通过统计才稳定。
  if (verdict.source !== 'human' && verdict.previousValue === undefined) {
    verdict.previousValue = machine
  }
  verdict.value = value
  verdict.source = 'human'
  verdict.reason = verdict.previousValue !== undefined
    ? `人工仲裁（机判 ${verdict.previousValue} → 人工 ${value}）`
    : `人工仲裁（${value}）`
  if (machine !== 'unknown' && machine !== value) verdict.conflict = true
  else delete verdict.conflict
  const updated = aggregate(run)
  const idx = store.runs.findIndex((r) => r.id === runId)
  store.runs[idx] = updated
  writeStore(store)
  return { ok: true, run: updated }
}

/**
 * 线上证据回填（B7）：写 run.liveEvidence 后重聚合（门禁 qps/response_tier 项
 * 即时转 pass/fail）。与 recordHumanVerdict 同模式：聚合器由调用方注入。
 */
export function recordLiveEvidence(
  runId: string,
  evidence: import('./types').LiveEvidence,
  aggregate: (run: EvalRun) => EvalRun,
): { ok: true; run: EvalRun } | { ok: false; problems: string[] } {
  const store = readStore()
  const run = store.runs.find((r) => r.id === runId)
  if (!run) return { ok: false, problems: [`运行不存在：${runId}`] }
  run.liveEvidence = { ...run.liveEvidence, ...evidence, recordedAt: Date.now() }
  const updated = aggregate(run)
  const idx = store.runs.findIndex((r) => r.id === runId)
  store.runs[idx] = updated
  writeStore(store)
  return { ok: true, run: updated }
}

// ---------- 坏例回流（腾讯：线上坏例转回归样本，防问题回潮） ----------

export interface ReflowInput {
  runId: string
  taskId: string
  sampleIdx?: number
  /** 目标回归集 id；缺省回落「回归样本库」（不存在则按源集轨道创建）。 */
  targetSetId?: string
  actor?: string
}

/** 缺省回归库名（回流端点的落点单一事实源）。 */
export const REGRESSION_SET_NAME = '回归样本库'

export function reflowTaskToSet(
  input: ReflowInput,
): { ok: true; set: EvalSet; created: boolean; taskId: string } | { ok: false; problems: string[] } {
  const store = readStore()
  const run = store.runs.find((r) => r.id === input.runId)
  if (!run) return { ok: false, problems: [`运行不存在：${input.runId}`] }
  const source = store.sets.find((s) => s.id === run.setId)
  if (!source) return { ok: false, problems: [`评测集不存在：${run.setId}`] }
  // 密封集题目内容不出库（防探测契约 1）——回流是内容出库路径，结构性拒绝
  if (source.sealed) return { ok: false, problems: ['密封集题目内容不出库，不可回流'] }
  const task = source.tasks.find((t) => t.id === input.taskId)
  if (!task) return { ok: false, problems: [`任务不存在：${input.taskId}`] }

  let target = input.targetSetId
    ? store.sets.find((s) => s.id === input.targetSetId)
    : store.sets.find((s) => s.name === REGRESSION_SET_NAME && !s.sealed)
  if (input.targetSetId && !target) return { ok: false, problems: [`目标评测集不存在：${input.targetSetId}`] }
  if (target?.id === run.setId) {
    // 自指回流（显式指名，或缺省回归库恰为源集）：任务复制回源集——同题双份进
    // 后续 run 的分母（pass@k 口径被稀释），origin 溯源语义（线上坏例转回归库）
    // 失真——结构性拒绝。
    return { ok: false, problems: ['目标评测集与源集相同（自指回流），拒绝'] }
  }
  if (target?.sealed) return { ok: false, problems: ['目标集已密封，不可追加回流任务'] }
  if (!target) {
    target = {
      id: `eset-${String(store.nextSeq).padStart(3, '0')}`,
      name: REGRESSION_SET_NAME,
      track: source.track,
      ...(source.track === 'process' && source.module ? { module: source.module } : {}),
      sealed: false,
      // 空库 rev 0，首个回流任务入内即 bump 到 1（落盘前不可见）
      contentHash: '',
      revision: 0,
      createdAt: Date.now(),
      ...(input.actor ? { createdBy: input.actor } : {}),
      tasks: [],
    }
    store.sets.push(target)
    store.nextSeq += 1
  }

  const reflowId = `re-${run.id.slice(-6)}-${task.id}`
  if (target.tasks.some((t) => t.id === reflowId)) {
    return { ok: true, set: target, created: false, taskId: reflowId }
  }
  target.tasks.push({
    ...task,
    id: reflowId,
    origin: {
      runId: run.id,
      taskId: task.id,
      ...(typeof input.sampleIdx === 'number' ? { sampleIdx: input.sampleIdx } : {}),
      at: Date.now(),
    },
  })
  bumpSetAsset(store, target)
  writeStore(store)
  return { ok: true, set: target, created: true, taskId: reflowId }
}

// ---------- Rubric Loop 账本 ----------

export function appendIteration(
  input: Omit<RubricIterationLog, 'id' | 'createdAt'>,
): { ok: true; iteration: RubricIterationLog } | { ok: false; problems: string[] } {
  const store = readStore()
  const run = store.runs.find((r) => r.id === input.runId)
  if (!run) return { ok: false, problems: [`运行不存在：${input.runId}`] }
  const set = store.sets.find((s) => s.id === run.setId)
  if (!set) return { ok: false, problems: [`评测集不存在：${run.setId}`] }
  const task = set.tasks.find((t) => t.id === input.taskId)
  if (!task) return { ok: false, problems: [`任务不存在：${input.taskId}`] }
  if (!task.rubric.some((a) => a.id === input.assertionId)) {
    return { ok: false, problems: [`断言不存在：${input.assertionId}`] }
  }
  if (input.finding !== 'judge_wrong' && input.finding !== 'rubric_ambiguous') {
    return { ok: false, problems: ['finding 须为 judge_wrong/rubric_ambiguous'] }
  }
  if (input.verdictAtTime !== 'yes' && input.verdictAtTime !== 'no' && input.verdictAtTime !== 'unknown') {
    return { ok: false, problems: ['verdictAtTime 须为 yes/no/unknown'] }
  }
  const iteration: RubricIterationLog = {
    ...input,
    id: `riter-${String(store.nextSeq).padStart(4, '0')}`,
    createdAt: Date.now(),
  }
  store.rubricIterations.push(iteration)
  store.nextSeq += 1
  writeStore(store)
  return { ok: true, iteration }
}

export function listIterations(runId?: string): RubricIterationLog[] {
  const store = readStore()
  return runId ? store.rubricIterations.filter((it) => it.runId === runId) : store.rubricIterations
}

// ---------- UI Oracle（M3：KuiTest 两阶段用例） ----------

export interface CreateOracleCaseInput {
  name: string
  targetUrl: string
  action: { kind: string; somIndex?: number; selector?: string }
  expectText?: string
}

export function listOracleCases(): OracleCase[] {
  return readStore().oracleCases
}

export function getOracleCase(id: string): OracleCase | undefined {
  return readStore().oracleCases.find((c) => c.id === id)
}

export function createOracleCase(
  input: CreateOracleCaseInput,
  createdBy?: string,
): { ok: true; case: OracleCase } | { ok: false; problems: string[] } {
  const problems: string[] = []
  const name = (input?.name ?? '').trim()
  if (!name || name.length > 64) problems.push('name 必填（≤64 字符）')
  const url = (input?.targetUrl ?? '').trim()
  if (!/^https?:\/\//.test(url)) problems.push('targetUrl 须为 http(s) 地址')
  if (input?.action?.kind !== 'click') problems.push('action.kind v1 仅支持 click')
  const hasSelector = typeof input?.action?.selector === 'string' && input.action.selector.trim()
  const som = input?.action?.somIndex
  if (!hasSelector && !(typeof som === 'number' && Number.isInteger(som) && som >= 1)) {
    problems.push('action 须带 selector 或 somIndex(≥1)')
  }
  if (problems.length) return { ok: false, problems }
  const store = readStore()
  const oracleCase: OracleCase = {
    id: `oracle-${String(store.nextSeq).padStart(3, '0')}`,
    name,
    targetUrl: url,
    action: {
      kind: 'click',
      ...(hasSelector ? { selector: input.action.selector!.trim() } : { somIndex: som as number }),
    },
    ...(input.expectText?.trim() ? { expectText: input.expectText.trim() } : {}),
    createdAt: Date.now(),
    ...(createdBy ? { createdBy } : {}),
  }
  store.oracleCases.push(oracleCase)
  store.nextSeq += 1
  writeStore(store)
  return { ok: true, case: oracleCase }
}

export function appendOracleRun(record: OracleRunRecord): void {
  const store = readStore()
  store.oracleRuns.push(record)
  writeStore(store)
}

export function listOracleRuns(caseId?: string): OracleRunRecord[] {
  const store = readStore()
  return caseId ? store.oracleRuns.filter((r) => r.caseId === caseId) : store.oracleRuns
}

/** 导入导出（仅非密封集：密封集内容不出库）。 */
export function exportSet(id: string): { ok: true; set: EvalSet } | { ok: false; problems: string[] } {
  const set = getSet(id)
  if (!set) return { ok: false, problems: [`评测集不存在：${id}`] }
  if (set.sealed) return { ok: false, problems: ['密封集不可导出（内容永不出库）'] }
  return { ok: true, set }
}

// ---------- 审计快照（指标消费证据 / 能力维度覆盖） ----------

export interface AuditSnapshot {
  runs: EvalRun[]
  iterationCount: number
  /** 带 origin 的回流任务数（跨集；溯源是回流动作的消费证据）。 */
  reflowCount: number
  /** 显式标注维度的任务数（数据集治理动作已发生）。 */
  dimensionTaggedTasks: number
  /** 供覆盖度计算；只在服务端内部使用，不直接出 API。 */
  sets: EvalSet[]
}

/** 服务端内审计快照（只读；不改变密封契约——内容不出对外 API 面）。 */
export function auditSnapshot(): AuditSnapshot {
  const store = readStore()
  let reflowCount = 0
  let dimensionTaggedTasks = 0
  for (const set of store.sets) {
    for (const task of set.tasks) {
      if (task.origin) reflowCount += 1
      if (task.dimension) dimensionTaggedTasks += 1
    }
  }
  return {
    runs: store.runs,
    iterationCount: store.rubricIterations.length,
    reflowCount,
    dimensionTaggedTasks,
    sets: store.sets,
  }
}

/** 测试隔离。 */
export function _useStoreDirForTests(dir: string): void {
  process.env.EVAL_STORE = dir
}

/** 测试便利：store 文件是否已落盘（校验原子写路径）。 */
export function _storeFileExistsForTests(): boolean {
  return existsSync(storePath())
}
