// overlay/custom/server/governance/__tests__/p10-p7-write-guard.test.ts
// P10/P7 新写端点权限守门（2026-10-04 24h 审查轮增设）。
// 事故实锤：agent-identity 六个写端点 + heldout 建库/评分两端点落地时未挂
// superAdminDenied，而同文件既有写面（PUT /doc、registry、matrix-users/offboard、
// sync-gates、KG sync/resolve）全部有挂——启用鉴权的多用户部署下任意登录用户
// 可登记身份/发凭证/造委托/建密封题库/烧评分预算。
// 守门三条：① 非管理员 403；② 匿名（未启用鉴权）放行到业务校验；③ 两个
// heldout 写端点同闸（评分=消耗不可重置预算）。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from 'http'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import type { AddressInfo } from 'net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'child_process'

const repo = mkdtempSync(join(tmpdir(), 'gov-guard-'))
const idStore = mkdtempSync(join(tmpdir(), 'id-store-'))
const heldoutStore = mkdtempSync(join(tmpdir(), 'heldout-store-'))

function git(args: string[]) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
}

function makeApp(user: { username: string; role: string } | null): Promise<{ base: string; close: () => void }> {
  return (async () => {
    const { governanceRoutes } = await import('../governance-controller')
    const app = new Koa()
    app.use(bodyParser())
    if (user) app.use((ctx, next) => { ctx.state.user = user; return next() })
    app.use(governanceRoutes.routes())
    const server = createServer(app.callback())
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    return {
      base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      close: () => server.close(),
    }
  })()
}

let member: { base: string; close: () => void }
let anon: { base: string; close: () => void }

beforeAll(async () => {
  git(['init', '-b', 'main'])
  git(['config', 'user.email', 't@t'])
  git(['config', 'user.name', 't'])
  git(['remote', 'add', 'origin', repo])
  process.env.GOVERNANCE_REPO = repo
  process.env.AGENT_IDENTITY_STORE = join(idStore, 'store')
  process.env.HELDOUT_STORE = join(heldoutStore, 'store')
  member = await makeApp({ username: 'm', role: 'member' })
  anon = await makeApp(null)
})

afterAll(() => {
  member.close()
  anon.close()
  rmSync(repo, { recursive: true, force: true })
  rmSync(idStore, { recursive: true, force: true })
  rmSync(heldoutStore, { recursive: true, force: true })
})

async function post(base: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${base}/api/governance${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('P10/P7 写端点 superAdminDenied 守门', () => {
  it('非 super_admin 对 agent-identity 六写面全部 403', async () => {
    for (const [path, body] of [
      ['/agent-identity/register', { name: 'x', owner: 'o' }],
      ['/agent-identity/aid-001/update', { owner: 'o' }],
      ['/agent-identity/aid-001/credential', { kind: 'api-key', label: 'l' }],
      ['/agent-identity/aid-001/credential/revoke', { label: 'l' }],
      ['/agent-identity/aid-001/delegate', { to: 'aid-002', scope: 's' }],
      ['/agent-identity/aid-001/delegation/did-001/revoke', {}],
    ] as Array<[string, unknown]>) {
      const res = await post(member.base, path, body)
      expect(res.status, `${path} 应 403`).toBe(403)
    }
  })

  it('heldout 建库与评分（消耗不可重置预算）同闸 403', async () => {
    const create = await post(member.base, '/heldout/sets', { name: 's', items: [] })
    expect(create.status).toBe(403)
    const score = await post(member.base, '/heldout/sets/held-001/score', { answers: [] })
    expect(score.status).toBe(403)
  })

  it('未启用鉴权（匿名）放行到业务校验——单用户部署不回归', async () => {
    const res = await post(anon.base, '/agent-identity/register', { name: '', owner: '' })
    expect(res.status).not.toBe(403)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { ok: boolean; problems: string[] }
    expect(body.ok).toBe(false)
  })
})
