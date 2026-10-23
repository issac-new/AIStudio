// overlay[delivery]: 介入归因/C×L 矩阵/日报 测试面（2026-10-23 天猫吸收轮）。
// 纯函数正反例 + tmpdir 夹具（真实 sqlite 板库 + SIM run 台账）起 koa 端到端。
// 纪律：env 覆盖 afterEach 复原；绝不写真实 home；断言写真实证据（计数/字段/顺序）。

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Koa from 'koa'
import { createServer } from 'node:http'

import {
  interventionsFromLedger,
  interventionsFromReleaseGate,
  interventionsFromUatVerdicts,
  interventionStats,
  parseDispatchDetail,
  parseLedgerTsv,
  ledgerTsToMs,
  riskSignals,
} from '../interventions'
import { cTierOf, cTierOfChildren, cTierOfEstimate, lTierOf, matrixOf, type TaskLite } from '../matrix'
import { buildDigest, type DigestBoardInput } from '../digest'
import { readAllBoards } from '../boards-reader'
import { deliveryRouter } from '../delivery-controller'

const RUN22_LEDGER_HEAD = [
  'id\tts\ttype\tdefect\tdetail\tstatus\tresolution',
  'c1792548517-245784\t2026-10-21 10:08:37\tdispatch-preset\tPR-7\tfrom=qi text=@qi-agent:matrix.test 测试左移任务 UC-RFD-001（用户（预写派发词代演人类派单）\topen\t',
  'c1792550207-345784\t2026-10-21 10:36:47\tdispatch-preset\tPR-7\tbackfill raci-dispatch-missing（补登/核验回灌代催）\topen\t',
  'c1792565330-4517705\t2026-10-21 14:48:50\tnudge\tPR-3\tagents=qi desc=测试报告入库（空转过半轻推）\topen\t',
  'c1\tauto\tcard-backfill\tPR-1\tbackfill raci-dispatch-missing\topen\t',
  'c2\tauto\tauto-approve\tPR-2\tauto approved\topen\t',
].join('\n')

function task(partial: Partial<TaskLite>): TaskLite {
  return {
    id: 't_x', title: '任务', status: 'todo', board: 'b', assignee: null,
    createdAt: 1000, startedAt: null, completedAt: null, lastHeartbeatAt: null,
    result: null, estimateDays: null, childCount: 0, commentCount: 0,
    ...partial,
  }
}

