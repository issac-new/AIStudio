// custom/server/execution-records/delegate-scan.ts
// delegate 通道执行记录的任务工作区扫描面（AgentTeams 吸收批二，只读 fail-soft）。
//
// 双源归并的「第二源」：中央索引（record.ts 按日 JSONL）只在本机 webui 根下，
// delegate 的机器可读证据跟着任务工作区走（跨机可见——G3 取证已读它）：
//   materials/delegate-result.json  最近一次委托回执（zcode-acp-delegate.py
//                                  write_delegate_result 原子落盘，含 exit/sessionId）
//   materials/runs.jsonl            每个退出路径一行（批二 delegate 写入口径）
//   materials/delegate-log.txt      人类可读日志（tee 落盘；详情页只读尾部）
//
// 性能红线：单次扫描 boards×tasks 目录 readdir+定点 stat，文件缺失零读开销；
// 任务数上限防爆炸（MAX_TASKS）。坏 JSON/坏行一律跳过，绝不抛（索引坏不得炸读端）。
//
// 时间戳口径：delegate 侧 Python 写秒（int(time.time())），中央索引写毫秒——
// 归并排序前统一换算为毫秒（<1e12 视为秒）。
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { EXECUTION_RECORDS_VERSION, type ExecutionRecord } from './record'
import { boardWorkspacesRoot, resolveTaskWorkspace } from '../controllers/ide/task-workspace'
import { listBoardDbs } from '../projectworkflow/project-tasks'
import { kanbanRootOf } from '../projectworkflow/state-store'

/** 单次扫描任务工作区上限（防爆炸：boards×tasks 目录遍历的硬顶）。 */
export const MAX_SCAN_TASKS = 500
/** delegate-log.txt 尾读窗口：最多从尾部读 64KB，再取末 200 行。 */
const TAIL_MAX_BYTES = 64 * 1024
const TAIL_MAX_LINES = 200

/** delegate 退出码 → outcome（zcode-acp-delegate.py 退出码表：0 成功 / 2 引擎
 *  不可用（启动前拒绝）/ 3 超时 / 4 协议错误 / 5 引擎过早退出）。 */
export function outcomeFromExit(exit: number): ExecutionRecord['outcome'] {
  if (exit === 0) return 'success'
  if (exit === 2) return 'blocked'
  if (exit === 3) return 'timeout'
  return 'failed'
}

/** 秒/毫秒归一（Python 秒级时间戳 → ms；已是 ms 或缺省 0 原样）。 */
function toMs(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n <= 0) return 0
  return n < 1e12 ? Math.round(n * 1000) : Math.round(n)
}

const OUTCOMES = new Set(['success', 'failed', 'timeout', 'blocked'])

/** 任意 payload 里取字符串（缺省空）。 */
function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export interface DelegateScanOptions {
  env?: NodeJS.ProcessEnv
  /** 扫描任务上限（缺省 MAX_SCAN_TASKS；测试可调小）。 */
  maxTasks?: number
}

/**
 * 扫描全部板任务工作区的 delegate 记录（kind='delegate'，startedAt 倒序）。
 * HERMES_KANBAN_WORKSPACES_ROOT 钉根时所有板同根（Python pin 语义）→ 只扫一次。
 */
export function scanDelegateRecords(opts: DelegateScanOptions = {}): ExecutionRecord[] {
  const env = opts.env ?? process.env
  const maxTasks = Math.max(1, Math.min(opts.maxTasks ?? MAX_SCAN_TASKS, MAX_SCAN_TASKS))
  const byRun = new Map<string, ExecutionRecord>()
  const merge = (rec: ExecutionRecord) => {
    const prev = byRun.get(rec.runId)
    // 同 runId 后写胜（runs.jsonl 追加序）；delegate-result.json 与 runs.jsonl 撞
    // runId 时取 startedAt 新者，时间相同取 result.json（字段更全）。
    if (!prev || rec.startedAt >= prev.startedAt) byRun.set(rec.runId, rec)
  }
  let scanned = 0
  const scanRoot = (workspacesRoot: string, board: string) => {
    let entries
    try {
      entries = readdirSync(workspacesRoot, { withFileTypes: true })
    } catch {
      return // 根不存在/不可读：该板无可见工作区，跳过
    }
    for (const e of entries) {
      if (scanned >= maxTasks) return
      if (!e.isDirectory() || e.name.startsWith('.') || e.name.startsWith('_')) continue
      scanned += 1
      const wsDir = join(workspacesRoot, e.name)
      scanTaskWorkspace(wsDir, e.name, board, merge)
    }
  }

  const pinned = env.HERMES_KANBAN_WORKSPACES_ROOT?.trim()
  if (pinned) {
    scanRoot(resolve(pinned), 'default')
  } else {
    const root = kanbanRootOf(env)
    // 板枚举照 listBoardDbs 形态（default 双布局 + boards/<slug>）；default 工作区
    // 根即使无 kanban.db 也扫（板库缺席 ≠ 工作区不存在），命名板以有库为准。
    const boards = new Set<string>(['default'])
    for (const b of listBoardDbs(root)) boards.add(b.board)
    for (const board of boards) {
      scanRoot(boardWorkspacesRoot(join(root, 'kanban'), board, env), board)
    }
  }
  const all = [...byRun.values()]
  all.sort((a, b) => b.startedAt - a.startedAt)
  return all
}

