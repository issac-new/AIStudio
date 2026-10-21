// overlay/secaudit 域：引擎（项目/运行/裁决/复核/报告的编排，全部纯函数+store 读写）。
import { createHash } from 'node:crypto'
import type {
  AuditProject, AuditRun, RuleResult, SecAuditFinding, SurfaceClass,
} from './types'
import { ruleProblems } from './types'
import { SURFACE_CATALOG, surfaceClasses } from './catalog'
import { buildCoverageLedger, type AutoEvidence } from './coverage'
import { decideFinding, registerCandidate } from './validate'
import { recordReviewGate, recordReviewSummary, reviewFindingRecord } from './verify'
import { buildReport, reportMarkdown, validateReportSchema } from './report'
import { collectAutoEvidence } from './collectors'
import { getProject, listProjects, saveProject } from './store'

function nowId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/** 目标指纹：target+surfaces 的组合哈希（跨 run 判断"目标是否变了"）。 */
function targetFingerprintOf(target: AuditProject['target'], surfaces: SurfaceClass[]): string {
  return createHash('sha1').update(JSON.stringify({
    kind: target.kind,
    hermesHome: target.hermesHome ?? '',
    workspace: target.workspace ?? '',
    surfaces: [...surfaces].sort(),
  })).digest('hex').slice(0, 16)
}

export function targetFingerprint(project: AuditProject): string {
  return targetFingerprintOf(project.target, project.surfaces)
}

export function createProject(input: {
  name: string
  target: AuditProject['target']
  surfaces?: SurfaceClass[]
  createdBy?: string
}): RuleResult<AuditProject> {
  if (!input.name?.trim()) return { ok: false, problems: [{ code: 'missing_name', detail: '项目名必填' }] }
  const surfaces = input.surfaces && input.surfaces.length > 0 ? input.surfaces : surfaceClasses()
  const bad = surfaces.filter((s) => !surfaceClasses().includes(s))
  if (bad.length > 0) return { ok: false, problems: [{ code: 'unknown_surface', detail: `未知攻击面：${bad.join(',')}` }] }
  const target = { ...input.target }
  const project: AuditProject = {
    projectId: nowId('proj'),
    name: input.name.trim(),
    target,
    surfaces,
    fingerprint: targetFingerprintOf(target, surfaces),
    createdAt: Date.now(),
    ...(input.createdBy ? { createdBy: input.createdBy } : {}),
    runs: [],
    findings: [],
    nextSeq: 1,
  }
  saveProject(project)
  return { ok: true, value: project }
}

export function updateProjectTarget(projectId: string, target: Partial<AuditProject['target']>): RuleResult<AuditProject> {
  const got = getProjectOrFail(projectId)
  if (!got.ok) return { ok: false, problems: ruleProblems(got) }
  got.value.target = { ...got.value.target, ...target }
  got.value.fingerprint = targetFingerprint(got.value)
  saveProject(got.value)
  return { ok: true, value: got.value }
}

export function listAllProjects(): AuditProject[] {
  return listProjects()
}

export function getProjectOrFail(projectId: string): RuleResult<AuditProject> {
  const p = getProject(projectId)
  return p ? { ok: true, value: p } : { ok: false, problems: [{ code: 'project_not_found', detail: '项目不存在' }] }
}

/** 内部：取项目，取不到直接抛（调用点已先行校验的场景用）。 */
function projectOrThrow(projectId: string): AuditProject {
  const p = getProject(projectId)
  if (!p) throw new Error('project_not_found')
  return p
}

/** 开跑一轮：冻结目标指纹、构建覆盖账本（自动采集器读数入账；目标变化时旧证据降级）。 */
export async function startRun(projectId: string): Promise<RuleResult<AuditRun>> {
  const got = getProjectOrFail(projectId)
  if (!got.ok) return { ok: false, problems: ruleProblems(got) }
  const project = got.value
  const fingerprint = targetFingerprint(project)
  const run: AuditRun = {
    runId: nowId('run'),
    projectId,
    targetFingerprint: fingerprint,
    startedAt: Date.now(),
    status: 'open',
  }
  const auto = await collectAutoEvidence()
  // 先用当前指纹建账（targetChanged 判定依据 = run.fingerprint vs project.fingerprint）
  run.ledger = buildCoverageLedger(project, run, auto, Date.now())
  project.runs.push(run)
  project.fingerprint = fingerprint
  saveProject(project)
  return { ok: true, value: run }
}

