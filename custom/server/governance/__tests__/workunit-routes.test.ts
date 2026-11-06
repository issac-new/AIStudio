// 执行单元责任台账 REST 守门（2026-11-06 第一增量）：卡/迁移/署名/自然人四条链路。
// 真 koa + fetch；身份册与自然人台账全 tmpdir 隔离（不触真 home）。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer } from 'http'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import type { AddressInfo } from 'net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'workunit-http-'))
let base = ''
let unitId = ''
let alice = ''
let bob = ''

beforeAll(async () => {
  process.env.AGENT_IDENTITY_STORE = dir
  process.env.AGENT_IDENTITY_NO_EVENTS = '0'
  const { governanceRoutes } = await import('../governance-controller')
  const app = new Koa()
  app.use(bodyParser())
  app.use(governanceRoutes.routes())
  const server = createServer(app.callback())
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  const a = await req('POST', '/api/governance/people', { name: 'alice', emails: ['a@x'], source: 'git' })
  alice = a.body.person.id
  await req('POST', `/api/governance/people/${alice}/activate`)
  const b = await req('POST', '/api/governance/people', { name: 'bob', emails: ['b@x'], source: 'git' })
  bob = b.body.person.id
  await req('POST', `/api/governance/people/${bob}/activate`)

  const reg = await req('POST', '/api/governance/agent-identity/register', { name: 'worker', kind: 'agent', owner: 'team' })
  unitId = reg.body.identity.id

  afterAll(() => {
    server.close()
    rmSync(dir, { recursive: true, force: true })
    delete process.env.AGENT_IDENTITY_STORE
    delete process.env.AGENT_IDENTITY_NO_EVENTS
  })
})

async function req(method: string, path: string, payload?: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, {
    method,
    ...(payload !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}),
  })
  return { status: res.status, body: await res.json() }
}

function card(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    deliveryStandard: '交付可复现的测试报告与证据链',
    riskTier: 'medium',
    primaryOwner: alice,
    escalation: ['关键规则无法验证时升级'],
    pauseConditions: ['出现越权调用时暂停'],
    takerOver: bob,
    testCaseVersion: 'tc-2026-11-06',
    costBudget: { limit: 100, unit: 'CNY/轮' },
    maintainer: alice,
    deploymentLocation: 'studio:8802',
    businessOwnerSign: { signedBy: alice, signedAt: Date.now() },
    admissionEvidence: { representativeTasks: ['t1'], edgeCases: ['e1'], dataPermissionReview: ['d1'], recordedAt: Date.now() },
    ...overrides,
  }
}

describe('workunit routes', () => {
  it('无卡时缺口可见', async () => {
    const r = await req('GET', `/api/governance/agent-identity/${unitId}/card`)
    expect(r.status).toBe(200)
    expect(r.body.view.stage).toBe('registered')
    expect(r.body.view.gaps.length).toBeGreaterThan(0)
  })

  it('缺交付标准的卡被拒', async () => {
    const r = await req('PUT', `/api/governance/agent-identity/${unitId}/card`, card({ deliveryStandard: ' ' }))
    expect(r.status).toBe(400)
    expect(r.body.problems.join()).toContain('deliveryStandard')
  })

  it('完整卡可保存并走完准入/运行', async () => {
    expect((await req('PUT', `/api/governance/agent-identity/${unitId}/card`, card())).status).toBe(200)
    expect((await req('POST', `/api/governance/agent-identity/${unitId}/transition`, { to: 'admitted', by: alice, reason: '卡与准入证据齐备' })).status).toBe(200)
    expect((await req('POST', `/api/governance/agent-identity/${unitId}/transition`, { to: 'running', by: alice, reason: '启动' })).status).toBe(200)
    const v = await req('GET', `/api/governance/agent-identity/${unitId}/card`)
    expect(v.body.view.stage).toBe('running')
  })

  it('署名记录写入与读取（只收 human-entry）', async () => {
    const w = await req('POST', `/api/governance/agent-identity/${unitId}/judgments`, {
      kind: 'acceptance', subjectRef: 'g1-freeze', signedBy: alice,
      rationale: '复核了需求冻结单的三条边界用例，结论与证据一致，同意通过',
      evidenceRefs: ['ev-1'],
    })
    expect(w.status).toBe(200)
    expect(w.body.record.source).toBe('human-entry')
    const list = await req('GET', `/api/governance/agent-identity/${unitId}/judgments`)
    expect(list.body.records).toHaveLength(1)
  })

  it('非在岗自然人署名被拒', async () => {
    const r = await req('POST', `/api/governance/agent-identity/${unitId}/judgments`, {
      kind: 'override', subjectRef: 'x', signedBy: 'p-404',
      rationale: '这是一条足够长的推翻理由说明，用于验证署名主体校验',
    })
    expect(r.status).toBe(400)
  })

  it('自然人名单可读，激活后 active=true', async () => {
    const r = await req('GET', '/api/governance/people')
    expect(r.status).toBe(200)
    const a = r.body.people.find((p: { id: string }) => p.id === alice)
    expect(a?.active).toBe(true)
  })
})
