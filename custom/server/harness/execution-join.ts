// overlay/harness：执行关联单点归并（W3 执行观测贯通，2026-11-04）。
//
// 来源：vivo《面向技术产品经理的 Agent Harness 设计》08 节——「如果一条需求
// 建议被退回，团队应可沿一条记录还原它用了哪个输入、调了什么工具、何处重试、
// 批单是谁批的」。现状：执行记录/工具审计/执法批单/结果投影分属四个端点，
// 排障要手工对 runId 拼。本端点按 runId/taskId 一次归并四源，每源缺失
// {available:false, reason}——fail-soft，不猜数。
//
// 文件面纪律：执法批单存储 JSON 直读（不在 enforce-approvals.ts 加函数——
// 该文件属 W2 批）；resultContract 经动态 import 消费（W2 批合入前缺位=
// available:false，合入后自动接通）。
import { existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { readExecutionRecords, type ExecutionRecord } from '../execution-records/record'
import { queryToolExecAudit, type ToolExecAuditEntry } from '../toolpipeline/tool-hooks'
import { deriveRunResult, type RunResult, type QualityStatus } from './run-result'

export interface ExecutionJoinSource<T> {
  available: boolean
  reason?: string
  entries?: T
}

export interface ExecutionJoinResult {
  ok: true
  runId?: string
  taskId?: string
  executionRecords: ExecutionJoinSource<ExecutionRecord[]>
  toolAudit: ExecutionJoinSource<ToolExecAuditEntry[]>
  enforceApprovals: ExecutionJoinSource<Array<Record<string, unknown>>>
  resultContract: ExecutionJoinSource<Record<string, unknown>>
  /** Run Result 四维：由上面四源派生，任一侧缺席只影响该维（fail-soft）。 */
  runResult: RunResult
}

/** 执法批单 JSON 直读（与 enforce-approvals.ts 同一存储、只读、fail-soft）。 */
function readEnforceApprovalStore(): Record<string, Record<string, unknown>> | null {
  try {
    const dir = process.env.HERMES_ENFORCE_APPROVALS_DIR?.trim() || join(tmpdir(), 'hermes-enforce-approvals')
    const file = join(dir, 'enforce-approvals.json')
    if (!existsSync(file)) return null
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { records?: Record<string, Record<string, unknown>> }
    return parsed.records ?? {}
  } catch {
    return null
  }
}

/**
 * 单点归并：runId/taskId 至少给一个。
 * 每源独立 fail-soft——单源缺席不 500、不阻塞其他源。
 */
export async function executionJoin(query: {
  runId?: string
  taskId?: string
  board?: string
  days?: number
  limit?: number
}): Promise<ExecutionJoinResult> {
  const runId = query.runId?.trim() || undefined
  const taskId = query.taskId?.trim() || undefined
  const days = Math.min(90, Math.max(1, Math.round(query.days ?? 7)))
  const limit = Math.min(500, Math.max(1, Math.round(query.limit ?? 100)))
  const base = { ok: true as const, runId, taskId }

  // 1) 中央执行记录索引
  let executionRecords: ExecutionJoinSource<ExecutionRecord[]>
  try {
    const matched = readExecutionRecords({ days })
      .filter((r) => (runId ? r.runId === runId : true) && (taskId ? r.taskId === taskId : true))
      .slice(0, limit)
    executionRecords = matched.length > 0
      ? { available: true, entries: matched }
      : { available: false, reason: '窗口内无匹配记录' }
  } catch (e) {
    executionRecords = { available: false, reason: `读取失败：${e instanceof Error ? e.message : String(e)}` }
  }

  // 2) 工具执行审计（支持 runId 过滤）
  let toolAudit: ExecutionJoinSource<ToolExecAuditEntry[]>
  try {
    const audit = queryToolExecAudit({ days, limit, ...(runId ? { runId } : {}) })
    toolAudit = audit.entries.length > 0
      ? { available: true, entries: audit.entries }
      : { available: false, reason: '窗口内无匹配审计行' }
  } catch (e) {
    toolAudit = { available: false, reason: `读取失败：${e instanceof Error ? e.message : String(e)}` }
  }

  // 3) 执法批单（JSON 直读；v1 旧档无 runId 字段=按 runId 查不到属未知面如实呈现）
  let enforceApprovals: ExecutionJoinSource<Array<Record<string, unknown>>>
  const store = readEnforceApprovalStore()
  if (!store) {
    enforceApprovals = { available: false, reason: '执法批单存储缺席（无挂单或未启用执法）' }
  } else {
    // 批单记录按 runId 归并（记录无 taskId 维度——W2 起挂 runId/requestedBy）。
    const matched = runId
      ? Object.values(store)
          .filter((r) => r.runId === runId)
          .sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0))
          .slice(0, limit)
      : []
    enforceApprovals = matched.length > 0
      ? { available: true, entries: matched }
      : { available: false, reason: runId ? '该 run 无执法批单（或旧档未记 runId）' : '批单归并须提供 runId' }
  }

  // 4) 结果协议投影（W2 批产物；合入前缺位=available:false，合入后自动接通）
  let resultContract: ExecutionJoinSource<Record<string, unknown>>
  if (!taskId) {
    resultContract = { available: false, reason: '未提供 taskId（结果投影按任务派生）' }
  } else {
    try {
      const mod = (await import('../services/hermes/kanban-task-fast')) as {
        readTaskDetailFast?: (id: string, board?: string) => { resultContract?: unknown } | null
      }
      if (typeof mod.readTaskDetailFast !== 'function') {
        resultContract = { available: false, reason: '任务详情快道不可用' }
      } else {
        const detail = mod.readTaskDetailFast(taskId, query.board)
        resultContract = detail?.resultContract
          ? { available: true, entries: detail.resultContract as Record<string, unknown> }
          : { available: false, reason: '该任务无结果投影（源不足以成形）' }
      }
    } catch (e) {
      resultContract = { available: false, reason: `结果投影不可用：${e instanceof Error ? e.message : String(e)}` }
    }
  }

  // 5) Run Result 四维（2026-11-12 handbook 吸收）：派生而非新事实源。
  const latestRecord = executionRecords.available ? executionRecords.entries?.[0] : undefined
  const missingEvidence: string[] = []
  if (!executionRecords.available) missingEvidence.push('execution-record')
  if (!toolAudit.available) missingEvidence.push('tool-audit')
  if (!resultContract.available) missingEvidence.push('result-contract')
  const contractVerdict = resultContract.available && resultContract.entries
    ? (resultContract.entries.verdict ?? resultContract.entries.status ?? resultContract.entries.quality)
    : undefined
  const runResult = deriveRunResult({
    execution: latestRecord
      ? {
          outcome: latestRecord.outcome,
          exitCode: latestRecord.exitCode,
          reason: latestRecord.reason,
          recordId: latestRecord.runId,
        }
      : null,
    simulation: null,
    evidence: {
      source: 'execution-join',
      missing: missingEvidence,
      completeness: missingEvidence.length === 0 ? 'complete' : (executionRecords.available || toolAudit.available ? 'partial' : 'unknown'),
      evidenceRefs: [
        ...(executionRecords.available ? (executionRecords.entries ?? []).map((r) => `record:${r.runId}`) : []),
        ...(toolAudit.available ? (toolAudit.entries ?? []).map((e) => `tool-audit:${e.tool}:${e.argDigest ?? e.ts}`) : []),
      ],
    },
    quality: contractVerdict != null
      ? { verdict: String(contractVerdict) as QualityStatus, source: 'result-contract', evidenceRefs: [`task:${taskId}`] }
      : null,
  })

  return { ...base, executionRecords, toolAudit, enforceApprovals, resultContract, runResult }
}