/** 单任务工作区：runs.jsonl（逐行）+ delegate-result.json（单条）→ 记录。 */
function scanTaskWorkspace(
  wsDir: string,
  dirName: string,
  board: string,
  merge: (rec: ExecutionRecord) => void,
): void {
  const materials = join(wsDir, 'materials')
  const runsFile = join(materials, 'runs.jsonl')
  const resultFile = join(materials, 'delegate-result.json')
  const logFile = join(materials, 'delegate-log.txt')

  let logBytes = 0
  try {
    const st = statSync(logFile)
    if (st.isFile()) logBytes = st.size
  } catch { /* 无日志零开销 */ }

  // runs.jsonl：每个退出路径一行（run 键为 runId；坏行跳过）
  if (existsSync(runsFile)) {
    try {
      for (const line of readFileSync(runsFile, 'utf-8').split('\n')) {
        const t = line.trim()
        if (!t) continue
        let row: Record<string, unknown>
        try { row = JSON.parse(t) as Record<string, unknown> } catch { continue }
        const rec = recordFromPayload(row, dirName, board, logBytes)
        if (rec) merge(rec)
      }
    } catch { /* 单文件读失败：跳过该文件不放大 */ }
  }

  // delegate-result.json：最近一次回执（sessionId 为 runId；无 sessionId 的
  // 启动前拒绝由 runs.jsonl 行承载，此处不猜造 runId）
  if (existsSync(resultFile)) {
    try {
      const row = JSON.parse(readFileSync(resultFile, 'utf-8')) as Record<string, unknown>
      const rec = recordFromPayload(row, dirName, board, logBytes)
      if (rec) merge(rec)
    } catch { /* 坏 JSON 跳过 */ }
  }
}

/** payload（runs.jsonl 行 / delegate-result.json）→ ExecutionRecord；不可索引（无
 *  runId 或无时间基准）返回 null。runId 取 result.sessionId / 行 run 键（runId 键
 * 兼容）。outcome 显式合法值优先，否则从 exit 映射；两者皆缺不猜。 */
function recordFromPayload(
  row: Record<string, unknown>,
  dirName: string,
  board: string,
  logBytes: number,
): ExecutionRecord | null {
  if (!row || typeof row !== 'object') return null
  const runId = str(row.sessionId) || str(row.run) || str(row.runId)
  if (!runId) return null
  const startedAt = toMs(row.startedAt)
  if (!startedAt) return null
  const exitRaw = row.exit ?? row.exitCode
  const exit = typeof exitRaw === 'number' ? exitRaw : Number(exitRaw)
  const explicitOutcome = str(row.outcome)
  let outcome: ExecutionRecord['outcome'] | null = null
  if (OUTCOMES.has(explicitOutcome)) outcome = explicitOutcome as ExecutionRecord['outcome']
  else if (row.exit !== undefined || row.exitCode !== undefined) {
    outcome = Number.isFinite(exit) ? outcomeFromExit(exit) : null
  }
  if (!outcome) return null
  const endedAt = toMs(row.endedAt)
  const reason = str(row.stage) || str(row.reason) || undefined
  const taskId = str(row.taskId) || dirName
  const payloadBoard = str(row.board) || board
  const rec: ExecutionRecord = {
    v: EXECUTION_RECORDS_VERSION,
    kind: 'delegate',
    runId,
    taskId,
    board: payloadBoard,
    outcome,
    startedAt,
    ...(str(row.sessionId) ? { sessionId: str(row.sessionId) } : {}),
    ...(str(row.agentId) ? { agentId: str(row.agentId) } : {}),
    ...(str(row.cli) ? { cli: str(row.cli) } : {}),
    ...(Number.isFinite(exit) && (row.exit !== undefined || row.exitCode !== undefined)
      ? { exitCode: exit }
      : {}),
    ...(reason ? { reason } : {}),
    ...(endedAt ? { endedAt } : {}),
    ...(str(row.promptSha256) || str(row.prompt_sha256) ? { promptSha256: str(row.promptSha256) || str(row.prompt_sha256) } : {}),
    ...(logBytes > 0 ? { logBytes } : {}),
  }
  return rec
}

export interface DelegateDetail {
  workspace: string
  board: string
  materialized: boolean
  /** materials/delegate-result.json 解析体；缺失/坏 JSON → null。 */
  result: Record<string, unknown> | null
  /** delegate-log.txt 尾部 ≤200 行。 */
  logTail: string[]
  logBytes: number
}