describe('介入归因 interventions（纯函数）', () => {
  it('台账 TSV 解析：表行跳过、列保留（含含 tab 的 detail）', () => {
    const rows = parseLedgerTsv(RUN22_LEDGER_HEAD)
    expect(rows).toHaveLength(5)
    expect(rows[0].type).toBe('dispatch-preset')
    expect(rows[0].detail.startsWith('from=qi')).toBe(true)
  })

  it('ledgerTsToMs：本地时间串可解析、垃圾串归 0', () => {
    expect(ledgerTsToMs('2026-10-21 10:08:37')).toBeGreaterThan(0)
    expect(ledgerTsToMs('garbage')).toBe(0)
  })

  it('dispatch detail：from/text 抽取；无 from 时 from=null', () => {
    expect(parseDispatchDetail('from=qi text=hello world')).toEqual({ from: 'qi', text: 'hello world' })
    expect(parseDispatchDetail('backfill raci').from).toBeNull()
  })

  it('台账→介入：带 from 首条=提出需求、后续/backfill=补充上下文；nudge=催进度；card-backfill=解决卡点；auto-approve 不计', () => {
    const rows = parseLedgerTsv(RUN22_LEDGER_HEAD)
    const { entries, autoApprove } = interventionsFromLedger(rows, 'runX')
    expect(autoApprove).toBe(1)
    const types = entries.map(e => `${e.type}/${e.layer}/${e.actor}`)
    // 首条带 from=qi → raise；第二条无 from（backfill）→ context/system；nudge → delivery
    expect(types[0]).toBe('raise/collab/qi')
    expect(types[1]).toBe('context/collab/system')
    expect(types).toContain('nudge/delivery/director')
    expect(types).toContain('unblock/delivery/system')
    expect(entries.every(e => e.anchor && e.run === 'runX')).toBe(true)
  })

  it('release-gate：approve/release=拍板确认、reject=纠错返工、submit 不计；action 与 decision 两字段都认', () => {
    const lines = [
      JSON.stringify({ ts: '2026-10-21T10:00:00Z', actor: 'admin', decision: 'submit' }),
      JSON.stringify({ ts: '2026-10-21T16:26:33Z', actor: 'admin', decision: 'approve', note: 'G5 七项过' }),
      JSON.stringify({ ts: '2026-10-21T12:00:00Z', actor: 'admin', action: 'reject' }),
      'not-json',
    ]
    const entries = interventionsFromReleaseGate(lines, 'runY')
    expect(entries.map(e => e.type)).toEqual(['confirm', 'rework'])
    expect(entries.every(e => e.layer === 'delivery' && e.source === 'release-gate')).toBe(true)
  })

  it('UAT 判词：pass/conditional=拍板确认、reject=纠错返工、未知值不计', () => {
    const entries = interventionsFromUatVerdicts([
      { ac: 'AC-1', verdict: 'pass', actor: 'admin', ts: 1 },
      { ac: 'AC-2', verdict: 'conditional', actor: 'admin', ts: 2 },
      { ac: 'AC-3', verdict: 'reject', actor: 'admin', ts: 3 },
      { ac: 'AC-4', verdict: 'weird', actor: 'admin', ts: 4 },
    ], 'runZ')
    expect(entries.map(e => e.type)).toEqual(['confirm', 'confirm', 'rework'])
  })

  it('统计与风险信号：占比阈值触发上下文缺失；返工≥3 触发理解偏差', () => {
    const many: Parameters<typeof interventionStats>[0] = []
    for (let i = 0; i < 6; i += 1) {
      many.push({ ts: i, actor: 'qi', layer: 'collab', type: 'context', source: 'compensation-ledger', run: 'r', snippet: '', anchor: `a${i}` })
    }
    many.push({ ts: 7, actor: 'qi', layer: 'collab', type: 'raise', source: 'compensation-ledger', run: 'r', snippet: '', anchor: 'a7' })
    const stats = interventionStats(many)
    expect(stats.total).toBe(7)
    expect(stats.byLayer.collab).toBe(7)
    const signals = riskSignals(many)
    expect(signals.find(s => s.id === 'context-gap')?.hit).toBe(true) // 6/7 ≥ 40% 且 ≥5
    expect(signals.find(s => s.id === 'misunderstanding')?.hit).toBe(false)

    const reworky = [1, 2, 3].map(i => ({ ts: i, actor: 'a', layer: 'delivery' as const, type: 'rework' as const, source: 'uat-verdicts' as const, run: 'r', snippet: '', anchor: `r${i}` }))
    expect(riskSignals(reworky).find(s => s.id === 'misunderstanding')?.hit).toBe(true)
  })
})

describe('C×L 矩阵 matrix（纯函数）', () => {
  it('C 档：estimate/children 两信号取高；全缺席=C0', () => {
    expect(cTierOfEstimate(null)).toBe(0)
    expect(cTierOfEstimate(0.5)).toBe(1)
    expect(cTierOfEstimate(2)).toBe(2)
    expect(cTierOfEstimate(4)).toBe(3)
    expect(cTierOfEstimate(9)).toBe(4)
    expect(cTierOfChildren(0)).toBe(0)
    expect(cTierOfChildren(1)).toBe(2)
    expect(cTierOfChildren(3)).toBe(3)
    expect(cTierOfChildren(6)).toBe(4)
    expect(cTierOf({ estimateDays: 0.5, childCount: 6 })).toBe(4)
    expect(cTierOf({ estimateDays: null, childCount: 0 })).toBe(0)
  })

  it('L 档：todo 族=0/已认领=1/执行中=2/评审=3/完成有产物=4/完成无产物=3', () => {
    expect(lTierOf(task({ status: 'triage' }))).toBe(0)
    expect(lTierOf(task({ status: 'todo', startedAt: 123 }))).toBe(1)
    expect(lTierOf(task({ status: 'running' }))).toBe(2)
    expect(lTierOf(task({ status: 'blocked' }))).toBe(2)
    expect(lTierOf(task({ status: 'review' }))).toBe(3)
    expect(lTierOf(task({ status: 'done', result: '产物' }))).toBe(4)
    expect(lTierOf(task({ status: 'done' }))).toBe(3)
    expect(lTierOf(task({ status: 'archived', result: 'x' }))).toBe(4)
  })

  it('矩阵：5×5 全格、格内计数与介入均值、总账', () => {
    const tasks = [
      task({ id: 'a', status: 'done', result: 'r', estimateDays: 0.5, commentCount: 3 }),
      task({ id: 'b', status: 'done', result: 'r', estimateDays: 0.5, commentCount: 1 }),
      task({ id: 'c', status: 'todo' }),
    ]
    const m = matrixOf(tasks)
    expect(m.cells).toHaveLength(25)
    const cell = m.cells.find(c => c.c === 1 && c.l === 4)
    expect(cell?.count).toBe(2)
    expect(cell?.avgInterventions).toBe(2)
    expect(m.totals).toMatchObject({ tasks: 3, evaluatedC: 2, avgInterventions: 1.3 }) // (3+1+0)/3 一位小数
    expect(m.note).toContain('预估工时')
  })
})

