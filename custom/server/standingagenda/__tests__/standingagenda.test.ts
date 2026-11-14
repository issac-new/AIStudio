// overlay/standingagenda 单测（2026-11-14 Proactive AI 二轮 P3）。
// 覆盖：matcher 四源匹配矩阵＋非 parked 不参与；store 校验/同 id 取最新（状态留痕）/坏行隔离；
// REST 真 HTTP（Koa+临时端口）：立案→match 走治理链落 interventions→状态流转非法 400。
// 隔离：standing-agenda 账本与 interventions 台账均落临时目录，不触宿主。
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import type { AutomationEvent } from '../../automations/automation-rules'
import { filterMatches, matchResumes, summarizeEvent } from '../agenda-matcher'
import { validateAgendaInput, readAgendas, appendAgenda, newAgendaId, type StandingAgendaRecord } from '../agenda-store'

const WS = '/ws/demo'

function rec(over: Partial<StandingAgendaRecord> = {}): StandingAgendaRecord {
  return {
    id: newAgendaId(), title: '依赖升级后续验证', mandateGoal: '保持主分支可发布',
    evidence: ['evidence/scan.txt:12'], resumeCondition: { type: 'kanban', board: 'main', toColumn: 'done' },
    parkedAt: 1, status: 'parked', resumeCount: 0, ...over,
  }
}

// ---------- matcher 纯函数 ----------

describe('P3 matcher 四源匹配', () => {
  it('file 通配（** 跨段）命中；不同 type 不命中', () => {
    const ev: AutomationEvent = { type: 'file', workspacePath: WS, path: 'src/api/user.ts' }
    expect(filterMatches({ type: 'file', pathPattern: 'src/**.ts' }, ev)).toBe(true)
    expect(filterMatches({ type: 'file', pathPattern: 'docs/**' }, ev)).toBe(false)
    expect(filterMatches({ type: 'kanban' }, ev)).toBe(false)
  })

  it('kanban：board 与 toColumn 过滤（空=任意）', () => {
    const ev: AutomationEvent = { type: 'kanban', workspacePath: WS, board: 'main', taskId: 't1', from: 'todo', to: 'done' }
    expect(filterMatches({ type: 'kanban', board: 'main', toColumn: 'done' }, ev)).toBe(true)
    expect(filterMatches({ type: 'kanban', board: 'other' }, ev)).toBe(false)
    expect(filterMatches({ type: 'kanban', toColumn: 'review' }, ev)).toBe(false)
    expect(filterMatches({ type: 'kanban' }, ev)).toBe(true)
  })

  it('git ref 尾段匹配（main 匹配 refs/heads/main——语义同 automation-rules.matchRef）', () => {
    const ev: AutomationEvent = { type: 'git', workspacePath: WS, ref: 'refs/heads/main', commits: [{ sha: 'abc123def', subject: 'x' }] }
    expect(filterMatches({ type: 'git', ref: 'main' }, ev)).toBe(true)
    expect(filterMatches({ type: 'git', ref: 'dev' }, ev)).toBe(false)
    expect(filterMatches({ type: 'git' }, ev)).toBe(true)
  })

  it('webhook：source/eventType 过滤', () => {
    const ev: AutomationEvent = { type: 'webhook', workspacePath: WS, source: 'ci', eventType: 'build_ok' }
    expect(filterMatches({ type: 'webhook', eventType: 'build_ok' }, ev)).toBe(true)
    expect(filterMatches({ type: 'webhook', eventType: 'build_fail' }, ev)).toBe(false)
  })

  it('matchResumes：仅 parked 参与；命中任一事件即一条建议；alignmentNote 注入', () => {
    const parked = rec()
    const resumed = rec({ status: 'resumed' })
    const events: AutomationEvent[] = [
      { type: 'kanban', workspacePath: WS, board: 'main', taskId: 't9', from: 'running', to: 'done' },
    ]
    const notes = matchResumes([parked, resumed], events, {
      alignmentNote: (r) => (r.id === parked.id ? 'stale：先重对齐再恢复' : undefined),
    })
    expect(notes).toHaveLength(1)
    expect(notes[0]!.recordId).toBe(parked.id)
    expect(notes[0]!.alignmentNote).toContain('重对齐')
    expect(notes[0]!.matchedEventSummary).toContain('t9')
  })

  it('summarizeEvent 四形态', () => {
    expect(summarizeEvent({ type: 'file', workspacePath: WS, path: 'a/b.ts' })).toBe('file:a/b.ts')
    expect(summarizeEvent({ type: 'webhook', workspacePath: WS, source: 'ci', eventType: 'ok' })).toBe('webhook:ci/ok')
  })
})

// ---------- store ----------

describe('P3 store', () => {
  it('校验：mandateGoal/evidence/resumeCondition.type 各自拒错', () => {
    expect(validateAgendaInput({ title: 't', mandateGoal: 'g', resumeCondition: { type: 'kanban' } }).problems).toEqual([])
    expect(validateAgendaInput({ title: '', mandateGoal: 'g', resumeCondition: { type: 'kanban' } }).problems[0]).toContain('title')
    expect(validateAgendaInput({ title: 't', mandateGoal: '', resumeCondition: { type: 'kanban' } }).problems[0]).toContain('mandateGoal')
    expect(validateAgendaInput({ title: 't', mandateGoal: 'g', evidence: [], resumeCondition: { type: 'kanban' } }).problems[0]).toContain('evidence')
    expect(validateAgendaInput({ title: 't', mandateGoal: 'g', resumeCondition: { type: 'sms' } }).problems[0]).toContain('resumeCondition.type')
  })
})