export function submitCandidate(projectId: string, input: {
  surfaceClass: SurfaceClass
  title: string
  detail: string
  traceChain?: string
  observation?: string
  author: string
}): RuleResult<SecAuditFinding> {
  const got = getProjectOrFail(projectId)
  if (!got.ok) return { ok: false, problems: ruleProblems(got) }
  if (!input.author?.trim()) return { ok: false, problems: [{ code: 'missing_author', detail: '候选必须登记发现者' }] }
  if (!input.title?.trim()) return { ok: false, problems: [{ code: 'missing_title', detail: '候选必须登记标题' }] }
  if (!SURFACE_CATALOG.some((d) => d.class === input.surfaceClass)) {
    return { ok: false, problems: [{ code: 'unknown_surface', detail: `未知攻击面：${input.surfaceClass}` }] }
  }
  const result = registerCandidate(got.value, {
    surfaceClass: input.surfaceClass,
    title: input.title.trim(),
    detail: input.detail ?? '',
    ...(input.traceChain ? { traceChain: input.traceChain } : {}),
    ...(input.observation ? { observation: input.observation } : {}),
    author: input.author.trim(),
  }, Date.now())
  if (result.ok) saveProject(got.value)
  return result
}

export function verifyCandidate(projectId: string, findingId: string, input: {
  verifier: string
  status: 'confirmed' | 'needs_validation' | 'rejected'
  refutation?: string
  unknownFact?: string
  severity?: 'high' | 'medium' | 'low'
  defenseInDepth?: boolean
}): RuleResult<SecAuditFinding> {
  const got = getProjectOrFail(projectId)
  if (!got.ok) return { ok: false, problems: ruleProblems(got) }
  if (!input.verifier?.trim()) return { ok: false, problems: [{ code: 'missing_verifier', detail: '必须登记验证者' }] }
  const result = decideFinding(got.value, findingId, { ...input, verifier: input.verifier.trim() }, Date.now())
  if (result.ok) saveProject(got.value)
  return result
}

export function reviewRecord(projectId: string, findingId: string, input: {
  reviewer: string
  outcome: 'verified' | 'replaced'
}): RuleResult<SecAuditFinding> {
  const got = getProjectOrFail(projectId)
  if (!got.ok) return { ok: false, problems: ruleProblems(got) }
  if (!input.reviewer?.trim()) return { ok: false, problems: [{ code: 'missing_reviewer', detail: '必须登记复核者' }] }
  const result = reviewFindingRecord(got.value, findingId, { ...input, reviewer: input.reviewer.trim() }, Date.now())
  if (result.ok) saveProject(got.value)
  return result
}

/** 出报告：先记复核汇总，再校验 schema，最后关 run。 */
export function finalizeRun(projectId: string, runId: string): RuleResult<{ report: unknown; markdown: string; schemaProblems: string[] }> {
  const got = getProjectOrFail(projectId)
  if (!got.ok) return { ok: false, problems: ruleProblems(got) }
  const project = got.value
  const run = project.runs.find((r) => r.runId === runId)
  if (!run) return { ok: false, problems: [{ code: 'run_not_found', detail: '运行不存在' }] }
  if (run.status === 'reported') return { ok: false, problems: [{ code: 'already_reported', detail: '该运行已出报告' }] }
  if (!run.ledger) return { ok: false, problems: [{ code: 'ledger_missing', detail: '覆盖账本缺失（运行未正确初始化）' }] }
  const gate = recordReviewGate(project.findings)
  if (!gate.pass) {
    return {
      ok: false,
      problems: [{
        code: 'record_review_incomplete',
        detail: `以下记录未完成报告期独立复核：${gate.missing.join(',')}`,
      }],
    }
  }
  run.recordReview = recordReviewSummary(project.findings)
  const report = buildReport(project, run, run.ledger)
  const schemaProblems = validateReportSchema(report)
  run.report = report
  run.status = 'reported'
  run.closedAt = Date.now()
  run.endedAt = Date.now()
  saveProject(project)
  return { ok: true, value: { report, markdown: reportMarkdown(report), schemaProblems } }
}

export function runLedger(projectId: string, runId: string): RuleResult<AuditRun> {
  const got = getProjectOrFail(projectId)
  if (!got.ok) return { ok: false, problems: ruleProblems(got) }
  const run = got.value.runs.find((r) => r.runId === runId)
  return run ? { ok: true, value: run } : { ok: false, problems: [{ code: 'run_not_found', detail: '运行不存在' }] }
}
