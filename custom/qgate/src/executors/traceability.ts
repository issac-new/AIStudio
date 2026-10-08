// traceability executor（v0.3 §4.1，上游 RTM 元门本地方言）：
// 需求追溯矩阵的确定性核验——每条验收条件（AC）必须有实现代码与新鲜 PASS 的验证门。
//   codeFiles 逐条存在（防路径逃逸）；
//   testGateIds 指向的门最新判定为 PASS 且证据仍新鲜（isFresh 快照/三锚）；
//   需求级 prdRef 存在、requiredTypes 被 AC type 覆盖。
// 元门语义：本 executor 读 store 里其他门的判定，门声明须带 meta: true（CLI 排后执行）。
// 登记缺失/畸形 → error（INCONCLUSIVE）；任一 AC 未过 → FAIL 并指名。

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Evidence, ExecutorSpec, GateSpec } from '../core/types.js'
import { isRecord } from '../core/parse.js'
import { isInside } from '../core/safe-path.js'
import { loadProject } from '../core/loader.js'
import { isFresh, latestRuns, loadRun, loadRunEvidence, storePaths } from '../core/store.js'
import { inputGlobsOf, listWorkspaceFiles, snapshotForGlobs } from '../core/snapshot.js'

export interface TraceabilityExecutorInput {
  runId: string
  gateId: string
  workspace: string
  qgateDir: string
  commit?: string
  treeHash?: string
  changedPaths?: readonly string[]
}

interface AcceptanceCriterion {
  id: string
  codeFiles: string[]
  testGateIds: string[]
  type?: string
  /** 用例绑定（v0.3.1，上游 v1.31 cases 本地方言）：AC → 绑定门内真实执行且通过的用例身份。
      gateId 必须在本 AC 的 testGateIds 内（绑定深化既有门关联，不另立关联）。 */
  cases?: Array<{ gateId: string; caseIds: string[] }>
}

interface Requirement {
  id: string
  prdRef?: string
  requiredTypes: string[]
  acceptanceCriteria: AcceptanceCriterion[]
}

function strListOf(v: unknown, max: number): string[] | undefined {
  if (!Array.isArray(v) || v.length > max) return undefined
  const out: string[] = []
  for (const x of v) {
    if (typeof x !== 'string' || x.length === 0) return undefined
    out.push(x)
  }
  return out
}

function parseRequirements(raw: unknown): Requirement[] | { error: string } {
  const list = isRecord(raw) ? raw.requirements : raw
  if (!Array.isArray(list) || list.length === 0 || list.length > 100) {
    return { error: 'requirements must be a non-empty array (≤100) or {requirements:[...]}' }
  }
  const out: Requirement[] = []
  for (const [i, r] of list.entries()) {
    if (!isRecord(r)) return { error: `requirements[${i}] not an object` }
    const id = typeof r.id === 'string' && r.id.length > 0 ? r.id : `REQ-${i + 1}`
    const prdRef = typeof r.prdRef === 'string' ? r.prdRef : undefined
    const requiredTypes = r.requiredTypes === undefined ? [] : strListOf(r.requiredTypes, 20)
    if (requiredTypes === undefined) return { error: `${id}: requiredTypes invalid` }
    if (!Array.isArray(r.acceptanceCriteria) || r.acceptanceCriteria.length === 0) {
      return { error: `${id}: acceptanceCriteria missing or empty` }
    }
    const acs: AcceptanceCriterion[] = []
    for (const [j, a] of r.acceptanceCriteria.entries()) {
      if (!isRecord(a)) return { error: `${id}.acceptanceCriteria[${j}] not an object` }
      const acId = typeof a.id === 'string' && a.id.length > 0 ? a.id : `${id}-AC-${j + 1}`
      const codeFiles = strListOf(a.codeFiles, 50)
      const testGateIds = strListOf(a.testGateIds, 20)
      if (!codeFiles || codeFiles.length === 0) return { error: `${acId}: codeFiles missing` }
      if (!testGateIds || testGateIds.length === 0) return { error: `${acId}: testGateIds missing` }
      const type = typeof a.type === 'string' ? a.type : undefined
      // cases 绑定形状校验（fail-closed）：gateId ⊆ testGateIds、1..20 绑定、gateId 唯一、
      // caseIds 1..50 唯一非空——畸形登记即 error（INCONCLUSIVE），不静默忽略。
      let caseBindings: AcceptanceCriterion['cases']
      if (a.cases !== undefined) {
        if (!Array.isArray(a.cases) || a.cases.length === 0 || a.cases.length > 20) {
          return { error: `${acId}: cases must be an array of 1..20 bindings` }
        }
        const seen = new Set<string>()
        caseBindings = []
        for (const [k, b] of a.cases.entries()) {
          if (!isRecord(b)) return { error: `${acId}.cases[${k}] not an object` }
          const gateId = typeof b.gateId === 'string' ? b.gateId : ''
          if (!gateId || !testGateIds.includes(gateId)) {
            return { error: `${acId}.cases[${k}]: gateId '${gateId}' must be within this AC's testGateIds` }
          }
          if (seen.has(gateId)) return { error: `${acId}.cases[${k}]: duplicate gateId '${gateId}'` }
          seen.add(gateId)
          const caseIds = strListOf(b.caseIds, 50)
          if (!caseIds || caseIds.length === 0) return { error: `${acId}.cases[${k}] (${gateId}): caseIds must be 1..50 unique non-empty strings` }
          if (new Set(caseIds).size !== caseIds.length) return { error: `${acId}.cases[${k}] (${gateId}): duplicate caseIds` }
          caseBindings.push({ gateId, caseIds })
        }
      }
      acs.push({ id: acId, codeFiles, testGateIds, type, cases: caseBindings })
    }
    out.push({ id, prdRef, requiredTypes, acceptanceCriteria: acs })
  }
  return out
}

