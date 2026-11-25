// 审查挂账5/6 守门：agent-identity register/update 的户口三要素
// （capabilityBoundary / auditRequirement / runtimeBindings）形态显式校验。
// 缺陷：objectField 对字符串、数组、null 等非对象形态静默返回 undefined——
// 等价于「没传该字段」，调用方得不到 400 提示（如误传字符串形态的
// runtimeBindings 会登记成未绑定单元且无人知晓）。修复：键存在但非普通
// 对象即 400 problems 点名键名；键不存在（undefined）不算形态错，存量行为不变。
// 夹具同 p10-p7-write-guard.test.ts：匿名 app（未启用鉴权放行到业务校验）+
// GOVERNANCE_REPO/AGENT_IDENTITY_STORE 指临时目录，测试自包含。
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from 'http'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import type { AddressInfo } from 'net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'child_process'

const repo = mkdtempSync(join(tmpdir(), 'objfield-repo-'))
const idStore = mkdtempSync(join(tmpdir(), 'objfield-id-'))

function git(args: string[]) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
}

let base = ''
let close = () => {}

beforeAll(async () => {
  git(['init', '-b', 'main'])
  git(['config', 'user.email', 't@t'])
  git(['config', 'user.name', 't'])
  git(['remote', 'add', 'origin', repo])
  process.env.GOVERNANCE_REPO = repo
  process.env.AGENT_IDENTITY_STORE = join(idStore, 'store')
  const { governanceRoutes } = await import('../governance-controller')
  const app = new Koa()
  app.use(bodyParser())
  app.use(governanceRoutes.routes())
  const server = createServer(app.callback())
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  close = () => server.close()
})

afterAll(() => {
  close()
  rmSync(repo, { recursive: true, force: true })
  rmSync(idStore, { recursive: true, force: true })
  delete process.env.GOVERNANCE_REPO
  delete process.env.AGENT_IDENTITY_STORE
})

async function post(path: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return { status: res.status, body: await res.json() }
}

const validRegister = { name: 'u-obj', kind: 'agent', owner: 'alice' }

describe('户口三要素形态显式校验（审查挂账5/6）', () => {
  it.each([
    ['capabilityBoundary', 'delivery-standard-x'],
    ['auditRequirement', ['audit-1', 'audit-2']],
    ['runtimeBindings', null],
  ])('register：%s 传非对象形态 → 400 且 problems 点名键名', async (key, badValue) => {
    const r = await post('/api/governance/agent-identity/register', { ...validRegister, [key]: badValue })
    expect(r.status).toBe(400)
    expect(r.body.ok).toBe(false)
    expect(r.body.problems.join()).toContain(key)
    expect(r.body.problems.join()).toContain('须为对象')
  })

  it('register：三要素同时形态错 → 逐键全点名（不首错中断）', async () => {
    const r = await post('/api/governance/agent-identity/register', {
      ...validRegister, capabilityBoundary: 'x', auditRequirement: 42, runtimeBindings: [],
    })
    expect(r.status).toBe(400)
    for (const k of ['capabilityBoundary', 'auditRequirement', 'runtimeBindings']) {
      expect(r.body.problems.join()).toContain(k)
    }
  })

  it('update：同款显式校验（字符串形态 → 400 点名）', async () => {
    // 先合法登记拿 id（无三要素 → 不触发形态校验路径）
    const reg = await post('/api/governance/agent-identity/register', validRegister)
    expect(reg.status).toBe(200)
    expect(reg.body.ok).toBe(true)
    const id = reg.body.identity?.id ?? reg.body.id
    expect(id).toBeTruthy()
    const r = await post(`/api/governance/agent-identity/${id}/update`, { runtimeBindings: 'agents-zcode' })
    expect(r.status).toBe(400)
    expect(r.body.problems.join()).toContain('runtimeBindings')
  })

  it('键不存在（undefined）与合法对象形态 → 行为不变（存量注册面回归）', async () => {
    const ok = await post('/api/governance/agent-identity/register', {
      name: 'u-obj-clean', kind: 'agent', owner: 'alice',
      runtimeBindings: { agents: ['zcode-clean'], matrixAccounts: [] },
    })
    expect(ok.status).toBe(200)
    expect(ok.body.ok).toBe(true)
    // 未传三要素的登记仍然成功（形态校验不误伤）
    const plain = await post('/api/governance/agent-identity/register', { name: 'u-obj-plain', kind: 'agent', owner: 'alice' })
    expect(plain.status).toBe(200)
    expect(plain.body.ok).toBe(true)
  })
})