// ---------- REST 真 HTTP ----------

describe('P3 standing agenda REST（/api/hermes/standing-agenda）', () => {
  let dir: string
  let server: import('node:http').Server | undefined
  let base: string

  beforeEach(async () => {
    server?.close()
    dir = mkdtempSync(join(tmpdir(), 'sag-http-'))
    process.env.HERMES_STANDING_AGENDA_DIR = dir
    process.env.HERMES_GOAL_ALIGNMENT_DIR = dir
    process.env.INTERVENTION_LEDGER_PATH = join(dir, 'interventions.json')
    process.env.HERMES_GOV_EVENT_DIR = join(dir, 'govbus')
    const bodyParser = (await import('@koa/bodyparser')).default
    const Koa = (await import('koa')).default
    const { standingAgendaRouter } = await import('../agenda-controller')
    const app = new Koa()
    app.use(bodyParser())
    app.use(standingAgendaRouter.routes())
    server = createServer(app.callback())
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/hermes/standing-agenda`
  })

  afterAll(() => {
    delete process.env.HERMES_STANDING_AGENDA_DIR
    delete process.env.HERMES_GOAL_ALIGNMENT_DIR
    delete process.env.INTERVENTION_LEDGER_PATH
    delete process.env.HERMES_GOV_EVENT_DIR
    server?.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('立案→match 走治理链→interventions 台账落账→人确认恢复', async () => {
    const created = await fetch(`${base}/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '升级后验证', mandateGoal: '主分支可发布', evidence: ['ci/log:88'], resumeCondition: { type: 'git', ref: 'main' } }),
    })
    expect(created.status).toBe(201)
    const { agenda } = await created.json() as { agenda: StandingAgendaRecord }
    expect(agenda.status).toBe('parked')

    // 事件不命中
    const miss = await fetch(`${base}/${agenda.id}/match`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [{ type: 'webhook', workspacePath: WS, source: 'x', eventType: 'y' }] }),
    })
    const missBody = await miss.json() as { matched: boolean }
    expect(missBody.matched).toBe(false)

    // 命中 → 治理链（govern 裁决+interventions 落账）
    const hit = await fetch(`${base}/${agenda.id}/match`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [{ type: 'git', workspacePath: WS, ref: 'refs/heads/main', commits: [{ sha: 'a1b2c3d4', subject: 'merge' }] }] }),
    })
    expect(hit.status).toBe(201)
    const hitBody = await hit.json() as { matched: boolean; governed: { interventionId: string; decision: string } }
    expect(hitBody.matched).toBe(true)
    expect(hitBody.governed.interventionId).toContain('sa-')

    // 恢复建议已进 interventions 台账（走治理链实证）
    const { readLedger } = await import('../../proactivity/intervention-ledger')
    const led = readLedger()
    const entry = led.entries.find((e) => e.id === hitBody.governed.interventionId)
    expect(entry).toBeDefined()
    expect(entry!.source).toContain('standing-agenda')
    expect(entry!.evidenceChain?.refs[0]).toContain('git:')

    // 人确认恢复 → resumed（resumeCount 1）；再 dropped 合法；done 后终态
    const resume = await fetch(`${base}/${agenda.id}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'resumed' }),
    })
    const { agenda: resumed } = await resume.json() as { agenda: StandingAgendaRecord }
    expect(resumed.status).toBe('resumed')
    expect(resumed.resumeCount).toBe(1)
    expect(resumed.lastResumeAt).toBeGreaterThan(0)

    const done = await fetch(`${base}/${agenda.id}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }),
    })
    expect(done.status).toBe(200)
    const terminal = await fetch(`${base}/${agenda.id}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'resumed' }),
    })
    expect(terminal.status).toBe(400) // done 为终态
  })

  it('校验失败 400；不存在的记录 404；空 events 400', async () => {
    const bad = await fetch(`${base}/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'x', resumeCondition: { type: 'kanban' } }),
    })
    expect(bad.status).toBe(400)
    const nf = await fetch(`${base}/sag-none/match`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [{ type: 'webhook', workspacePath: WS, source: 's', eventType: 'e' }] }),
    })
    expect(nf.status).toBe(404)
    const created = await fetch(`${base}/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 't', mandateGoal: 'g', resumeCondition: { type: 'webhook' } }),
    })
    const { agenda } = await created.json() as { agenda: StandingAgendaRecord }
    const empty = await fetch(`${base}/${agenda.id}/match`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: [] }),
    })
    expect(empty.status).toBe(400)
  })

  it('账本缺席＝空列表 fail-soft；同 id 状态流转留痕（读取取最新）', async () => {
    const list = await fetch(`${base}/`)
    const body = await list.json() as { agendas: unknown[] }
    expect(body.agendas).toEqual([])
    const r = rec({ status: 'parked' })
    appendAgenda(r)
    appendAgenda({ ...r, status: 'resumed' })
    const { records } = readAgendas()
    expect(records.find((x) => x.id === r.id)!.status).toBe('resumed')
  })
})
