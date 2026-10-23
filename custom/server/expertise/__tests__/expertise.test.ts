// overlay[expertise]: 「谁懂什么」协作画像测试面（2026-10-23 天猫吸收轮）。
// 纯函数正反例 + tmpdir 夹具（SIM 台账 + 看板库）起 koa 端到端。

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Koa from 'koa'
import { createServer } from 'node:http'

import { boardOwnerOf, buildWall, evidenceFromBoard, evidenceFromLedger, extractTerms, searchExpertise } from '../evidence'
import { expertiseRouter } from '../expertise-controller'
import { ledgerTsToMs, parseLedgerTsv } from '../../delivery/interventions'

describe('evidence 纯函数', () => {
  it('extractTerms：拉丁词+CJK 二元组、停用词滤除、按频次排序', () => {
    const terms = extractTerms('支付 pay 支付渠道 pay-channel 任务 测试', 6)
    const names = terms.map(t => t.term)
    expect(names).toContain('pay')
    expect(names).toContain('支付')
    expect(names).toContain('渠道')
    expect(names).not.toContain('任务')
    expect(names).not.toContain('test')
  })

  it('boardOwnerOf：<人>-<域> 解析；不匹配归 null', () => {
    expect(boardOwnerOf('chen-pay-api')).toEqual({ owner: 'chen', domain: 'pay-api' })
    expect(boardOwnerOf('default')).toBeNull()
    expect(boardOwnerOf('ops-release')).toEqual({ owner: 'ops', domain: 'release' })
  })

  it('台账→证据：from=人 才产证据；无 from 的 backfill 行不入画像', () => {
    const rows = parseLedgerTsv([
      'id\tts\ttype\tdefect\tdetail\tstatus\tresolution',
      'r1\t2026-10-21 10:08:37\tdispatch-preset\tPR-7\tfrom=qi text=@qi-agent 测试左移任务 UC-RFD-001\topen\t',
      'r2\t2026-10-21 10:36:47\tdispatch-preset\tPR-7\tbackfill raci-dispatch-missing\topen\t',
    ].join('\n'))
    const ev = evidenceFromLedger(rows, 'runX', ledgerTsToMs)
    expect(ev.length).toBeGreaterThan(0)
    expect(ev.every(e => e.person === 'qi')).toBe(true)
    expect(ev.every(e => e.anchor.startsWith('runX#'))).toBe(true)
    expect(ev.every(e => e.tsMs > 0)).toBe(true)
  })

  it('看板→证据：域概念锚 slug、标题概念锚 taskId', () => {
    const ev = evidenceFromBoard({
      slug: 'chen-pay-api',
      tasks: [{ id: 't_1', title: '收银台 merchant-api 接口扩展', result: null, completedAt: 1792555193, createdAt: 1792554257 }],
    })
    const terms = ev.map(e => e.term)
    expect(terms).toContain('pay-api')
    expect(terms).toContain('pay')
    expect(terms).toContain('收银')
    const taskEv = ev.find(e => e.source === 'kanban-task')
    expect(taskEv?.anchor).toBe('t_1')
    const boardEv = ev.find(e => e.source === 'kanban-board')
    expect(boardEv?.anchor).toBe('chen-pay-api')
    expect(ev.every(e => e.person === 'chen')).toBe(true)
  })

  it('画像墙：按人聚合、概念按证据数排序', () => {
    const ev = [
      ...evidenceFromBoard({ slug: 'qi-test-pay', tasks: [] }),
      { person: 'qi', term: 'pay', source: 'compensation-ledger', snippet: 's', anchor: 'a', tsMs: 2 },
      { person: 'qi', term: 'pay', source: 'compensation-ledger', snippet: 's', anchor: 'b', tsMs: 3 },
    ]
    const wall = buildWall(ev)
    const qi = wall.persons.find(p => p.person === 'qi')
    expect(qi).toBeDefined()
    expect(qi?.evidenceTotal).toBe(2 + 2) // pay 板级 2 条（pay/pay-test? 视 slug 拆分）+ 台账 2 条
    const pay = qi?.concepts.find(c => c.term === 'pay')
    expect(pay?.count).toBeGreaterThanOrEqual(2)
    expect(pay?.lastTsMs).toBe(3)
  })

  it('检索：评分=证据数×2+新近度；空词空结果；命中按分排序且挂证据', () => {
    const now = Date.parse('2026-10-23T12:00:00Z')
    const ev = [
      { person: 'chen', term: 'pay', source: 'kanban-board', snippet: '负责看板', anchor: 'chen-pay-api', tsMs: now },
      { person: 'chen', term: 'pay', source: 'compensation-ledger', snippet: '话迹', anchor: 'r#1', tsMs: now - 86_400_000 },
      { person: 'lin', term: 'pay', source: 'kanban-board', snippet: '渠道', anchor: 'lin-channel-alipay', tsMs: now - 60 * 86_400_000 },
    ]
    expect(searchExpertise(ev, '', now)).toEqual([])
    const hits = searchExpertise(ev, 'pay', now)
    expect(hits[0]?.person).toBe('chen') // 2 条近期证据 > 1 条两月前
    expect(hits[0]?.evidence.length).toBe(2)
    expect(hits[0]?.evidence.every(e => e.anchor)).toBe(true)
    expect(hits[1]?.person).toBe('lin')
    // 双向包含：query 比词短也命中（alip→alipay）
    expect(searchExpertise([{ person: 'lin', term: 'alipay', source: 'kanban-board', snippet: '', anchor: 'x', tsMs: now }], 'alip', now)).toHaveLength(1)
  })
})

