// 交接质量 REST 契约：真实看板读取 + 参数校验 + 空库降级。
// 隔离：看板根指向临时目录；用 vi.mock 替换 boards-reader，避免依赖宿主 sqlite 形态。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'

const NOW_SEC = Math.floor(Date.now() / 1000)
const boards = [
  {
    slug: 'default',
    available: true,
    tasks: [
      { id: 't1', title: '卡一', status: 'done' },
      { id: 't2', title: '卡二', status: 'running' },
    ],
    events: [
      { taskId: 't1', kind: 'claimed', at: NOW_SEC - 7200, seq: 1 },
      { taskId: 't1', kind: 'completed', at: NOW_SEC - 3600, seq: 2 },
      { taskId: 't2', kind: 'claimed', at: NOW_SEC - 10 * 3600, seq: 3 },
    ],
  },
  { slug: 'broken', available: false, tasks: [], events: [], error: 'main db missing' },
]

vi.mock('../../delivery/boards-reader', () => ({ readAllBoards: () => boards }))
vi.mock('../../delivery/kanban-home', () => ({
  resolveKanbanHome: () => ({ home: '/tmp/fake-kanban', tried: [] }),
  kanbanHomeCandidates: () => ['/tmp/fake-kanban'],
}))

let dir: string
let server: import('node:http').Server | undefined
let base: string

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'handoff-http-'))
  const Koa = (await import('koa')).default
  const bodyParser = (await import('@koa/bodyparser')).default
  const { handoffRoutes } = await import('../handoff-controller')
  const app = new Koa()
  app.use(bodyParser())
  app.use(handoffRoutes.routes())
  server = createServer(app.callback())
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})

afterEach(() => {
  server?.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('GET /quality', () => {
  it('真实读数：完成 1 回合、停滞 1、掉落 0，坏板如实计入 boardErrors', async () => {
    const res = await fetch(`${base}/quality?windowHours=24&stallHours=6`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      report: { episodes: number; completed: number; stalled: number; takeoverSuccessRate: number | null; note: string }
      boards: number
      boardsAvailable: number
      boardErrors: Array<{ slug: string }>
    }
    expect(body.ok).toBe(true)
    expect(body.report.completed).toBe(1)
    expect(body.report.stalled).toBe(1) // t2 10h 前认领、阈值 6h、任务未 done → 停滞
    expect(body.boards).toBe(2)
    expect(body.boardsAvailable).toBe(1)
    expect(body.boardErrors[0].slug).toBe('broken')
    expect(body.report.note).toContain('不猜')
  })

  it('参数校验：windowHours 越界 400、stallHours 越界 400', async () => {
    expect((await fetch(`${base}/quality?windowHours=0`)).status).toBe(400)
    expect((await fetch(`${base}/quality?windowHours=9999`)).status).toBe(400)
    expect((await fetch(`${base}/quality?stallHours=0`)).status).toBe(400)
    expect((await fetch(`${base}/quality?stallHours=999`)).status).toBe(400)
  })
})

describe('POST /acceptance/check', () => {
  it('调用方观测证据：全部成立 → allHold；缺证据 → unchecked 且不放行', async () => {
    const okRes = await fetch(`${base}/acceptance/check`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        criteria: ['file_exists: out/a.md', 'test_passed: npm test'],
        artifacts: [{ path: 'out/a.md', exists: true, readable: true, size: 10 }],
        commands: [{ command: 'npm test', exitCode: 0, stdoutTail: 'Tests 5 passed' }],
      }),
    })
    expect(okRes.status).toBe(200)
    const okBody = (await okRes.json()) as { verdict: { allHold: boolean; applicable: boolean } }
    expect(okBody.verdict.applicable).toBe(true)
    expect(okBody.verdict.allHold).toBe(true)

    const missRes = await fetch(`${base}/acceptance/check`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ criteria: ['file_exists: out/missing.md'] }),
    })
    const missBody = (await missRes.json()) as { verdict: { allHold: boolean; unchecked: string[] } }
    expect(missBody.verdict.allHold).toBe(false)
    expect(missBody.verdict.unchecked).toEqual(['file_exists: out/missing.md'])
  })

  it('无断言 → 400；root 不在允许根 → 问题如实回传', async () => {
    const empty = await fetch(`${base}/acceptance/check`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ criteria: [] }),
    })
    expect(empty.status).toBe(400)

    const guarded = await fetch(`${base}/acceptance/check`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ criteria: ['file_exists: x'], root: '/definitely/not/allowed' }),
    })
    expect(guarded.status).toBe(200)
    const gb = (await guarded.json()) as { verdict: { allHold: boolean }; problems?: string[] }
    expect(gb.verdict.allHold).toBe(false)
    expect(gb.problems?.[0]).toContain('不在允许根内')
  })
})

