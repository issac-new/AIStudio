// custom/server/execution-records/__tests__/execution-records.test.ts
// 执行记录查询域回归（AgentTeams 吸收批二）：双源归并去重（中央优先）、四维
// 过滤、分页、delegate 详情尾读（大文件 64KB 窗口 + 半行丢弃）、coding 详情
// 三表摘要与 fail-soft（库缺/表缺→unavailable 形状）、task-workspace env
// 优先序、坏行/坏 JSON 跳过。控制器层用最小 mock ctx 直调导出 handler
// （projectworkflow.test.ts 同款），env 一律临时目录注入、afterEach 还原。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Context } from 'koa'
import { readExecutionRecords } from '../record'
import { MAX_SCAN_TASKS, outcomeFromExit, readDelegateDetail, readLogTail, scanDelegateRecords } from '../delegate-scan'
import { readCodingDetail, webuiDbPath } from '../coding-detail'
import { getCodingDetail, getDelegateDetail, listExecutionRecords, mergedExecutionRecords } from '../controller'
import executionRecordsRoutes from '../controller'

const NOW = Date.now()
const T = Math.floor(NOW / 1000) // delegate 侧秒级时间戳基准

/** 本地时区日戳（record.ts dayStamp 同式）。 */
function dayStamp(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

let root: string
let recDir: string
let kanbanRoot: string
let webuiHome: string
const saved: Record<string, string | undefined> = {}

interface MockCtxInput {
  params?: Record<string, string>
  query?: Record<string, string>
}

/** 最小 ctx：handler 只读 params/query，写 status/body。 */
function makeCtx(input: MockCtxInput = {}): Context {
  return {
    params: input.params ?? {},
    query: input.query ?? {},
    status: 0,
    body: undefined,
  } as unknown as Context
}

/** 只读 sqlite 建库助手（writable 打开建表插行，随测随关）。 */
function withDb(path: string, fn: (db: {
  exec(sql: string): void
  prepare(sql: string): { run(...a: unknown[]): unknown }
}) => void): void {
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (p: string) => {
      exec(sql: string): void
      prepare(sql: string): { run(...a: unknown[]): unknown }
      close(): void
    }
  }
  const db = new DatabaseSync(path)
  try {
    fn(db)
  } finally {
    db.close()
  }
}

function makeTasksDb(path: string, rows: Array<{ id: string; path: string | null; kind: string }>): void {
  mkdirSync(dirname(path), { recursive: true })
  withDb(path, (db) => {
    db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, workspace_path TEXT, workspace_kind TEXT)')
    for (const r of rows) {
      db.prepare('INSERT INTO tasks (id, workspace_path, workspace_kind) VALUES (?, ?, ?)')
        .run(r.id, r.path, r.kind)
    }
  })
}