describe('端点（夹具端到端）', () => {
  let dir: string
  let server: ReturnType<typeof createServer>
  let base = ''

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'tmall-expertise-'))
    // SIM 台账夹具
    const evidenceDir = join(dir, 'runs', '20261023-fx', 'evidence')
    mkdirSync(evidenceDir, { recursive: true })
    writeFileSync(join(evidenceDir, 'compensation-ledger.tsv'), [
      'id\tts\ttype\tdefect\tdetail\tstatus\tresolution',
      'r1\t2026-10-21 10:08:37\tdispatch-preset\tPR-7\tfrom=chen text=@chen-agent 支付渠道 pay 收银台改造\topen\t',
      'r2\t2026-10-21 11:00:00\tdispatch-preset\tPR-8\tfrom=fei text=@fei-agent 小程序端测试\topen\t',
    ].join('\n'))
    // 看板夹具
    const boardsDir = join(dir, 'hermes', 'kanban', 'boards', 'lin-channel-alipay')
    mkdirSync(boardsDir, { recursive: true })
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require('node:sqlite')
    const db = new DatabaseSync(join(boardsDir, 'kanban.db'))
    db.exec(`create table tasks (id text, title text, status text, assignee text, created_by text,
      created_at integer, started_at integer, completed_at integer, last_heartbeat_at integer,
      result text, estimate_days real)`)
    db.exec(`create table task_events (id integer primary key, task_id text, kind text, payload text, created_at integer)`)
    db.prepare(`insert into tasks values (?,?,?,?,?,?,?,?,?,?,?)`).run(
      't_1', '支付宝 alipay 渠道对接', 'done', null, 'user', 1000, 1000, 2000, null, '渠道产物', null)
    db.close()

    process.env.SIM_OBSERVER_ROOT = dir
    const app = new Koa()
    app.use(expertiseRouter.routes())
    server = createServer(app.callback())
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    const addr = server.address()
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
  })

  afterAll(() => {
    server?.close()
    delete process.env.SIM_OBSERVER_ROOT
    rmSync(dir, { recursive: true, force: true })
  })

  it('GET /wall：chen/fei/lin 三人画像、证据源如实列出', async () => {
    const res = await fetch(`${base}/api/hermes/expertise/wall`)
    expect(res.status).toBe(200)
    const body = await res.json() as { available: boolean; persons: Array<{ person: string; concepts: Array<{ term: string }> }>; evidenceCount: number; sources: string[] }
    expect(body.available).toBe(true)
    const names = body.persons.map(p => p.person)
    expect(names).toContain('chen')
    expect(names).toContain('fei')
    expect(names).toContain('lin')
    expect(body.sources.some(s => s.includes('compensation-ledger.tsv'))).toBe(true)
    expect(body.sources.some(s => s.includes('lin-channel-alipay'))).toBe(true)
    expect(body.evidenceCount).toBeGreaterThan(0)
  })

  it('GET /search?q=pay：chen（台账话迹）与 lin（板域）命中、按证据排序', async () => {
    const res = await fetch(`${base}/api/hermes/expertise/search?q=pay`)
    const body = await res.json() as { available: boolean; candidates: Array<{ person: string; evidence: Array<{ anchor: string }> }> }
    expect(body.available).toBe(true)
    const names = body.candidates.map(c => c.person)
    expect(names).toContain('chen')
    expect(names).toContain('lin')
    for (const c of body.candidates) {
      expect(c.evidence.length).toBeGreaterThan(0)
    }
  })

  it('GET /search 缺 q → 400', async () => {
    const res = await fetch(`${base}/api/hermes/expertise/search`)
    expect(res.status).toBe(400)
  })
})
