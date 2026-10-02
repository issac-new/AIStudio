// B2 六类成本账守门：六类聚合、缺席降级（available:false 且不猜数）、口径 _defs 随响应。
// fixture 全 tmpdir：sqlite 假库（studio sessions / kanban tasks+task_events）、
// 假审批日志、假 traces JSONL、change-gov 假库（走真实 store API 建数）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir: string
const NOW_S = Math.floor(Date.now() / 1000)

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-cost-'))
  process.env.HERMES_HOME = join(dir, 'home', '.hermes')
})
afterEach(async () => {
  for (const k of ['HERMES_HOME', 'HARNESS_STUDIO_DB', 'HERMES_APPROVALS_LOG_FILE', 'HERMES_TRACES_DIR', 'CHANGE_GOV_DB']) {
    delete process.env[k]
  }
  const store = await import('../../governance/change-governance-store')
  store.resetChangeGovDbForTest()
  rmSync(dir, { recursive: true, force: true })
})

function makeStudioDb(): string {
  const file = join(dir, 'studio.db')
  const db = new DatabaseSync(file)
  db.exec(`CREATE TABLE sessions (
    id TEXT PRIMARY KEY, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0, cache_write_tokens INTEGER DEFAULT 0,
    reasoning_tokens INTEGER DEFAULT 0, last_active INTEGER DEFAULT 0)`)
  const ins = db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,?)')
  ins.run('s1', 100, 50, 10, 5, 1, NOW_S - 100)        // 窗口内
  ins.run('s2', 200, 100, 20, 10, 2, NOW_S - 200)      // 窗口内
  ins.run('old', 999, 999, 999, 999, 999, NOW_S - 30 * 86400) // 30 天前，出窗
  db.close()
  process.env.HARNESS_STUDIO_DB = file
  return file
}

function makeKanbanBoard(slug: string): void {
  const boardDir = join(dir, 'home', '.hermes', 'kanban', 'boards', slug)
  mkdirSync(boardDir, { recursive: true })
  const db = new DatabaseSync(join(boardDir, 'kanban.db'))
  db.exec(`CREATE TABLE tasks (
    id TEXT PRIMARY KEY, title TEXT, assignee TEXT, status TEXT,
    created_at INTEGER, started_at INTEGER, completed_at INTEGER)`)
  db.exec(`CREATE TABLE task_events (
    task_id TEXT, kind TEXT, payload TEXT, created_at INTEGER)`)
  const ins = db.prepare('INSERT INTO tasks VALUES (?,?,?,?,?,?,?)')
  ins.run('t1', '任务1', 'a', 'done', NOW_S - 100, NOW_S - 90, NOW_S - 10) // 90s
  ins.run('t2', '任务2', 'a', 'done', NOW_S - 50, NOW_S - 40, NOW_S - 20) // 30s
  ins.run('t3', '旧结案', 'a', 'done', NOW_S - 30 * 86400, NOW_S - 30 * 86400 + 5, NOW_S - 30 * 86400 + 10) // 出窗
  ins.run('t4', '在途', 'a', 'running', NOW_S - 5, null, null)
  const ev = db.prepare('INSERT INTO task_events VALUES (?,?,?,?)')
  ev.run('t1', 'created', '{}', NOW_S - 100)
  ev.run('t1', 'tool_call', '{}', NOW_S - 95)
  ev.run('t1', 'escalation', '{"to":"lead"}', NOW_S - 50) // 人工干预类
  ev.run('t4', 'created', '{}', NOW_S - 5)
  db.close()
}

function makeApprovalLog(): void {
  const file = join(dir, 'approvals', 'history.json')
  mkdirSync(join(dir, 'approvals'), { recursive: true })
  writeFileSync(file, JSON.stringify([
    { id: 'a1', ts: Date.now() - 1000, actor: 'u', targetKind: 'command', targetId: 'cmd1', targetTitle: '部署', decision: 'approved' },
    { id: 'a2', ts: Date.now() - 2000, actor: 'u', targetKind: 'review', targetId: 'r1', targetTitle: '评审', decision: 'rejected' },
    { id: 'a3', ts: Date.now() - 40 * 86400000, actor: 'u', targetKind: 'command', targetId: 'cmd0', targetTitle: '旧', decision: 'approved' }, // 出窗
  ]))
  process.env.HERMES_APPROVALS_LOG_FILE = file
}