function writeMaterials(
  wsDir: string,
  files: { result?: unknown; rawResult?: string; runs?: string[]; log?: string },
): void {
  const materials = join(wsDir, 'materials')
  mkdirSync(materials, { recursive: true })
  if (files.rawResult !== undefined) {
    writeFileSync(join(materials, 'delegate-result.json'), files.rawResult)
  } else if (files.result !== undefined) {
    writeFileSync(join(materials, 'delegate-result.json'), JSON.stringify(files.result))
  }
  if (files.runs !== undefined) {
    writeFileSync(join(materials, 'runs.jsonl'), files.runs.join('\n') + '\n')
  }
  if (files.log !== undefined) {
    writeFileSync(join(materials, 'delegate-log.txt'), files.log)
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'execution-records-'))
  recDir = join(root, 'central-records')
  kanbanRoot = join(root, 'kanban-home')
  webuiHome = join(root, 'webui-home')
  for (const k of ['EXECUTION_RECORDS_DIR', 'HERMES_KANBAN_WORKSPACES_ROOT', 'HERMES_KANBAN_HOME', 'HERMES_HOME', 'HERMES_WEB_UI_HOME']) {
    saved[k] = process.env[k]
  }
  process.env.EXECUTION_RECORDS_DIR = recDir
  process.env.HERMES_KANBAN_HOME = kanbanRoot
  process.env.HERMES_HOME = kanbanRoot
  process.env.HERMES_WEB_UI_HOME = webuiHome
  delete process.env.HERMES_KANBAN_WORKSPACES_ROOT

  // ---- 中央索引：两日 JSONL + 坏行 + 同 runId 重复行（后行胜）----
  mkdirSync(recDir, { recursive: true })
  const today = [
    JSON.stringify({ v: 1, kind: 'coding-run', runId: 'run-c1', sessionId: 's-1', agentId: 'agent-alpha', cli: 'ycode', taskId: 't-coding', outcome: 'success', exitCode: 0, startedAt: NOW - 1000, endedAt: NOW - 500 }),
    // 同 runId 重复 append：后行胜 → 中央读出 failed
    JSON.stringify({ v: 1, kind: 'coding-run', runId: 'run-c1', sessionId: 's-1', agentId: 'agent-alpha', cli: 'ycode', taskId: 't-coding', outcome: 'failed', exitCode: 4, startedAt: NOW - 1000, endedAt: NOW - 400 }),
    JSON.stringify({ v: 1, kind: 'coding-run', runId: 'run-c2', agentId: 'agent-beta', outcome: 'blocked', reason: 'cli-missing', startedAt: NOW - 2000 }),
    // 与 delegate 工作区撞 runId：中央版本（success）应胜工作区版本（failed）
    JSON.stringify({ v: 1, kind: 'delegate', runId: 'run-dup', taskId: 't_d1', board: 'default', outcome: 'success', exitCode: 0, startedAt: NOW - 3000 }),
    '{broken json',
    '',
  ].join('\n')
  const yesterday = [
    JSON.stringify({ v: 1, kind: 'coding-run', runId: 'run-old', cli: 'zcode-cli', taskId: 't-old', outcome: 'success', exitCode: 0, startedAt: NOW - 86_400_000 }),
  ].join('\n')
  writeFileSync(join(recDir, `execution-records-${dayStamp(NOW)}.jsonl`), today + '\n')
  writeFileSync(join(recDir, `execution-records-${dayStamp(NOW - 86_400_000)}.jsonl`), yesterday + '\n')

  // ---- 看板两板：default（kanban.db 双布局之一）+ teamx ----
  makeTasksDb(join(kanbanRoot, 'kanban.db'), [
    { id: 't_d1', path: 't_d1', kind: 'scratch' },
    { id: 't_d2', path: 't_d2', kind: 'scratch' },
    { id: 't_d3', path: 't_d3', kind: 'scratch' }, // 目录不存在：未物化
  ])
  makeTasksDb(join(kanbanRoot, 'kanban', 'boards', 'teamx', 'kanban.db'), [
    { id: 't_x1', path: 't_x1', kind: 'scratch' },
  ])

  // default/t_d1：成功回执（秒级时间戳）+ runs.jsonl（含与中央撞 runId 的行 + 坏行）+ 大日志
  const bigLog = Array.from({ length: 1000 }, (_, i) =>
    'L' + String(i).padStart(4, '0') + ' ' + 'x'.repeat(93),
  ).join('\n') + '\n'
  writeMaterials(join(kanbanRoot, 'kanban', 'workspaces', 't_d1'), {
    result: { taskId: 't_d1', board: 'default', sessionId: 'sess-d1', exit: 0, stopReason: 'end_turn', stage: null, promptSha256: 'a'.repeat(64), startedAt: T - 100, endedAt: T - 95 },
    runs: [
      JSON.stringify({ run: 'run-d1a', taskId: 't_d1', exit: 0, startedAt: T - 200, endedAt: T - 190 }),
      JSON.stringify({ run: 'run-dup', taskId: 't_d1', exit: 4, stage: 'protocol', startedAt: T - 50, endedAt: T - 40 }),
      '{bad line',
    ],
    log: bigLog,
  })
  // default/t_d2：启动前拒绝（exit 2、无 sessionId——runId 只能来自 runs.jsonl）
  writeMaterials(join(kanbanRoot, 'kanban', 'workspaces', 't_d2'), {
    result: { taskId: 't_d2', board: 'default', sessionId: null, exit: 2, stage: 'engine_not_found', startedAt: T - 80, endedAt: T - 80 },
    runs: [
      JSON.stringify({ run: 'run-d2', taskId: 't_d2', exit: 2, stage: 'engine_not_found', startedAt: T - 80 }),
    ],
  })
  // default/t_empty：无 materials → 零记录
  mkdirSync(join(kanbanRoot, 'kanban', 'workspaces', 't_empty'), { recursive: true })
  // default/t_bad：坏 JSON 双件 → 全跳过
  writeMaterials(join(kanbanRoot, 'kanban', 'workspaces', 't_bad'), {
    rawResult: 'not json at all',
    runs: ['garbage', '{"run":"run-bad","exit":"oops","startedAt":"NaN"}'],
  })
  // teamx/t_x1：仅 runs.jsonl（timeout + failed 两态）
  writeMaterials(join(kanbanRoot, 'kanban', 'boards', 'teamx', 'workspaces', 't_x1'), {
    runs: [
      JSON.stringify({ run: 'run-x1', taskId: 't_x1', board: 'teamx', exit: 3, startedAt: T - 60 }),
      JSON.stringify({ run: 'run-x2', taskId: 't_x1', board: 'teamx', exit: 5, startedAt: T - 70 }),
    ],
  })

  // ---- webui 库三表 ----
  mkdirSync(webuiHome, { recursive: true })
  withDb(join(webuiHome, 'hermes-web-ui.db'), (db) => {
    db.exec(`CREATE TABLE sessions (
      id TEXT PRIMARY KEY, title TEXT, agent_session_id TEXT, agent_native_session_id TEXT,
      end_reason TEXT, started_at INTEGER, ended_at INTEGER, last_active INTEGER,
      workspace TEXT, model TEXT)`)
    db.exec(`CREATE TABLE run_usage (
      session_id TEXT NOT NULL, run_id TEXT NOT NULL, assistant_message_id TEXT,
      input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER, cache_write_tokens INTEGER,
      cost_usd REAL, run_duration_seconds REAL, model_duration_seconds REAL, tool_duration_seconds REAL,
      is_estimated INTEGER, completed_at INTEGER)`)
    db.exec(`CREATE TABLE workspace_run_changes (
      change_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, run_id TEXT, workspace TEXT,
      started_at INTEGER, finished_at INTEGER, files_changed INTEGER, additions INTEGER,
      deletions INTEGER, truncated INTEGER, created_at INTEGER)`)
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('s-1', '会话一', 'agent-s-1', 'native-s-1', 'end_turn', NOW - 5000, NOW - 1000, NOW - 900, '/ws/one', 'glm-4.7')
    db.prepare('INSERT INTO run_usage VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('s-1', 'run-c1', 'm1', 1000, 2000, 300, 400, 0.42, 61.5, 50.2, 11.3, 0, NOW - 400)
    db.prepare('INSERT INTO run_usage VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('s-1', 'run-9', 'm2', 10, 20, 0, 0, 0.01, 5.5, 5.0, 0.5, 0, NOW - 800)
    db.prepare('INSERT INTO workspace_run_changes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('chg-1', 's-1', 'run-c1', '/ws/one', NOW - 5000, NOW - 1000, 3, 120, 30, 0, NOW - 1000)
  })
})

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  rmSync(root, { recursive: true, force: true })
})

