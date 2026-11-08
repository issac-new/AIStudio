// 团队库 REST 契约：读模型、建议选择、参数校验、源缺席降级。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'

const YAML = `
version: 1
families:
  - family_id: impl-independent-verify
    description: 跨文件实现与独立验证
    identity:
      work_type: implementation
      required_roles: [implementer, verifier]
    keywords: [实现, 重构]
    candidate_roster: [worker-coder, worker-tester]
    version: 1
    status: active
    evidence: { task_ids: [], successful: [], failed: [] }
`

let dir = ''
let server: Server | undefined
let base = ''

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'team-library-http-'))
  const file = join(dir, 'team-library.yaml')
  writeFileSync(file, YAML, 'utf8')
  process.env.TEAM_LIBRARY_PATH = file
  const Koa = (await import('koa')).default
  const bodyParser = (await import('@koa/bodyparser')).default
  const { teamLibraryRoutes } = await import('../controller')
  const app = new Koa()
  app.use(bodyParser())
  app.use(teamLibraryRoutes.routes())
  server = createServer(app.callback())
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})

afterEach(() => {
  server?.close()
  delete process.env.TEAM_LIBRARY_PATH
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('团队库端点', () => {
  it('GET / 返回 available + families', async () => {
    const body = await (await fetch(`${base}/`)).json() as { ok: boolean; available: boolean; families: unknown[] }
    expect(body.ok).toBe(true)
    expect(body.available).toBe(true)
    expect(body.families).toHaveLength(1)
  })

  it('POST /select 命中 reuse；无关任务 cold_start；空任务 400', async () => {
    const reuse = await fetch(`${base}/select`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: '重构跨文件实现' }),
    })
    const reuseBody = await reuse.json() as { selection: { action: string; familyId: string | null } }
    expect(reuseBody.selection.action).toBe('reuse')
    expect(reuseBody.selection.familyId).toBe('impl-independent-verify')

    const cold = await fetch(`${base}/select`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: '写一份周报' }),
    })
    expect(((await cold.json()) as { selection: { action: string } }).selection.action).toBe('cold_start')

    expect((await fetch(`${base}/select`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task: '' }),
    })).status).toBe(400)
  })

  it('源缺席 → 200 + available:false（fail-soft，不猜）', async () => {
    process.env.TEAM_LIBRARY_PATH = join(dir, 'missing.yaml')
    const body = await (await fetch(`${base}/`)).json() as { ok: boolean; available: boolean; reason: string }
    expect(body.ok).toBe(true)
    expect(body.available).toBe(false)
    expect(body.reason).toContain('缺席')
  })
})