function makeTraces(): void {
  const tdir = join(dir, 'traces')
  mkdirSync(tdir)
  writeFileSync(join(tdir, 'a.jsonl'), '{"span":1}\n{"span":2}\n')
  writeFileSync(join(tdir, 'notes.txt'), '非 JSONL 不计\n')
  process.env.HERMES_TRACES_DIR = tdir
}

async function makeChangeGovWithRework(): Promise<void> {
  process.env.CHANGE_GOV_DB = join(dir, 'change-gov.db')
  const store = await import('../../governance/change-governance-store')
  store.resetChangeGovDbForTest()
  const r1 = store.createRequest({ title: '变更一', level: 4 })
  store.submitRequest(r1.id)
  store.decideRequest(r1.id, { decision: 'approve', decider: '主管' })
  store.implementRequest(r1.id, 3.5)
  const r2 = store.createRequest({ title: '变更二', level: 4 })
  store.submitRequest(r2.id)
  store.decideRequest(r2.id, { decision: 'approve', decider: '主管' })
  store.implementRequest(r2.id, 1)
  store.createFreezeWindow({ name: '发布冻结', tier: 1, starts_at: Date.now() - 1000, ends_at: Date.now() + 86400000, scope: 'all', note: '' })
}

/** 空库形态（安全治理账用：读路径走真 store，窗口数恒 0 可断言） */
async function makeEmptyChangeGovDb(): Promise<void> {
  process.env.CHANGE_GOV_DB = join(dir, 'change-gov-empty.db')
  const store = await import('../../governance/change-governance-store')
  store.resetChangeGovDbForTest()
  store.listFreezeWindows() // 触发建库
}

describe('token 账：sessions token 列求和（秒窗）', () => {
  it('窗口内两行求和；旧会话出窗不计', async () => {
    const file = makeStudioDb()
    const { collectTokenAccount } = await import('../cost-accounts')
    const acc = await collectTokenAccount(7, file)
    expect(acc.available).toBe(true)
    const d = acc.data as { sessionsCount: number; totalTokens: number; inputTokens: number; windowed: boolean }
    expect(d.sessionsCount).toBe(2)
    expect(d.inputTokens).toBe(300)
    expect(d.totalTokens).toBe(300 + 150 + 30 + 15 + 3) // i+o+cr+cw+r
    expect(d.windowed).toBe(true)
  })

  it('库缺席：available=false 全 null 不猜数', async () => {
    const { collectTokenAccount } = await import('../cost-accounts')
    const acc = await collectTokenAccount(7, join(dir, 'nope.db'))
    expect(acc.available).toBe(false)
    const d = acc.data as { totalTokens: null; sessionsCount: null }
    expect(d.totalTokens).toBeNull()
    expect(d.sessionsCount).toBeNull()
  })
})

describe('人工干预/工具执行/安全治理账（audit 窗口 + traces）', () => {
  it('approvals 决策 + kanban escalation 计入干预；traces span 计数；严重级分桶', async () => {
    makeApprovalLog()
    makeKanbanBoard('b1')
    makeTraces()
    await makeEmptyChangeGovDb()
    const ca = await import('../cost-accounts')

    const win = await ca.collectAuditEventsWindow(7)
    const human = ca.buildHumanInterventionAccount(win)
    expect(human.available).toBe(true)
    const hd = human.data as { events: number; byAction: Array<{ action: string }> }
    expect(hd.events).toBe(3) // approvals 2（窗口内）+ kanban escalation 1
    expect(hd.byAction.length).toBeGreaterThan(0)

    const tool = await ca.collectToolExecutionAccount(win)
    expect(tool.available).toBe(true)
    const td = tool.data as { auditToolActions: number; traceSpanCount: number; traceFiles: number }
    expect(td.auditToolActions).toBeGreaterThanOrEqual(2) // command:approved/rejected + tool_call
    expect(td.traceSpanCount).toBe(2)
    expect(td.traceFiles).toBe(1)

    const sec = await ca.collectSecurityGovernanceAccount(win)
    const sd = sec.data as { severityBuckets: { high: number }; freezeWindows: { total: number | null } }
    expect(sd.severityBuckets.high).toBeGreaterThanOrEqual(1) // rejected → high
    expect(sd.freezeWindows.total).toBe(0) // 空库形态（该账测试不建窗口）
  })
})