describe('readExecutionRecords：中央索引', () => {
  it('两日窗口、坏行跳过、同 runId 后行胜', () => {
    const recs = readExecutionRecords()
    const ids = recs.map((r) => r.runId).sort()
    expect(ids).toEqual(['run-c1', 'run-c2', 'run-dup', 'run-old'])
    expect(recs.find((r) => r.runId === 'run-c1')?.outcome).toBe('failed')
  })
})

describe('scanDelegateRecords：任务工作区扫描', () => {
  it('两板全量映射：exit→outcome 四态、runId 取 sessionId/run 键、秒→ms、坏 JSON 跳过', () => {
    const recs = scanDelegateRecords()
    const byRun = new Map(recs.map((r) => [r.runId, r]))
    expect([...byRun.keys()].sort()).toEqual(['run-d1a', 'run-d2', 'run-dup', 'run-x1', 'run-x2', 'sess-d1'])
    // 无 sessionId 的启动前拒绝：runId 落到 runs.jsonl 的 run 键，exit 2 → blocked
    expect(byRun.get('run-d2')).toMatchObject({ kind: 'delegate', outcome: 'blocked', exitCode: 2, reason: 'engine_not_found', taskId: 't_d2', board: 'default' })
    // delegate-result.json：runId=sessionId，秒级时间戳换算 ms
    expect(byRun.get('sess-d1')).toMatchObject({ outcome: 'success', exitCode: 0, startedAt: (T - 100) * 1000, taskId: 't_d1' })
    // 命名板归属
    expect(byRun.get('run-x1')).toMatchObject({ outcome: 'timeout', exitCode: 3, board: 'teamx' })
    expect(byRun.get('run-x2')).toMatchObject({ outcome: 'failed', exitCode: 5 })
    // logBytes 只在有日志时携带
    expect(byRun.get('sess-d1')?.logBytes).toBe(1000 * 100)
    expect(byRun.get('run-x1')?.logBytes).toBeUndefined()
    // 坏 JSON（t_bad 两件）不产生任何记录
    expect(recs.some((r) => r.taskId === 't_bad')).toBe(false)
    // startedAt 倒序
    const starts = recs.map((r) => r.startedAt)
    expect([...starts].sort((a, b) => b - a)).toEqual(starts)
  })

  it('HERMES_KANBAN_WORKSPACES_ROOT 钉根：只扫钉根（Python pin 语义）', () => {
    const pinDir = join(root, 'pin-ws')
    writeMaterials(join(pinDir, 't_p1'), {
      runs: [JSON.stringify({ run: 'run-p1', taskId: 't_p1', exit: 0, startedAt: T - 10 })],
    })
    const recs = scanDelegateRecords({ env: { ...process.env, HERMES_KANBAN_WORKSPACES_ROOT: pinDir } })
    expect(recs.map((r) => r.runId)).toEqual(['run-p1'])
    expect(recs[0]).toMatchObject({ taskId: 't_p1', board: 'default' })
  })

  it('maxTasks 上限防爆炸（按任务工作区计数，default 板 4 工作区耗尽配额→命名板不再扫）', () => {
    // default 板 workspaces 下恰 4 个目录（t_bad/t_d1/t_d2/t_empty）：配额 4 用尽，
    // teamx 板零扫描——与 readdir 顺序无关（cap 按目录计数，不按记录）。
    const recs = scanDelegateRecords({ maxTasks: 4 })
    expect(recs.length).toBeGreaterThan(0)
    expect(recs.some((r) => r.board === 'teamx')).toBe(false)
    for (const id of new Set(recs.map((r) => r.taskId))) {
      expect(['t_bad', 't_d1', 't_d2', 't_empty']).toContain(id)
    }
    expect(MAX_SCAN_TASKS).toBe(500)
  })

  it('outcomeFromExit 退出码表全覆盖（0/2/3/4/5/未知非零）', () => {
    expect(outcomeFromExit(0)).toBe('success')
    expect(outcomeFromExit(2)).toBe('blocked')
    expect(outcomeFromExit(3)).toBe('timeout')
    expect(outcomeFromExit(4)).toBe('failed')
    expect(outcomeFromExit(5)).toBe('failed')
    expect(outcomeFromExit(9)).toBe('failed')
  })
})