/** 只读 sqlite 查询（project-tasks queryBoard 同款；库缺/坏 → null）。 */
function queryTaskWorkspaceRow(
  dbPath: string,
  taskId: string,
): { workspace_path: unknown; workspace_kind: unknown } | null {
  let db: {
    prepare(sql: string): { get(...p: unknown[]): unknown }
    close(): void
  } | null = null
  try {
    const { DatabaseSync } = require('node:sqlite') as {
      DatabaseSync: new (p: string, o?: unknown) => NonNullable<typeof db>
    }
    db = new DatabaseSync(dbPath, { readOnly: true })
    return db
      .prepare('SELECT workspace_path, workspace_kind FROM tasks WHERE id = ? LIMIT 1')
      .get(taskId) as { workspace_path: unknown; workspace_kind: unknown } | null
  } catch {
    return null
  } finally {
    try { db?.close() } catch { /* 已关 */ }
  }
}

/**
 * delegate 详情：解析任务工作区 → result + 日志尾读。
 * 返回 null = workspace 解析不到（任务不在任何板库且预测目录不存在，或
 * path 为空/逃逸拒绝）——调用方按 unavailable 呈现。
 * 工作区未物化（回收/未派发落地）时返回 materialized=false + 空证据，同样
 * 没有可读详情，调用方如实降级。
 */
export function readDelegateDetail(
  taskId: string,
  board?: string,
  opts: { env?: NodeJS.ProcessEnv } = {},
): DelegateDetail | null {
  const env = opts.env ?? process.env
  const root = kanbanRootOf(env)
  const isDir = (p: string) => {
    try { return statSync(p).isDirectory() } catch { return false }
  }
  const kanbanHome = join(root, 'kanban')

  // 板定位：显式 board 只查该板；未指定时 default 优先、其余板按 listBoardDbs 序。
  const boards = board ? [board] : ['default', ...listBoardDbs(root).map((b) => b.board).filter((b) => b !== 'default')]
  let resolution: { path: string | null; materialized: boolean; board: string } | null = null
  for (const b of boards) {
    const dbPath = b === 'default'
      ? (existsSync(join(root, 'kanban.db')) ? join(root, 'kanban.db')
        : existsSync(join(root, 'kanban', 'kanban.db')) ? join(root, 'kanban', 'kanban.db') : null)
      : join(root, 'kanban', 'boards', b, 'kanban.db')
    const row = dbPath && existsSync(dbPath) ? queryTaskWorkspaceRow(dbPath, taskId) : null
    const r = resolveTaskWorkspace(
      {
        taskId,
        board: b,
        workspaceKind: row ? String(row.workspace_kind ?? '') || null : 'scratch',
        workspacePath: row ? (typeof row.workspace_path === 'string' ? row.workspace_path : null) : null,
      },
      { kanbanHome, isDir, env },
    )
    if (r.path && r.materialized) {
      resolution = { path: r.path, materialized: true, board: b }
      break
    }
    // 库里查到该任务但工作区未物化/解析失败 → 记住首个事实，不再跨板猜
    if (row && !resolution) resolution = { path: r.path, materialized: r.materialized, board: b }
  }
  if (!resolution || !resolution.path) return null

  const materials = join(resolution.path, 'materials')
  let result: Record<string, unknown> | null = null
  const resultFile = join(materials, 'delegate-result.json')
  if (existsSync(resultFile)) {
    try {
      result = JSON.parse(readFileSync(resultFile, 'utf-8')) as Record<string, unknown>
    } catch { result = null } // 坏 JSON：详情面如实缺（result=null），不炸
  }
  const tail = readLogTail(join(materials, 'delegate-log.txt'))
  return {
    workspace: resolution.path,
    board: resolution.board,
    materialized: resolution.materialized,
    result,
    logTail: tail.lines,
    logBytes: tail.bytes,
  }
}

/** delegate-log.txt 尾读：大文件 fs.open+stat 从尾部读 TAIL_MAX_BYTES，不整读。
 *  窗口首行可能是被截断的半行 → 丢弃；保留末 TAIL_MAX_LINES 行。 */
export function readLogTail(file: string): { lines: string[]; bytes: number } {
  let st
  try {
    st = statSync(file)
    if (!st.isFile()) return { lines: [], bytes: 0 }
  } catch {
    return { lines: [], bytes: 0 }
  }
  const bytes = st.size
  try {
    if (bytes === 0) return { lines: [], bytes: 0 }
    const readSize = Math.min(bytes, TAIL_MAX_BYTES)
    const start = bytes - readSize
    let text: string
    if (readSize === bytes) {
      text = readFileSync(file, 'utf-8')
    } else {
      const fd = openSync(file, 'r')
      try {
        const buf = Buffer.alloc(readSize)
        const read = readSync(fd, buf, 0, readSize, start)
        text = buf.toString('utf-8', 0, read)
      } finally {
        closeSync(fd)
      }
      // 窗口起点在行中：首段是半行，丢弃
      const nl = text.indexOf('\n')
      if (nl >= 0) text = text.slice(nl + 1)
    }
    const lines = text.split('\n').map((l) => l.replace(/\r$/, ''))
    while (lines.length && !lines[lines.length - 1]) lines.pop()
    return { lines: lines.slice(-TAIL_MAX_LINES), bytes }
  } catch {
    return { lines: [], bytes }
  }
}