export function runTraceabilityExecutor(executor: ExecutorSpec, input: TraceabilityExecutorInput): Evidence {
  const startedAt = Date.now()
  const ev: Evidence = {
    id: `ev-${randomUUID().slice(0, 12)}-rtm`,
    runId: input.runId,
    gateId: input.gateId,
    type: executor.evidenceType,
    producer: executor.id,
    result: 'error',
    execution: 'wired',
    independence: 'spec-derived',
    provenance: { startedAt, commit: input.commit, cwd: input.workspace },
  }
  const err = (summary: string): Evidence => {
    ev.summary = summary.slice(0, 400)
    ev.provenance.endedAt = Date.now()
    return ev
  }

  const rel = executor.requirementsFile ?? join('.qgate', 'registers', 'requirements.json')
  const file = join(input.workspace, rel)
  if (!existsSync(file)) {
    return err(`requirements register missing: ${rel} → declare PRD→AC→code→gate traceability first (INCONCLUSIVE, not pass)`)
  }
  let requirements: Requirement[]
  try {
    const parsed = parseRequirements(JSON.parse(readFileSync(file, 'utf8')))
    if ('error' in parsed) return err(`requirements register invalid: ${parsed.error}`)
    requirements = parsed
  } catch (e) {
    return err(`requirements register malformed: ${(e as Error).message}`)
  }

  const project = loadProject(input.workspace)
  const gatesById = new Map<string, GateSpec>((project?.gates ?? []).map((g) => [g.metadata.id, g]))
  const paths = storePaths(input.qgateDir)
  const state = latestRuns(paths)
  const now = Date.now()
  const sharedFiles = listWorkspaceFiles(input.workspace)
  const problems: string[] = []
  let acTotal = 0
  let boundCases = 0

  for (const req of requirements) {
    if (req.prdRef) {
      const prdFile = req.prdRef.split('#')[0]
      const resolved = join(input.workspace, prdFile)
      if (!isInside(input.workspace, resolved) || !existsSync(resolved)) {
        problems.push(`${req.id}: prdRef target missing: ${prdFile}`)
      }
    } else {
      problems.push(`${req.id}: prdRef missing`)
    }
    for (const ac of req.acceptanceCriteria) {
      acTotal++
      boundCases += (ac.cases ?? []).reduce((n, b) => n + b.caseIds.length, 0)
      for (const cf of ac.codeFiles) {
        const resolved = join(input.workspace, cf)
        if (!isInside(input.workspace, resolved)) {
          problems.push(`${ac.id}: codeFile escapes workspace: ${cf}`)
        } else if (!existsSync(resolved)) {
          problems.push(`${ac.id}: codeFile missing: ${cf}`)
        }
      }
      for (const gid of ac.testGateIds) {
        const spec = gatesById.get(gid)
        if (!spec) { problems.push(`${ac.id}: testGate unknown: ${gid}`); continue }
        const entry = state[gid]
        if (!entry) { problems.push(`${ac.id}: testGate never run: ${gid}`); continue }
        if (entry.verdict !== 'PASS') { problems.push(`${ac.id}: testGate ${gid} verdict=${entry.verdict} (need PASS)`); continue }
        const run = loadRun(paths, entry.runId)
        if (!run) { problems.push(`${ac.id}: testGate ${gid} run unreadable`); continue }
        const globs = inputGlobsOf(spec)
        const currentSnapshot = globs.length > 0 ? snapshotForGlobs(input.workspace, globs, sharedFiles) : undefined
        const fresh = isFresh(run, now, {
          commit: input.commit,
          treeHash: input.treeHash,
          changedPaths: input.changedPaths ?? [],
          appliesWhen: spec.spec.appliesWhen,
          inputSnapshot: currentSnapshot,
        }, spec.spec.policy.maxAgeHours ?? 24)
        if (!fresh) problems.push(`${ac.id}: testGate ${gid} evidence stale (re-run it)`)
      }
      // AC→用例绑定复核（v0.3.1）：绑定门当轮证据中的逐用例身份逐条核对——
      // 无关成功门禁（只 exit 0 的 command）从此不能充当 AC 证据。
      // 用例身份来源=证据 caseOutcomes（command+rawOutput 重解析 / behavior cases 深比较）；
      // 无该协议的证据形状落在 acCaseMissing（如实边界，不猜测形状）。
      if (executor.requireCaseBinding && !ac.cases?.length) {
        problems.push(`${ac.id}: acCaseUnbound (requireCaseBinding on — bind this AC to real case ids in the bound gate's evidence)`)
      }
      for (const binding of ac.cases ?? []) {
        const entry = state[binding.gateId]
        const run = entry ? loadRun(paths, entry.runId) : undefined
        // 绑定门已在 testGateIds 循环核过 PASS+fresh；此处只做逐用例身份复核
        const outcomes = new Map<string, 'pass' | 'fail' | 'skip'>()
        if (run) {
          for (const e of loadRunEvidence(paths, run.runId)) {
            for (const c of e.caseOutcomes ?? []) {
              const prev = outcomes.get(c.id)
              // fail-closed 合并：同 id 冲突取更差（fail > skip > pass）
              const worse = prev === 'fail' || c.status === 'fail' ? 'fail' : prev === 'skip' || c.status === 'skip' ? 'skip' : 'pass'
              outcomes.set(c.id, worse)
            }
          }
        }
        for (const caseId of binding.caseIds) {
          const st = outcomes.get(caseId)
          if (st === undefined) problems.push(`${ac.id}: acCaseMissing ${caseId} (bound gate ${binding.gateId} reported no such case this run — an unrelated passing gate is not AC evidence)`)
          else if (st === 'skip') problems.push(`${ac.id}: acCaseSkipped ${caseId} (a skipped case is not a pass)`)
          else if (st === 'fail') problems.push(`${ac.id}: acCaseFailed ${caseId} (bound gate ${binding.gateId})`)
        }
      }
    }
    const coveredTypes = new Set(req.acceptanceCriteria.map((a) => a.type).filter((t): t is string => !!t))
    const missingTypes = req.requiredTypes.filter((t) => !coveredTypes.has(t))
    if (missingTypes.length > 0) problems.push(`${req.id}: requiredTypes not covered by AC types: ${missingTypes.join(', ')}`)
  }

  ev.provenance.endedAt = Date.now()
  ev.execution = 'exercised'
  if (problems.length > 0) {
    ev.result = 'fail'
    ev.summary = `${problems.length} traceability problem(s) across ${acTotal} ACs: ${problems.slice(0, 8).join(' | ')}${problems.length > 8 ? ` …+${problems.length - 8}` : ''}`.slice(0, 400)
    ev.provenance.affectedPaths = problems.slice(0, 50)
    return ev
  }
  ev.result = 'pass'
  ev.summary = `${requirements.length} requirements / ${acTotal} ACs fully traced (codeFiles exist, linked gates PASS & fresh, prdRefs resolve${boundCases > 0 ? `, ${boundCases} case bindings verified` : ''})`
  return ev
}
