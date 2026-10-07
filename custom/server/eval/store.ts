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
  EvalRun, EvalSet, EvalSetMeta, EvalTask, RubricAssertion, RubricIterationLog,
} from './types'
import type { OracleCase, OracleRunRecord } from './uioracle'

interface StoreShape {
  sets: EvalSet[]
  runs: EvalRun[]
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
      return { sets: [], runs: [], rubricIterations: [], oracleCases: [], oracleRuns: [], nextSeq: 1 }
    }
    throw e
  }
  return {
    sets: Array.isArray(raw.sets) ? raw.sets : [],
    runs: Array.isArray(raw.runs) ? raw.runs : [],
    rubricIterations: Array.isArray(raw.rubricIterations) ? raw.rubricIterations : [],
    oracleCases: Array.isArray(raw.oracleCases) ? raw.oracleCases : [],
    oracleRuns: Array.isArray(raw.oracleRuns) ? raw.oracleRuns : [],
    nextSeq: typeof raw.nextSeq === 'number' ? raw.nextSeq : 1,
  }
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
    } else {
      problems.push(`断言 #${i} s0.kind 须为 regex/threshold`)
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
    createdAt: Date.now(),
    createdBy,
    tasks: input.tasks as EvalTask[],
  }
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
  verdict.value = value
  verdict.source = 'human'
  if (machine !== 'unknown' && machine !== value) verdict.conflict = true
  else delete verdict.conflict
  const updated = aggregate(run)
  const idx = store.runs.findIndex((r) => r.id === runId)
  store.runs[idx] = updated
  writeStore(store)
  return { ok: true, run: updated }
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

/** 测试隔离。 */
export function _useStoreDirForTests(dir: string): void {
  process.env.EVAL_STORE = dir
}

/** 测试便利：store 文件是否已落盘（校验原子写路径）。 */
export function _storeFileExistsForTests(): boolean {
  return existsSync(storePath())
}
