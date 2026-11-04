// overlay/execution-records 域：编码执行记录统一索引（AgentTeams 吸收批二）。
//
// 对标判据（run-coding-cli.sh:83 注释原意）：每个退出路径都留痕——没有
// transcript 的索引条目会隐形，而被拒绝的尝试恰恰最该被看见。
//
// 形态：
// - 按日 JSONL：<webui>/execution-records/execution-records-YYYY-MM-DD.jsonl
// - 按 runId 幂等（同 runId 重复 append 时后行胜，读取端按 runId 去重取末行）
// - 14 天裁剪（RETAIN_DAYS，照 runmanifest 范式）
// - 写失败不抛：记录面是旁路观测，绝不影响主执行链路（writeFailures 计数）
// - delegate 侧记录另有任务工作区 materials/runs.jsonl（跨机可见性），本模块
//   只管中央索引；查询端点双源归并
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'fs'
import { join, resolve } from 'path'
import { hermesWebUiHome } from '../lib/paths'

export const EXECUTION_RECORDS_VERSION = 1
export const RETAIN_DAYS = 14

/** 单条执行记录。所有可选字段缺失即未知（不猜数，fail-soft 契约）。 */
export interface ExecutionRecord {
  v: number
  /** 记录族：coding-run=编码 CLI 托管 run；delegate=委托通道（zcode-acp-delegate）。 */
  kind: 'coding-run' | 'delegate'
  runId: string
  sessionId?: string
  agentId?: string
  cli?: string
  taskId?: string
  board?: string
  /** success=正常收工；failed=异常退出；timeout=超时；blocked=启动前拒绝（CLI 缺失/授权无效/引擎不可用）。 */
  outcome: 'success' | 'failed' | 'timeout' | 'blocked'
  exitCode?: number
  /** 机器可读拒绝/失败原因（短码，如 engine-not-found、cli-missing）。 */
  reason?: string
  startedAt: number
  endedAt?: number
  promptSha256?: string
  logBytes?: number
}

export function executionRecordsDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.EXECUTION_RECORDS_DIR?.trim()
  if (explicit) return resolve(explicit)
  // 缺省落 web-ui 根（hermesWebUiHome 接收 env；批二实测纠偏：原 underWebUi(env)
  // 把 env 对象当 path 段传给 join，缺省路径必抛 TypeError——append 侧被吞成静默
  // 写失败、read/prune 侧直接炸出「绝不抛」契约，schema 未动）
  return join(hermesWebUiHome(env), 'execution-records')
}

function dayStamp(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fileFor(ms: number, env?: NodeJS.ProcessEnv): string {
  return join(executionRecordsDir(env), `execution-records-${dayStamp(ms)}.jsonl`)
}

let writeFailures = 0

/** 追加一条记录（best-effort：目录自建、异常吞掉只计数，绝不抛回主链路）。 */
export function appendExecutionRecord(rec: Omit<ExecutionRecord, 'v'>, env: NodeJS.ProcessEnv = process.env): void {
  try {
    const dir = executionRecordsDir(env)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const line = JSON.stringify({ v: EXECUTION_RECORDS_VERSION, ...rec })
    appendFileSync(fileFor(Date.now(), env), line + '\n')
  } catch {
    writeFailures += 1
  }
}

/** 读取窗口期内全部记录（按 runId 去重取末行，时间倒序）。坏行跳过，绝不抛。 */
export function readExecutionRecords(opts: { days?: number; env?: NodeJS.ProcessEnv } = {}): ExecutionRecord[] {
  const days = Math.min(Math.max(opts.days ?? RETAIN_DAYS, 1), 90)
  const dir = executionRecordsDir(opts.env)
  const byId = new Map<string, ExecutionRecord>()
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const now = Date.now()
  for (const name of names) {
    const m = /^execution-records-(\d{4})-(\d{2})-(\d{2})\.jsonl$/.exec(name)
    if (!m) continue
    const fileDay = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00`)
    if (!Number.isFinite(fileDay) || now - fileDay > days * 86_400_000) continue
    let text: string
    try {
      text = readFileSync(join(dir, name), 'utf-8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      const t = line.trim()
      if (!t) continue
      try {
        const rec = JSON.parse(t) as ExecutionRecord
        if (rec && typeof rec.runId === 'string' && rec.runId && typeof rec.kind === 'string' && typeof rec.outcome === 'string') {
          byId.set(rec.runId, rec)
        }
      } catch {
        // 坏行跳过（与 AgentTeams parseRunsIndex 同语义：索引坏不得炸读端）
      }
    }
  }
  const all = [...byId.values()]
  all.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
  return all
}

/** 裁剪窗口外文件（写路径顺带调用；失败静默）。 */
export function pruneExecutionRecords(env: NodeJS.ProcessEnv = process.env): void {
  const dir = executionRecordsDir(env)
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return
  }
  const horizon = Date.now() - RETAIN_DAYS * 86_400_000
  for (const name of names) {
    const m = /^execution-records-(\d{4})-(\d{2})-(\d{2})\.jsonl$/.exec(name)
    if (!m) continue
    const fileDay = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00`)
    if (Number.isFinite(fileDay) && fileDay < horizon) {
      try {
        unlinkSync(join(dir, name))
      } catch {
        // 已被并发清掉则罢
      }
    }
  }
}

/** 诊断出口：静默写失败计数（守门测试用）。 */
export function executionRecordWriteFailures(): number {
  return writeFailures
}