describe('readDelegateDetail / readLogTail：详情与尾读', () => {
  it('库行驱动解析 + result 解析 + 大日志 64KB 窗口尾读（半行丢弃、末 200 行）', () => {
    const d = readDelegateDetail('t_d1')
    expect(d).not.toBeNull()
    expect(d?.workspace).toBe(join(kanbanRoot, 'kanban', 'workspaces', 't_d1'))
    expect(d?.materialized).toBe(true)
    expect(d?.result).toMatchObject({ exit: 0, sessionId: 'sess-d1' })
    expect(d?.logBytes).toBe(1000 * 100)
    expect(d?.logTail.length).toBe(200)
    // 窗口起点 34464 字节落在 L0344 行中 → 首段半行被丢弃；尾 200 行 = L0800..L0999
    expect(d?.logTail[0]).toMatch(/^L0800 x{93}$/)
    expect(d?.logTail[199]).toMatch(/^L0999 x{93}$/)
    for (const line of d?.logTail ?? []) expect(line).toMatch(/^L\d{4} x{93}$/)
  })

  it('跨板解析（未指定 board 时 default 优先、其余板兜底）+ 指定 board', () => {
    const x = readDelegateDetail('t_x1')
    expect(x?.workspace).toBe(join(kanbanRoot, 'kanban', 'boards', 'teamx', 'workspaces', 't_x1'))
    expect(x?.result).toBeNull()
    expect(x?.logTail).toEqual([])
    expect(readDelegateDetail('t_x1', 'teamx')?.board).toBe('teamx')
  })

  it('未物化工作区（t_d3 目录不存在）materialized=false；完全解析不到 → null', () => {
    const d = readDelegateDetail('t_d3')
    expect(d?.materialized).toBe(false)
    expect(d?.result).toBeNull()
    expect(readDelegateDetail('t_ghost')).toBeNull()
  })

  it('readLogTail：缺失文件零炸、小文件整读', () => {
    expect(readLogTail(join(root, 'nope.txt'))).toEqual({ lines: [], bytes: 0 })
    const small = join(root, 'small.log')
    writeFileSync(small, 'a\nb\nc\n')
    expect(readLogTail(small)).toEqual({ lines: ['a', 'b', 'c'], bytes: 6 })
  })
})