describe('日报 digest（纯函数）', () => {
  const NOW = 1_800_000_000
  const DAY = 86_400

  function board(slug: string, tasks: TaskLite[], events: DigestBoardInput['events'] = []): DigestBoardInput {
    return { slug, available: true, tasks, events }
  }

  it('状态盘点/趋势窗/完成/卡点/评审老化/停滞候选/建议全链', () => {
    const boards = [
      board('chen-pay-api', [
        task({ id: 't1', board: 'chen-pay-api', status: 'done', result: '产物', completedAt: NOW - 3600, createdAt: NOW - 7200 }),
        task({ id: 't2', board: 'chen-pay-api', status: 'blocked', assignee: 'chen', createdAt: NOW - 3 * DAY }),
        task({ id: 't3', board: 'chen-pay-api', status: 'review', assignee: 'chen', createdAt: NOW - 2 * DAY }),
        task({ id: 't4', board: 'chen-pay-api', status: 'running', createdAt: NOW - DAY }),
      ], [
        { taskId: 't2', kind: 'commented', at: NOW - 2 * DAY, seq: 1 },
        { taskId: 't3', kind: 'created', at: NOW - 2 * DAY, seq: 2 },
        { taskId: 't4', kind: 'heartbeat', at: NOW - 7200, seq: 3 },
      ]),
      { slug: 'broken', available: false, tasks: [], events: [] },
    ]
    const d = buildDigest(boards, { nowSec: NOW })
    expect(d.boards).toBe(2)
    expect(d.boardsAvailable).toBe(1)
    expect(d.statuses.find(s => s.status === 'done')?.count).toBe(1)
    expect(d.trend.completed24h).toBe(1)
    expect(d.trend.created24h).toBe(1) // t1 创建在窗内；t4 创建恰在 24h 前=上一窗
    expect(d.trend.createdPrev24h).toBe(1)
    expect(d.completed[0]?.taskId).toBe('t1')
    const blocker = d.blockers[0]
    expect(blocker?.owner).toBe('chen')
    expect(blocker?.dwellSec).toBe(2 * DAY) // 最后事件 commented 在 2 天前
    expect(d.reviewQueue[0]?.taskId).toBe('t3')
    // t4 心跳 2h 前 > 默认 1h 阈值 → 停滞候选
    expect(d.stalled.map(s => s.taskId)).toEqual(['t4'])
    const kinds = d.suggestions.map(s => s.kind)
    expect(kinds).toContain('unblock-blocked')
    expect(kinds).toContain('review-aging')
    expect(kinds).toContain('nudge-stalled')
    // 可展开：条目带 details（事件轨迹行）
    expect(blocker?.details.length).toBeGreaterThan(0)
  })
})

