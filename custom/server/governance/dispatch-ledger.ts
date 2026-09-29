/**
 * 派发结果台账（4A 治理层第三期）——mention/column 引擎派发的 append-only 留痕。
 *
 * 定位：lane-specialist/coding-agent 的实耗信号面（第二期 untracked 的补齐）+
 * dispatch.successRate 的本地权威源（跨机仍以 Matrix task.receipt 为准，见 metrics.yaml）。
 *
 * 存储：~/.hermes-web-ui/overlay/dispatch-ledger.jsonl（GOVERNANCE_DISPATCH_LEDGER 覆盖），
 * 与 teams.json/raci sidecar 同域；append-only，超限（2×CAP 行）时截尾重写保最近 CAP 条
 * （原子写 tmp+rename）。写入 fail-soft：台账故障绝不影响派发主链路。
 *
 * 去重口径：commandId（引擎命令 uuid v7）跨 kind 唯一；column 条目比 mention 条目
 * 归因更细（specialist/role/column），统计时同 commandId 优先取 column 条目。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export interface DispatchLedgerEntry {
  ts: number
  /** mention=引擎 @mention 派单（含 REST/column 经单例的通用留痕）；column=列编排步骤（归因更细） */
  kind: 'mention' | 'column'
  /** mention 目标（agent/squad 名）或 column 的 provider */
  target: string
  mentionKind?: 'agent' | 'squad'
  /** column step specialist（台账单元 id，守门已断言入账） */
  specialist?: string
  role?: string
  column?: string
  /** DispatchReasonCode（zcode/dispatch-reasons.ts 冻结词表，成功路径 queued/coalesced） */
  reason: string
  commandId?: string
  sessionId?: string
  workspaceId?: string
  detail?: string
}

const CAP = 2000

export function dispatchLedgerPath(): string {
  const env = process.env.GOVERNANCE_DISPATCH_LEDGER?.trim()
  if (env) return resolve(env.replace(/^~/, homedir()))
  return join(homedir(), '.hermes-web-ui', 'overlay', 'dispatch-ledger.jsonl')
}

/** 追加一条派发结果（fail-soft：任何异常仅告警不抛，不影响派发主链路）。 */
export function appendDispatchOutcome(entry: Omit<DispatchLedgerEntry, 'ts'> & { ts?: number }): void {
  try {
    const file = dispatchLedgerPath()
    mkdirSync(join(file, '..'), { recursive: true })
    const line = JSON.stringify({ ts: entry.ts ?? Date.now(), ...entry }) + '\n'
    appendFileSync(file, line)
    trimIfNeeded(file)
  } catch (err) {
    console.warn(`[dispatch-ledger] 追加失败（fail-soft）：${err instanceof Error ? err.message : String(err)}`)
  }
}

function trimIfNeeded(file: string): void {
  try {
    const stat = readFileSync(file, 'utf8').split('\n').filter(Boolean)
    if (stat.length <= CAP * 2) return
    const tmp = file + '.tmp'
    writeFileSync(tmp, stat.slice(-CAP).join('\n') + '\n')
    renameSync(tmp, file)
  } catch { /* 截尾失败下次再试（append 已成功，不回滚） */ }
}

/** 读取台账（坏行跳过）；limit 取最近 N 条。 */
export function readDispatchLedger(limit = 2000): DispatchLedgerEntry[] {
  const file = dispatchLedgerPath()
  if (!existsSync(file)) return []
  try {
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean)
    const out: DispatchLedgerEntry[] = []
    for (const line of lines.slice(-limit)) {
      try {
        const j = JSON.parse(line) as DispatchLedgerEntry
        if (j && typeof j.ts === 'number' && typeof j.target === 'string' && typeof j.reason === 'string') {
          out.push(j)
        }
      } catch { /* 坏行跳过 */ }
    }
    return out
  } catch {
    return []
  }
}