describe('POST /claims/verify', () => {
  it('无证据台账 → 所有引用不可解析；有证据后同一断言通过', async () => {
    const evDir = mkdtempSync(join(tmpdir(), 'claims-ev-'))
    const prev = process.env.HERMES_EVIDENCE_DIR
    process.env.HERMES_EVIDENCE_DIR = evDir
    try {
      const missRes = await fetch(`${base}/claims/verify`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskId: 'task-x', claims: [{ id: 'c1', text: '我修好了', evidenceRefs: ['ev-1'] }] }),
      })
      expect(missRes.status).toBe(200)
      const miss = (await missRes.json()) as { report: { allVerified: boolean; claims: Array<{ issues: string[] }> } }
      expect(miss.report.allVerified).toBe(false)
      expect(miss.report.claims[0].issues).toEqual(['unresolvable_receipt'])

      const store = await import('../../evidence/evidence-store')
      const appended = store.appendEvidence({ evidenceId: 'ev-1', taskId: 'task-x', kind: 'artifact', at: Date.now(), ref: 'docs/x.md' } as never)
      expect(appended.ok ?? true).toBeTruthy()

      const okRes = await fetch(`${base}/claims/verify`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskId: 'task-x', claims: [{ id: 'c1', text: '我修好了', evidenceRefs: ['ev-1'] }] }),
      })
      const okBody = (await okRes.json()) as { report: { allVerified: boolean } }
      expect(okBody.report.allVerified).toBe(true)
    } finally {
      if (prev === undefined) delete process.env.HERMES_EVIDENCE_DIR
      else process.env.HERMES_EVIDENCE_DIR = prev
      rmSync(evDir, { recursive: true, force: true })
    }
  })

  it('缺 taskId / 空 claims → 400', async () => {
    const noTask = await fetch(`${base}/claims/verify`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ claims: [{ id: 'c' }] }),
    })
    expect(noTask.status).toBe(400)
    const noClaims = await fetch(`${base}/claims/verify`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskId: 't' }),
    })
    expect(noClaims.status).toBe(400)
  })
})

describe('交接规则端点（EvoTeam 吸收）', () => {
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })

  it('GET /rules 读仓内正本；POST /rules/select 命中契约并渲染中文标签', async () => {
    const lib = await (await fetch(`${base}/rules`)).json() as { ok: boolean; available: boolean; families: unknown[] }
    expect(lib.ok).toBe(true)
    expect(lib.available).toBe(true)
    expect(lib.families.length).toBeGreaterThanOrEqual(1)

    const res = await post('/rules/select', { from: 'in_progress', to: 'review' })
    expect(res.status).toBe(200)
    const body = await res.json() as { selection: { rule: { ruleId: string } | null }; line: string | null }
    expect(body.selection.rule?.ruleId).toBe('in-progress-to-review-evidence')
    expect(body.line).toContain('改动文件清单')
  })

  it('conformance：缺证据报 missing；无 to → 400；未知规则 → 404', async () => {
    const conf = await post('/rules/conformance', {
      ruleId: 'in-progress-to-review-evidence',
      presentEvidence: ['changed_files'],
    })
    const confBody = await conf.json() as { conformance: { ok: boolean; missing: string[] } }
    expect(confBody.conformance.ok).toBe(false)
    expect(confBody.conformance.missing).toContain('repro_command')

    expect((await post('/rules/select', { from: 'in_progress' })).status).toBe(400)
    expect((await post('/rules/conformance', { ruleId: 'nope' })).status).toBe(404)
  })
})
