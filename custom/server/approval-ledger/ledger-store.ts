// overlay/approval-ledger 域（P0b，2026-11-10 执行内核统一批 §6/§8）：统一审批账本。
// 单一事实源=config/execution-contract.json 的 approvalLedger 表；记录三态
// pending/resolved/exempted 同 schema 同账，只差 decidedBy。
// 写入纪律：append-only JSONL（先例=govbus/event-log），原子追加＋环形截断；
// 读取 fail-soft。**本域只记不裁**——裁决权在四挡契约与审批链（P1 合流），账本不阻断任何调用。
// 入口层合成点唯一（spec §8）：Ekko 工具瀑布=tool-hooks；@zcode 派发=mention-dispatch；
// 后续入口（IDE 编程任务/DevTools/acp_send/delegate）在各自批次接入，不得在调用点散落拼记录。
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { underWebUi } from '../lib/paths'
import {
  loadExecutionContract, recordTypeForMode, riskClassForTool,
  type ApprovalRecordType, type ModeId,
} from '../executioncontract/index'

export interface ApprovalLedgerRecord {
  recordType: ApprovalRecordType
  tool: string
  riskClass: string
  mode: ModeId | 'legacy'
  policyId: string
  policyVersion: string
  sessionId: string
  profile: string
  entryPoint: string
  decidedBy: string
  ts: string
  recordId: string
  /** 可选上下文（不落敏感原值，同审计纪律）。 */
  detail?: Record<string, unknown>
}

const CAP = 5000

export function approvalLedgerDir(): string {
  const env = process.env.HERMES_APPROVAL_LEDGER_DIR?.trim()
  if (env) return resolve(env)
  return underWebUi('approval-ledger')
}

function ledgerFile(): string {
  return join(approvalLedgerDir(), 'approval-ledger.jsonl')
}

/** 构造一条账本记录：recordType 一律经 recordTypeForMode 或显式裁决态取数，调用方不得自拼。 */
export function buildApprovalRecord(input: {
  tool: string
  mode: ModeId | 'legacy'
  sessionId: string
  profile: string
  entryPoint: string
  decided: 'auto' | 'risk-evaluated' | 'readonly' | 'user'
  policyId?: string
  policyVersion?: string
  overrideRecordType?: ApprovalRecordType
  detail?: Record<string, unknown>
}): ApprovalLedgerRecord {
  const contract = loadExecutionContract()
  const decidedBy = input.decided === 'user' ? 'user' : `policy:${input.decided}`
  const recordType = input.overrideRecordType
    ?? (input.decided === 'user' ? 'approval.resolved' : recordTypeForMode(input.mode === 'legacy' ? 'yolo' : input.mode))
  return {
    recordType,
    tool: input.tool,
    riskClass: riskClassForTool(input.tool),
    mode: input.mode,
    policyId: input.policyId ?? contract.approvalLedger.exemptedPolicyIdDefault,
    policyVersion: input.policyVersion ?? contract.version,
    sessionId: input.sessionId,
    profile: input.profile,
    entryPoint: input.entryPoint,
    decidedBy,
    ts: new Date().toISOString(),
    recordId: randomUUID(),
    ...(input.detail ? { detail: input.detail } : {}),
  }
}

/** 追加一条记录（fail-soft：账本故障不得阻断业务调用——账本是观测面不是执法面）。 */
export function appendApprovalRecord(record: ApprovalLedgerRecord): boolean {
  try {
    const dir = approvalLedgerDir()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    appendFileSync(ledgerFile(), JSON.stringify(record) + '\n')
    compactIfNeeded()
    return true
  } catch {
    return false
  }
}

/** 入口层合成免审记录的唯一便捷口（yolo 放行/策略放行都走这里）。 */
export function synthesizeExempted(input: Parameters<typeof buildApprovalRecord>[0]): boolean {
  return appendApprovalRecord(buildApprovalRecord(input))
}

function compactIfNeeded(): void {
  try {
    const file = ledgerFile()
    if (!existsSync(file)) return
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean)
    if (lines.length <= CAP) return
    const keep = lines.slice(-CAP)
    const tmp = file + '.tmp'
    require('node:fs').writeFileSync(tmp, keep.map(l => l + '\n').join(''))
    require('node:fs').renameSync(tmp, file)
  } catch {
    // 截断失败不影响主链路（下次追加再试）
  }
}

/** 读尾部（测试/查询面）：按时间正序返回，entries[0] 最早（同 tool-exec 审计契约）。 */
export function readApprovalLedger(limit = 100): ApprovalLedgerRecord[] {
  try {
    const file = ledgerFile()
    if (!existsSync(file)) return []
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean)
    return lines.slice(-limit).map(l => JSON.parse(l) as ApprovalLedgerRecord)
  } catch {
    return []
  }
}

/** 入口矩阵覆盖率断言的取数口（spec §10 I4）：给定 entryPoint 集合，返回每个入口的记录数。 */
export function entryCoverage(entryPoints: string[]): Record<string, number> {
  const all = readApprovalLedger(Number.MAX_SAFE_INTEGER)
  const counts: Record<string, number> = {}
  for (const ep of entryPoints) counts[ep] = 0
  for (const r of all) if (r.entryPoint in counts) counts[r.entryPoint] += 1
  return counts
}