describe('readCodingDetail：webui 三表摘要', () => {
  it('session/run_usage/workspace_run_changes 三表按 session 聚合', () => {
    const d = readCodingDetail('s-1')
    expect(d.available).toBe(true)
    if (d.available !== true) return
    expect(d.session).toMatchObject({
      id: 's-1', title: '会话一', agent_session_id: 'agent-s-1', agent_native_session_id: 'native-s-1',
      end_reason: 'end_turn', workspace: '/ws/one', model: 'glm-4.7',
    })
    expect(d.usage.length).toBe(2)
    expect(d.usage[0]).toMatchObject({ run_id: 'run-c1', cost_usd: 0.42, run_duration_seconds: 61.5 })
    expect(d.changes.length).toBe(1)
    expect(d.changes[0]).toMatchObject({ change_id: 'chg-1', files_changed: 3, additions: 120, deletions: 30 })
  })

  it('会话不存在：available 且 session=null（不猜数）', () => {
    const d = readCodingDetail('s-none')
    expect(d.available).toBe(true)
    if (d.available !== true) return
    expect(d.session).toBeNull()
    expect(d.usage).toEqual([])
    expect(d.changes).toEqual([])
  })

  it('库缺 → available:false + note（fail-soft）', () => {
    const d = readCodingDetail('s-1', { env: { ...process.env, HERMES_WEB_UI_HOME: join(root, 'no-webui') } })
    expect(d.available).toBe(false)
    if (d.available !== false) return
    expect(d.note).toContain('不存在')
    expect(webuiDbPath({ HERMES_WEB_UI_HOME: '/x' })).toBe(join('/x', 'hermes-web-ui.db'))
  })

  it('表缺 → available:false + note（fail-soft 不放大成异常）', () => {
    const halfHome = join(root, 'webui-half')
    mkdirSync(halfHome, { recursive: true })
    withDb(join(halfHome, 'hermes-web-ui.db'), (db) => {
      db.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY)')
      db.prepare('INSERT INTO sessions VALUES (?)').run('s-1')
    })
    const d = readCodingDetail('s-1', { env: { ...process.env, HERMES_WEB_UI_HOME: halfHome } })
    expect(d.available).toBe(false)
    if (d.available !== false) return
    expect(d.note).toContain('读失败')
  })
})