describe('boards-reader + 端点（夹具端到端）', () => {
  let dir: string
  let server: ReturnType<typeof createServer>
  let base = ''

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'tmall-delivery-'))
    const nowSec = Math.floor(Date.now() / 1000)
    const boardsDir = join(dir, 'kanban', 'boards', 'chen-pay-api')
    mkdirSync(boardsDir, { recursive: true })
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require('node:sqlite')
    const db = new DatabaseSync(join(boardsDir, 'kanban.db'))
    db.exec(`create table tasks (id text, title text, status text, assignee text, created_by text,
      created_at integer, started_at integer, completed_at integer, last_heartbeat_at integer,
      result text, estimate_days real)`)
    db.exec(`create table task_events (id integer primary key, task_id text, kind text, payload text, created_at integer)`)
    db.prepare(`insert into tasks values (?,?,?,?,?,?,?,?,?,?,?)`).run(
      't_a', 'RFD-001 架构治理评审', 'done', null, 'user', nowSec - 7200, nowSec - 7100, nowSec - 3600, null, '评审完成产物', null)
    db.prepare(`insert into task_events (task_id, kind, payload, created_at) values (?,?,?,?)`).run('t_a', 'created', '{}', nowSec - 7200)
    db.prepare(`insert into task_events (task_id, kind, payload, created_at) values (?,?,?,?)`).run('t_a', 'commented', '{"author":"chen"}', nowSec - 7100)
    db.close()
    // SIM run 夹具（interventions 端点）
    const evidenceDir = join(dir, 'runs', '20261023-fx', 'evidence')
    mkdirSync(evidenceDir, { recursive: true })
    writeFileSync(join(evidenceDir, 'compensation-ledger.tsv'), RUN22_LEDGER_HEAD)
    writeFileSync(join(evidenceDir, 'release-gate.jsonl'), JSON.stringify({ ts: '2026-10-21T16:26:33Z', actor: 'admin', decision: 'approve' }))
    writeFileSync(join(evidenceDir, 'uat-verdicts.jsonl'), JSON.stringify({ ts: '2026-10-21T16:38:22Z', actor: 'admin', ac: 'AC-6', verdict: 'pass' }))

    // reader 直测
    const boards = readAllBoards(dir)
    expect(boards.find(b => b.slug === 'chen-pay-api')?.tasks[0]?.commentCount).toBe(1)

    process.env.DELIVERY_KANBAN_HOME = dir
    process.env.SIM_OBSERVER_ROOT = dir
    const app = new Koa()
    app.use(deliveryRouter.routes())
    server = createServer(app.callback())
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    const addr = server.address()
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
  })

  afterAll(() => {
    server?.close()
    delete process.env.DELIVERY_KANBAN_HOME
    delete process.env.SIM_OBSERVER_ROOT
    rmSync(dir, { recursive: true, force: true })
  })

  it('GET /digest：夹具板进日报（done 有产物、completed24h=1）', async () => {
    const res = await fetch(`${base}/api/hermes/delivery/digest`)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.available).toBe(true)
    const digest = body.digest as { statuses: Array<{ status: string; count: number }>; trend: { completed24h: number } }
    expect(digest.statuses.find(s => s.status === 'done')?.count).toBe(1)
    expect(digest.trend.completed24h).toBe(1)
  })

  it('GET /matrix：夹具任务落 L4、C0（estimate 缺席）', async () => {
    const res = await fetch(`${base}/api/hermes/delivery/matrix`)
    const body = await res.json() as { available: boolean; matrix: { cells: Array<{ c: number; l: number; count: number; avgInterventions: number | null }> } }
    expect(body.available).toBe(true)
    const cell = body.matrix.cells.find(c => c.c === 0 && c.l === 4)
    expect(cell?.count).toBe(1)
    expect(cell?.avgInterventions).toBe(1)
  })

  it('GET /interventions?run=：台账+判词聚合、auto-approve 不计介入', async () => {
    const res = await fetch(`${base}/api/hermes/delivery/interventions?run=20261023-fx`)
    const body = await res.json() as {
      available: boolean; scope: string; entries: Array<{ type: string }>; stats: { total: number }; meta: { autoApprove: number }
    }
    expect(body.scope).toBe('20261023-fx')
    // 台账 5 行中 4 行产介入（auto-approve 不计）+ gate approve + uat pass = 6
    expect(body.stats.total).toBe(6)
    expect(body.meta.autoApprove).toBe(1)
    const types = body.entries.map(e => e.type)
    expect(types).toContain('raise')
    expect(types.filter(t => t === 'confirm')).toHaveLength(2)
  })

  it('GET /interventions 非法 run → 400', async () => {
    const res = await fetch(`${base}/api/hermes/delivery/interventions?run=../escape`)
    expect(res.status).toBe(400)
  })
})