describe('等待时延账：kanban done 任务 created→completed', () => {
  it('窗口内 done 平均/中位（列名先探 PRAGMA）', async () => {
    makeKanbanBoard('b1')
    const { collectWaitLatencyAccount } = await import('../cost-accounts')
    const acc = await collectWaitLatencyAccount(7)
    expect(acc.available).toBe(true)
    const d = acc.data as { tasksDone: number; avgSeconds: number | null; medianSeconds: number | null }
    expect(d.tasksDone).toBe(2)
    expect(d.avgSeconds).toBe(60) // (90+30)/2
    expect(d.medianSeconds).toBe(30) // 下中位（保守口径，n 偶取低者）
  })

  it('无板库：available=false 不猜数', async () => {
    const { collectWaitLatencyAccount } = await import('../cost-accounts')
    const acc = await collectWaitLatencyAccount(7)
    expect(acc.available).toBe(false)
    expect((acc.data as { tasksDone: null }).tasksDone).toBeNull()
  })
})

describe('故障返工账：change-gov implement 回填工时', () => {
  it('窗口内 implemented 单求和', async () => {
    await makeChangeGovWithRework()
    const { collectReworkAccount } = await import('../cost-accounts')
    const acc = collectReworkAccount(7)
    expect(acc.available).toBe(true)
    const d = acc.data as { requests: number; reworkHours: number }
    expect(d.requests).toBeGreaterThanOrEqual(2)
    expect(d.reworkHours).toBeGreaterThanOrEqual(4.5)
  })
})

describe('总入口：六类齐 + _defs 口径可对账 + 全缺席降级', () => {
  it('六账顺序稳定、每账带口径定义与源锚点', async () => {
    makeStudioDb()
    makeKanbanBoard('b1')
    makeApprovalLog()
    makeTraces()
    await makeChangeGovWithRework()
    const { collectCostAccounts, ACCOUNT_KEYS } = await import('../cost-accounts')
    const report = await collectCostAccounts({ days: 7 })
    expect(report.days).toBe(7)
    expect(report.accounts.map((a) => a.key)).toEqual([...ACCOUNT_KEYS])
    for (const key of ACCOUNT_KEYS) {
      const def = report._defs[key]
      expect(def.definition.length, `${key} 口径定义`).toBeGreaterThan(10)
      expect(def.sources.length, `${key} 源锚点`).toBeGreaterThan(0)
    }
    // 六账里 token/等待/返工在 fixture 下必须 available
    for (const key of ['token', 'waitLatency', 'rework', 'humanIntervention', 'toolExecution'] as const) {
      expect(report.accounts.find((a) => a.key === key)!.available, `${key} 应可用`).toBe(true)
    }
  })

  it('全源缺席：六账如实降级（false/null），不编造数字', async () => {
    const { collectCostAccounts } = await import('../cost-accounts')
    const report = await collectCostAccounts({ days: 7 })
    const token = report.accounts.find((a) => a.key === 'token')!
    expect(token.available).toBe(false)
    const wait = report.accounts.find((a) => a.key === 'waitLatency')!
    expect(wait.available).toBe(false)
    const rework = report.accounts.find((a) => a.key === 'rework')!
    // change-gov 库在（~/.hermes-web-ui 缺省路径可能存在于开发机）→ 只断言"有数必真"：
    // unavailable 时数据必须 null，不允许出现猜测值
    if (!rework.available) {
      expect((rework.data as { reworkHours: null }).reworkHours).toBeNull()
    }
  })
})

describe('判定纯函数口径', () => {
  it('isHumanInterventionEvent / isToolExecutionEvent / deriveSeverity / 分位', async () => {
    const ca = await import('../cost-accounts')
    const ev = (source: 'kanban', action: string, result = '') => ({ ts: 0, source, actor: '', action, target: '', result })
    expect(ca.isHumanInterventionEvent(ev('kanban', 'escalation'))).toBe(true)
    expect(ca.isHumanInterventionEvent(ev('kanban', 'created'))).toBe(false)
    expect(ca.isToolExecutionEvent(ev('kanban', 'tool_call'))).toBe(true)
    expect(ca.isToolExecutionEvent(ev('kanban', 'status_changed'))).toBe(false)
    expect(ca.deriveSeverity(ev('kanban', 'decide', 'rejected'))).toBe('high')
    expect(ca.deriveSeverity(ev('kanban', 'escalation', 'pending'))).toBe('medium')
    expect(ca.deriveSeverity(ev('kanban', 'created', 'success'))).toBe('low')
    expect(ca.medianOf([1, 2, 3])).toBe(2)
    expect(ca.percentileOf([1, 2, 3, 4], 95)).toBe(4)
  })
})
