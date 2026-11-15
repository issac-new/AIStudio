// 会话溯源面测试（2026-11-15 挂账清偿·完整会话溯源）：
// 纯函数投影（sessionId/taskId 两路、agenda 卡锚派生、diff 提取、缺口诚实）+ IO 适配器（三源 fail-soft）+ REST。
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { buildLineage, collectLineage, type LineageSources } from '../lineage'

const approval = (sessionId: string, over: Record<string, unknown> = {}) => ({
  recordType: 'approval.resolved', tool: 'Bash', riskClass: 'shell', mode: 'guarded',
  policyId: 'p', policyVersion: '1', sessionId, profile: 'pf', entryPoint: 'test',
  decidedBy: 'policy:risk-evaluated', ts: '2026-11-15T00:00:00Z', recordId: `r-${Math.random().toString(36).slice(2, 7)}`,
  ...over,
})

const agenda = (over: Record<string, unknown> = {}) => ({
  id: 'sa-1', title: '等卡完成', mandateGoal: '把里程碑推到上线', status: 'parked',
  parkedAt: 1, resumeCount: 0, ...over,
})

const sources = (over: Partial<LineageSources> = {}): LineageSources => ({
  approvals: [], agendas: [], evidence: [], ...over,
})

describe('buildLineage（纯函数）', () => {
  it('sessionId 过滤审批账；agenda 卡锚派生 taskId；diff 从 revision 提取', () => {
    const view = buildLineage({ sessionId: 's1' }, sources({
      approvals: [approval('s1'), approval('s2')],
      agendas: [agenda({ sessionId: 's1', cardId: 'card-A' })],
      evidence: [
        { evidenceId: 'e1', taskId: 'card-A', kind: 'delivery_snapshot', at: 10, ref: 'git', revision: { base: 'abc', head: 'def' } },
        { evidenceId: 'e2', taskId: 'card-A', kind: 'verification', at: 11, ref: 'log', verdict: 'pass' },
      ] as never,
    }))
    expect(view.decisions).toHaveLength(1)
    expect(view.intents[0].cardId).toBe('card-A')
    expect(view.coverage.derivedTaskId).toBe('card-A')
    expect(view.diffs).toEqual([{ evidenceId: 'e1', base: 'abc', head: 'def', at: 10 }])
    expect(view.evidence).toHaveLength(2)
  })

  it('taskId 直给：agenda 按 cardId 匹配，审批账不按会话取（无 sessionId）', () => {
    const view = buildLineage({ taskId: 'card-B' }, sources({
      approvals: [approval('s1')],
      agendas: [agenda({ cardId: 'card-B' }), agenda({ id: 'sa-2', cardId: 'card-C' })],
    }))
    expect(view.decisions).toHaveLength(0)
    expect(view.intents.map((i) => i.id)).toEqual(['sa-1'])
    expect(view.coverage.derivedTaskId).toBe('card-B')
  })

  it('缺 key 抛错（不猜一个默认会话）', () => {
    expect(() => buildLineage({}, sources())).toThrow(/sessionId 或 taskId/)
  })

  it('缺口如实：无审批/无证据/无 agenda 各进 note，不补零凑数', () => {
    const view = buildLineage({ sessionId: 'ghost' }, sources())
    expect(view.decisions).toHaveLength(0)
    expect(view.evidence).toHaveLength(0)
    expect(view.note).toContain('未覆盖')
    expect(view.note).toContain('缺口')
    expect(view.note).toContain('审批账本无记录')
  })
})

describe('collectLineage（IO 适配器）', () => {
  let dir: string
  const prev: Record<string, string | undefined> = {}
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lineage-'))
    for (const k of ['HERMES_APPROVAL_LEDGER_DIR', 'HERMES_STANDING_AGENDA_DIR', 'HERMES_EVIDENCE_DIR']) prev[k] = process.env[k]
    process.env.HERMES_APPROVAL_LEDGER_DIR = join(dir, 'ledger')
    process.env.HERMES_STANDING_AGENDA_DIR = join(dir, 'agenda')
    process.env.HERMES_EVIDENCE_DIR = join(dir, 'evidence')
  })
  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    rmSync(dir, { recursive: true, force: true })
  })

  it('三源全空也返回合法视图（fail-soft，不抛）', () => {
    const view = collectLineage({ sessionId: 's-none' })
    expect(view.key.sessionId).toBe('s-none')
    expect(view.coverage.approvalsScanned).toBe(0)
    expect(view.note).toContain('未覆盖')
  })

  it('写入 agenda 后按 sessionId 可取到意图', async () => {
    const store = await import('../../standingagenda/agenda-store')
    store.appendAgenda({
      id: store.newAgendaId(), title: 't', mandateGoal: 'm', evidence: ['docs/x.md:1'],
      resumeCondition: { type: 'git', ref: 'main' } as never,
      parkedAt: Date.now(), status: 'parked', resumeCount: 0, sessionId: 's-1',
    } as never)
    const view = collectLineage({ sessionId: 's-1' })
    expect(view.intents).toHaveLength(1)
    expect(view.intents[0].title).toBe('t')
  })
})

describe('REST /api/harness/lineage', () => {
  let server: import('node:http').Server | undefined
  let base = ''
  beforeAll(async () => {
    const Koa = (await import('koa')).default
    const { default: Router } = await import('@koa/router')
    const { harnessRoutes } = await import('../../harness/harness-controller')
    const root = new Router()
    root.use(harnessRoutes.routes(), harnessRoutes.allowedMethods())
    const app = new Koa()
    app.use(root.routes())
    server = createServer(app.callback())
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  })
  afterAll(() => server?.close())

  it('缺 key → 400；给 sessionId → 合法视图（含未覆盖声明）', async () => {
    const bad = await fetch(`${base}/api/harness/lineage`)
    expect(bad.status).toBe(400)
    const okRes = await fetch(`${base}/api/harness/lineage?sessionId=s-rest`)
    expect(okRes.status).toBe(200)
    const body = (await okRes.json()) as { lineage: { key: { sessionId?: string }; note: string } }
    expect(body.lineage.key.sessionId).toBe('s-rest')
    expect(body.lineage.note).toContain('未覆盖')
  })
})
