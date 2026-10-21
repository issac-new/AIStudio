// 工具策略 REST 守门（2026-10-21 AGT 调研轮）：GET 姿态/PUT 保存/lint/starter。
// 真 koa + fetch；策略目录与决策账全 tmpdir 隔离（不触真 home）。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from 'http'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import type { AddressInfo } from 'net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'tool-policy-http-'))
let base = ''

beforeAll(async () => {
  process.env.HERMES_TOOL_POLICY_DIR = join(dir, 'policies')
  process.env.POLICY_DECISION_DIR = join(dir, 'policy-decisions')
  process.env.HERMES_GOV_EVENT_DIR = join(dir, 'gov-events')
  process.env.GOVERNANCE_REPO = join(dir, 'no-repo')
  process.env.HERMES_TOOL_ENFORCE = '1'
  const { governanceRoutes } = await import('../governance-controller')
  const app = new Koa()
  app.use(bodyParser())
  app.use(governanceRoutes.routes())
  const server = createServer(app.callback())
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  afterAll(() => {
    server.close()
    rmSync(dir, { recursive: true, force: true })
    delete process.env.HERMES_TOOL_POLICY_DIR
    delete process.env.POLICY_DECISION_DIR
    delete process.env.HERMES_GOV_EVENT_DIR
    delete process.env.GOVERNANCE_REPO
    delete process.env.HERMES_TOOL_ENFORCE
  })
})

async function req(method: string, path: string, payload?: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, {
    method,
    ...(payload !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}),
  })
  return { status: res.status, body: await res.json() }
}

const validDoc = {
  mode: 'strict',
  rules: [
    {
      id: 'deny-rm', name: '禁止破坏性命令', enabled: true, priority: 100, action: 'deny',
      match: { categories: ['exec'], argPattern: 'rm\\s+-rf' },
      reason: '破坏性操作需人工',
    },
    {
      id: 'allow-read', name: '只读放行', enabled: true, priority: 10, action: 'allow',
      match: { categories: ['read'] },
    },
  ],
}

describe('工具策略 REST（/api/governance/tool-policies）', () => {
  it('GET 未配置=unconfigured；执法总闸状态如实', async () => {
    const { status, body } = await req('GET', '/api/governance/tool-policies')
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.exists).toBe(false)
    expect(body.posture.status).toBe('unconfigured')
    expect(body.enforcement.masterOn).toBe(true)
  })

  it('PUT 合法文档保存成功；GET 回读 strict 生效与规则数', async () => {
    const saved = await req('PUT', '/api/governance/tool-policies', validDoc)
    expect(saved.status).toBe(200)
    expect(saved.body.ok).toBe(true)
    expect(saved.body.doc.rules).toHaveLength(2)

    const { body } = await req('GET', '/api/governance/tool-policies')
    expect(body.exists).toBe(true)
    expect(body.posture.status).toBe('strict')
    expect(body.posture.enabledRules).toBe(2)
    expect(body.recent).toMatchObject({ days: 7, allow: 0, deny: 0 })
  })

  it('PUT 非法文档 400 带问题清单（不静默）', async () => {
    const bad = await req('PUT', '/api/governance/tool-policies', {
      mode: 'permissive',
      rules: [{ id: 'X', name: '', action: 'nope', match: { tools: ['*'] }, extra: 1 }],
    })
    expect(bad.status).toBe(400)
    expect(bad.body.problems.some((p: string) => p.includes('id'))).toBe(true)
    expect(bad.body.problems.some((p: string) => p.includes('action'))).toBe(true)
    expect(bad.body.problems.some((p: string) => p.includes('未知字段'))).toBe(true)
  })

  it('POST lint 独立校验（坏正则必红）；GET starter 返回三条起步规则', async () => {
    const lint = await req('POST', '/api/governance/tool-policies/lint', {
      mode: 'permissive',
      rules: [{ id: 'bad-re', name: '坏正则', action: 'deny', match: { argPattern: '(' } }],
    })
    expect(lint.status).toBe(200)
    expect(lint.body.problems.some((p: string) => p.includes('不是合法正则'))).toBe(true)

    const starter = await req('GET', '/api/governance/tool-policies/starter')
    expect(starter.status).toBe(200)
    expect(starter.body.doc.rules).toHaveLength(3)
    expect(starter.body.doc.mode).toBe('permissive')
  })
})
