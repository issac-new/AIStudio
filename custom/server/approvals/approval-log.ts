// overlay/custom/server/approvals/approval-log.ts
// 人工审批决策历史（P1 §二 2026-09-28）：append-only JSON 日志。
// 记录：时间 + 操作人 + 操作对象（kind/id/title）+ 决策 + 备注 + 来源端点。
// 路径解析与 approval-store 同约定：环境变量显式 > ~/.hermes-web-ui/approvals/。
// 不落 cwd：serve 以 upstream 为 cwd 启动，cwd 档会写进只读 upstream 树。
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import type { ApprovalRiskTier } from './risk-tier'

// 决策图谱落账（乙4，2026-09-30 调研落地）：appendApprovalLog 是全部审批裁决的单一
// 收口点（autopass/pending-controller 六调用面共经），在此挂 fire-and-forget 钩子。
// 动态 require 防 vitest 假执行器污染：模块加载失败静默跳过（fail-soft）。
function recordToDecisionGraph(entry: Omit<ApprovalLogEntry, 'ts'> & { ts?: number }): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { recordApprovalDecision } = require('../decisiongraph/decision-recorder') as
      typeof import('../decisiongraph/decision-recorder')
    recordApprovalDecision({
      targetKind: entry.targetKind, targetId: entry.targetId, targetTitle: entry.targetTitle ?? '',
      decision: entry.decision, actor: entry.actor, note: entry.note,
    })
  } catch { /* fail-soft：落账失败不影响审批日志主链路 */ }
}

// 治理事件总线桥（六文调研轮 F）：审批裁决 → govbus 事件流。动态 import（vitest ESM
// 环境下 require 加载内含 import 语句的模块会抛错被吞——动态 import 单例可靠）；
// fire-and-forget 异步落总线（事件最终落盘，不阻断审批主链路）。
function emitToGovBus(full: ApprovalLogEntry): void {
  import('../govbus/event-log')
    .then(({ appendGovEvent }) => {
      const high = /deny|reject|blocked/i.test(full.decision)
      appendGovEvent({
        domain: 'approval',
        severity: full.risk === 'high' || high ? 'high' : 'info',
        type: `approval.${full.decision}`,
        source: 'approvals/approval-log',
        summary: `${full.actor} 对 ${full.targetKind}「${full.targetTitle || full.targetId}」裁决 ${full.decision}${full.risk ? `（风险 ${full.risk}）` : ''}`,
        refs: { targetId: full.targetId },
        payload: { decision: full.decision, risk: full.risk, targetKind: full.targetKind },
      })
    })
    .catch(() => { /* fail-soft：总线故障不影响审批日志主链路 */ })
}

export interface ApprovalLogEntry {
  id: string
  ts: number
  actor: string
  targetKind: 'command' | 'review' | 'kanban'
  targetId: string
  targetTitle: string
  decision: string
  note?: string
  /** V4-N1 风险档（裁决时服务端重算；老记录可无） */
  risk?: ApprovalRiskTier
}

const CAP = 500

export function resolveApprovalLogPath(): string {
  if (process.env.HERMES_APPROVALS_LOG_FILE) return resolveEnv(process.env.HERMES_APPROVALS_LOG_FILE)
  return join(homedir(), '.hermes-web-ui', 'approvals', 'history.json')
}

function resolveEnv(p: string): string {
  return p.startsWith('/') || p.startsWith('~') ? p.replace(/^~/, homedir()) : join(process.cwd(), p)
}

function load(): ApprovalLogEntry[] {
  const file = resolveApprovalLogPath()
  if (!existsSync(file)) return []
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(parsed) ? parsed.filter(isEntry) : []
  } catch {
    // 解析失败（尾写损坏/手改）：隔离原文件再返回空，防止下一次 append 用
    // 只剩新条目的数组整文件覆写、丢光历史台账（对齐 review-store 先例）。
    try { renameSync(file, `${file}.corrupt-${Date.now()}`) } catch { /* 隔离失败不阻断追加 */ }
    return []
  }
}

function isEntry(v: unknown): v is ApprovalLogEntry {
  if (!v || typeof v !== 'object') return false
  const e = v as Record<string, unknown>
  return typeof e.id === 'string' && typeof e.ts === 'number' && typeof e.decision === 'string'
}

/** 追加一条决策记录（原子写：tmp + rename）。返回写入后的条目。
 * 串行性说明：load→push→重写全程同步无 await 点，单线程内天然串行——不引入
 * promise 链（链会把返回值变成 Promise，破坏同步契约与调用方取值）；跨进程
 * 并发仍靠 CAP 裁剪兜底。 */
export function appendApprovalLog(entry: Omit<ApprovalLogEntry, 'ts'> & { ts?: number }): ApprovalLogEntry {
  const full: ApprovalLogEntry = { ts: Date.now(), ...entry }
  recordToDecisionGraph(entry)
  emitToGovBus(full)
  const list = load()
  list.push(full)
  const trimmed = list.length > CAP ? list.slice(list.length - CAP) : list
  const file = resolveApprovalLogPath()
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(trimmed, null, 1), 'utf8')
  renameSync(tmp, file)
  return full
}

/** 历史查询（新→旧）。 */
export function queryApprovalLog(limit = 50): ApprovalLogEntry[] {
  return load().slice().reverse().slice(0, Math.max(1, Math.min(limit, CAP)))
}