describe('GET /api/execution-records（controller）', () => {
  it('双源归并：runId 去重中央优先，共 9 条倒序', () => {
    const merged = mergedExecutionRecords()
    expect(merged.length).toBe(9)
    expect(new Set(merged.map((r) => r.runId)).size).toBe(9)
    // 撞 runId：中央 success 胜工作区 failed
    expect(merged.find((r) => r.runId === 'run-dup')?.outcome).toBe('success')

    const ctx = makeCtx()
    void listExecutionRecords(ctx)
    const body = ctx.body as { ok: boolean; records: unknown[]; total: number; limit: number; hasMore: boolean }
    expect(body.ok).toBe(true)
    expect(body.total).toBe(9)
    expect(body.records.length).toBe(9)
    expect(body.limit).toBe(50)
    expect(body.hasMore).toBe(false)
  })

  it('四维过滤：kind/agent（agentId 或 cli）/task/outcome', async () => {
    const run = async (query: Record<string, string>) => {
      const ctx = makeCtx({ query })
      await listExecutionRecords(ctx)
      return ctx
    }
    const kindCtx = await run({ kind: 'delegate' })
    const kindBody = kindCtx.body as { records: Array<{ kind: string }>; total: number }
    expect(kindBody.total).toBe(6)
    expect(kindBody.records.every((r) => r.kind === 'delegate')).toBe(true)

    const byAgentId = await run({ agent: 'agent-alpha' })
    expect((byAgentId.body as { total: number }).total).toBe(1)
    const byCli = await run({ agent: 'zcode-cli' })
    expect((byCli.body as { records: Array<{ runId: string }> }).records.map((r) => r.runId)).toEqual(['run-old'])

    const byTask = await run({ task: 't_d2' })
    expect((byTask.body as { records: Array<{ runId: string }> }).records.map((r) => r.runId)).toEqual(['run-d2'])

    const byOutcome = await run({ outcome: 'blocked' })
    expect(((byOutcome.body as { records: Array<{ runId: string }> }).records.map((r) => r.runId)).sort())
      .toEqual(['run-c2', 'run-d2'])

    const badKind = await run({ kind: 'bogus' })
    expect(badKind.status).toBe(400)
    const badOutcome = await run({ outcome: 'bogus' })
    expect(badOutcome.status).toBe(400)
  })

  it('分页：limit/offset/hasMore + limit clamp 1..200', () => {
    const page1 = makeCtx({ query: { limit: '3' } })
    void listExecutionRecords(page1)
    const b1 = page1.body as { records: Array<{ runId: string }>; hasMore: boolean }
    expect(b1.records.length).toBe(3)
    expect(b1.hasMore).toBe(true)

    const page2 = makeCtx({ query: { limit: '3', offset: '3' } })
    void listExecutionRecords(page2)
    const b2 = page2.body as { records: Array<{ runId: string }>; hasMore: boolean }
    // 全序稳定性：时间倒序（最新在前：c1 → c2 → dup → x1 → x2 → d2 → sess-d1 → d1a → old），
    // 第 2 页首条 = 全量第 4 条
    const all = makeCtx({ query: { limit: '200' } })
    void listExecutionRecords(all)
    const full = (all.body as { records: Array<{ runId: string; startedAt: number }> }).records
    expect(full.map((r) => r.runId).slice(0, 4)).toEqual(['run-c1', 'run-c2', 'run-dup', 'run-x1'])
    expect(b2.records[0]?.runId).toBe('run-x1')

    const clamped = makeCtx({ query: { limit: '9999' } })
    void listExecutionRecords(clamped)
    expect((clamped.body as { limit: number }).limit).toBe(200)

    const beyond = makeCtx({ query: { offset: '999' } })
    void listExecutionRecords(beyond)
    const bb = beyond.body as { records: unknown[]; hasMore: boolean }
    expect(bb.records).toEqual([])
    expect(bb.hasMore).toBe(false)
  })

  it('GET /delegate/:taskId：详情 + 最新记录 + 尾读；未知任务 unavailable', async () => {
    const ctx = makeCtx({ params: { taskId: 't_d1' } })
    await getDelegateDetail(ctx)
    const body = ctx.body as {
      ok: boolean; record: { runId: string } | null; result: { exit: number } | null
      logTail: string[]; logBytes: number
    }
    expect(ctx.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.result).toMatchObject({ exit: 0 })
    expect(body.logTail.length).toBe(200)
    expect(body.logBytes).toBe(1000 * 100)
    // t_d1 最新 delegate run = run-dup（T-50，比 sess-d1 T-100 新）
    expect(body.record?.runId).toBe('run-dup')

    const ghost = makeCtx({ params: { taskId: 't_ghost' } })
    await getDelegateDetail(ghost)
    expect(ghost.body).toMatchObject({ ok: true, available: false })
    expect((ghost.body as { note: string }).note).toContain('t_ghost')

    const unmaterialized = makeCtx({ params: { taskId: 't_d3' } })
    await getDelegateDetail(unmaterialized)
    expect(unmaterialized.body).toMatchObject({ ok: true, available: false })
    expect((unmaterialized.body as { note: string }).note).toContain('未物化')
  })

  it('GET /coding/:sessionId：三表 + 中央索引记录；库缺 unavailable', async () => {
    const ctx = makeCtx({ params: { sessionId: 's-1' } })
    await getCodingDetail(ctx)
    const body = ctx.body as {
      ok: boolean; record: { runId: string } | null
      session: { id: string } | null; usage: unknown[]; changes: unknown[]
    }
    expect(ctx.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.record?.runId).toBe('run-c1')
    expect(body.session?.id).toBe('s-1')
    expect(body.usage.length).toBe(2)
    expect(body.changes.length).toBe(1)

    const savedHome = process.env.HERMES_WEB_UI_HOME
    process.env.HERMES_WEB_UI_HOME = join(root, 'no-webui')
    const missing = makeCtx({ params: { sessionId: 's-1' } })
    await getCodingDetail(missing)
    process.env.HERMES_WEB_UI_HOME = savedHome
    expect(missing.body).toMatchObject({ ok: true, available: false })
  })

  it('路由表形态：bare 前缀可匹配、参数路由捕获 taskId/sessionId（735 挂载面）', () => {
    type Layer = {
      path: string
      match(p: string): boolean
      captures(p: string): string[]
      params(p: string, captures: string[]): Record<string, string>
    }
    const stack = (executionRecordsRoutes as unknown as { stack: Layer[] }).stack
    expect(stack.length).toBe(3)
    expect(stack.find((l) => l.match('/api/execution-records'))).toBeTruthy()
    const delLayer = stack.find((l) => l.match('/api/execution-records/delegate/t_d1'))
    expect(delLayer).toBeTruthy()
    expect(
      delLayer?.params('/api/execution-records/delegate/t_d1', delLayer.captures('/api/execution-records/delegate/t_d1')),
    ).toEqual({ taskId: 't_d1' })
    const codeLayer = stack.find((l) => l.match('/api/execution-records/coding/s-1'))
    expect(codeLayer).toBeTruthy()
  })
})
