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
