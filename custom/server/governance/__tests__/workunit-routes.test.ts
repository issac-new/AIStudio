// 执行单元责任台账 REST 守门（2026-11-06 第一增量；2026-11-24 批一 Task 3 带登录态）：
// 卡/迁移/署名/签署/自然人五条链路。真 koa + fetch；身份册与自然人台账全 tmpdir 隔离（不触真 home）。
// 登录名即自然人 id：写入类路由的迁移人/签署人/署名人均取服务端登录身份，请求体同名字段不采纳。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer } from 'http'
import { readFileSync, writeFileSync } from 'node:fs'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import type { AddressInfo } from 'net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'workunit-http-'))
let base = ''
let unitId = ''
let alice = 'alice'
let bob = 'bob'

beforeAll(async () => {
  process.env.AGENT_IDENTITY_STORE = dir
  process.env.AGENT_IDENTITY_NO_EVENTS = '0'
  const { governanceRoutes } = await import('../governance-controller')
  const app = new Koa()
  app.use(bodyParser())
  // 测试登录态中间件：req 的 as 参数经请求头传入，置 ctx.state.user（requireAuthenticatedActor 的唯一信源）
  app.use(async (ctx, next) => {
    const as = ctx.get('x-test-actor')
    if (as) ctx.state.user = { id: as, username: as, role: 'super_admin' }
    await next()
  })
  app.use(governanceRoutes.routes())
  const server = createServer(app.callback())
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  const a = await req('POST', '/api/governance/people', { id: alice, name: 'alice', emails: ['a@x'], source: 'git' })
  alice = a.body.person.id
  await req('POST', `/api/governance/people/${alice}/activate`)
  const b = await req('POST', '/api/governance/people', { id: bob, name: 'bob', emails: ['b@x'], source: 'git' })
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

async function req(method: string, path: string, payload?: unknown, as?: string): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {}
  if (payload !== undefined) headers['Content-Type'] = 'application/json'
  if (as) headers['x-test-actor'] = as
  const res = await fetch(`${base}${path}`, {
    method,
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
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
    admissionEvidence: { representativeTasks: ['t1'], edgeCases: ['e1'], dataPermissionReview: ['d1'], recordedAt: Date.now() },
    ...overrides,
  }
}

/** 登记一个带完整责任卡的执行单元（不签署），返回单元 id。 */
async function freshUnit(name: string): Promise<string> {
  const reg = await req('POST', '/api/governance/agent-identity/register', { name, kind: 'agent', owner: 'team' })
  expect(reg.status).toBe(200)
  const saved = await req('PUT', `/api/governance/agent-identity/${reg.body.identity.id}/card`, card())
  expect(saved.status).toBe(200)
  return reg.body.identity.id as string
}

/** 直接改身份册文件（模拟存量旧数据，绕过 API 不写事件）。 */
function tamperStore(mutate: (store: any) => void): void {
  const file = join(dir, 'identities.json')
  const store = JSON.parse(readFileSync(file, 'utf8'))
  mutate(store)
  writeFileSync(file, JSON.stringify(store, null, 2))
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

  it('保存责任卡不采纳请求体里的签署字段', async () => {
    const r = await req('PUT', `/api/governance/agent-identity/${unitId}/card`, card({ businessOwnerSign: { signedBy: bob, signedAt: 1 } }), 'alice')
    expect(r.status).toBe(200)
    expect(r.body.identity.responsibilityCard.businessOwnerSign).toBeUndefined()
  })

  it('注册透传 capabilityBoundary/auditRequirement/runtimeBindings 并规范化', async () => {
    const r = await req('POST', '/api/governance/agent-identity/register', {
      name: 'full-unit', kind: 'agent', owner: 'team',
      capabilityBoundary: { can: [' 改代码 '], cannot: ['改发布'] },
      auditRequirement: { sampling: 0.5, retentionDays: 30 }, runtimeBindings: { agents: ['zcode'] },
    }, 'alice')
    expect(r.status).toBe(200)
    expect(r.body.identity.capabilityBoundary).toEqual({ can: ['改代码'], cannot: ['改发布'] })
    expect(r.body.identity.auditRequirement.sampling).toBe(0.5)
    expect(r.body.identity.runtimeBindings).toEqual({ agents: ['zcode'] })
  })

  it('完整卡可保存并走完准入/运行', async () => {
    expect((await req('PUT', `/api/governance/agent-identity/${unitId}/card`, card())).status).toBe(200)
    // 准入前先由业务负责人独立签署（签署绑定卡版本指纹）
    expect((await req('POST', `/api/governance/agent-identity/${unitId}/card/sign`, {}, 'alice')).status).toBe(200)
    expect((await req('POST', `/api/governance/agent-identity/${unitId}/transition`, { to: 'admitted', by: alice, reason: '卡与准入证据齐备' }, 'alice')).status).toBe(200)
    expect((await req('POST', `/api/governance/agent-identity/${unitId}/transition`, { to: 'running', by: alice, reason: '启动' }, 'alice')).status).toBe(200)
    const v = await req('GET', `/api/governance/agent-identity/${unitId}/card`)
    expect(v.body.view.stage).toBe('running')
  })

  it('未登录的迁移 → 401 authenticated_actor_required', async () => {
    const r = await req('POST', `/api/governance/agent-identity/${unitId}/transition`, { to: 'admitted', by: alice, reason: 'x' })
    expect(r.status).toBe(401)
  })

  it('请求体冒填迁移人不生效：记录里 by 是登录人', async () => {
    // 以 alice 登录、body.by 写 bob；迁移成功后 GET /card，断言 lifecycle.history.at(-1).by === alice
    const r = await req('POST', `/api/governance/agent-identity/${unitId}/transition`, { to: 'changing', by: bob, reason: 'x' }, 'alice')
    expect(r.status).toBe(200)
    const v = await req('GET', `/api/governance/agent-identity/${unitId}/card`)
    expect(v.body.view.lifecycle.history.at(-1).by).toBe(alice)
  })

  it('登录人不是在岗自然人 → 400，问题列表含「在岗自然人」', async () => {
    // 以 'mallory' 登录（未登记）；断言 400 且 problems.join() 含 '在岗自然人'
    const r = await req('POST', `/api/governance/agent-identity/${unitId}/transition`, { to: 'running', by: 'mallory', reason: 'x' }, 'mallory')
    expect(r.status).toBe(400)
    expect(r.body.problems.join()).toContain('在岗自然人')
  })

  it('请求体冒填署名记录签署人不生效', async () => {
    // 以 alice 登录、body.signedBy 写 bob；断言 record.signedBy === alice
    const w = await req('POST', `/api/governance/agent-identity/${unitId}/judgments`, {
      kind: 'acceptance', subjectRef: 'g1-freeze', signedBy: bob,
      rationale: '复核了需求冻结单的三条边界用例，结论与证据一致，同意通过',
      evidenceRefs: ['ev-1'],
    }, 'alice')
    expect(w.status).toBe(200)
    expect(w.body.record.signedBy).toBe(alice)
  })

  it('署名记录写入与读取（只收 human-entry）', async () => {
    const w = await req('POST', `/api/governance/agent-identity/${unitId}/judgments`, {
      kind: 'acceptance', subjectRef: 'g2-design',
      rationale: '复核了概要设计的三条边界用例，结论与证据一致，同意通过',
      evidenceRefs: ['ev-2'],
    }, 'alice')
    expect(w.status).toBe(200)
    expect(w.body.record.source).toBe('human-entry')
    const list = await req('GET', `/api/governance/agent-identity/${unitId}/judgments`)
    expect(list.body.records).toHaveLength(2)
  })

  it('非在岗自然人署名被拒', async () => {
    const r = await req('POST', `/api/governance/agent-identity/${unitId}/judgments`, {
      kind: 'override', subjectRef: 'x',
      rationale: '这是一条足够长的推翻理由说明，用于验证署名主体校验',
    }, 'mallory')
    expect(r.status).toBe(400)
  })

  it('签署：未登录 401；登录人非在岗 400；在岗登录人签署成功并带 cardRevision', async () => {
    const no = await req('POST', `/api/governance/agent-identity/${unitId}/card/sign`, {})
    expect(no.status).toBe(401)
    const bad = await req('POST', `/api/governance/agent-identity/${unitId}/card/sign`, {}, 'mallory')
    expect(bad.status).toBe(400)
    const okr = await req('POST', `/api/governance/agent-identity/${unitId}/card/sign`, {}, 'alice')
    expect(okr.status).toBe(200)
    expect(okr.body.card.businessOwnerSign).toMatchObject({ signedBy: alice, stale: false })
    expect(okr.body.card.businessOwnerSign.cardRevision).toMatch(/^[0-9a-f]{64}$/)
  })

  it('签后改卡内容 → stale=true；改回原样 → stale=false', async () => {
    // 签署 → PUT card({ deliveryStandard: '改了' }) → stale true
    const target = await freshUnit('stale-unit')
    const signed = await req('POST', `/api/governance/agent-identity/${target}/card/sign`, {}, 'alice')
    const revision = signed.body.card.businessOwnerSign.cardRevision
    expect((await req('PUT', `/api/governance/agent-identity/${target}/card`, card({ deliveryStandard: '改了' }), 'alice')).status).toBe(200)
    const staleView = await req('GET', `/api/governance/agent-identity/${target}/card`)
    expect(staleView.body.view.card.businessOwnerSign.stale).toBe(true)
    // → PUT card()（原内容）→ stale false，cardRevision 不变
    expect((await req('PUT', `/api/governance/agent-identity/${target}/card`, card(), 'alice')).status).toBe(200)
    const restored = await req('GET', `/api/governance/agent-identity/${target}/card`)
    expect(restored.body.view.card.businessOwnerSign.stale).toBe(false)
    expect(restored.body.view.card.businessOwnerSign.cardRevision).toBe(revision)
  })

  it('凭失效签署准入被拒；凭无版本指纹的旧签署准入被拒', async () => {
    // stale 状态下 transition to admitted → 400，problems 含 '签署'
    const target = await freshUnit('stale-admission-unit')
    await req('POST', `/api/governance/agent-identity/${target}/card/sign`, {}, 'alice')
    await req('PUT', `/api/governance/agent-identity/${target}/card`, card({ deliveryStandard: '改了' }), 'alice')
    const staleTry = await req('POST', `/api/governance/agent-identity/${target}/transition`, { to: 'admitted', reason: 'x' }, 'alice')
    expect(staleTry.status).toBe(400)
    expect(staleTry.body.problems.join()).toContain('签署')
    // 直接写库把 cardRevision 删掉（并清 stale，模拟存量旧签署）→ transition to admitted → 400
    tamperStore((store) => {
      const identity = store.identities.find((i: any) => i.id === target)
      identity.responsibilityCard.businessOwnerSign.cardRevision = undefined
      identity.responsibilityCard.businessOwnerSign.stale = false
    })
    const legacyTry = await req('POST', `/api/governance/agent-identity/${target}/transition`, { to: 'admitted', reason: 'x' }, 'alice')
    expect(legacyTry.status).toBe(400)
    expect(legacyTry.body.problems.join()).toContain('重签')
  })

  it('准入须责任卡带三组准入证据', async () => {
    // PUT card({ admissionEvidence: undefined }) + 签署 + transition admitted → 400，problems 含 '准入'
    const target = await freshUnit('no-evidence-unit')
    expect((await req('PUT', `/api/governance/agent-identity/${target}/card`, card({ admissionEvidence: undefined }), 'alice')).status).toBe(200)
    expect((await req('POST', `/api/governance/agent-identity/${target}/card/sign`, {}, 'alice')).status).toBe(200)
    const r = await req('POST', `/api/governance/agent-identity/${target}/transition`, { to: 'admitted', reason: 'x' }, 'alice')
    expect(r.status).toBe(400)
    expect(r.body.problems.join()).toContain('准入')
  })

  it('退役自动撤权并返回 revoked 计数', async () => {
    // 另建身份 victim（已准入），登记 1 个凭证、给 bob 建委托、bob 给它建委托
    const victim = await freshUnit('victim-unit')
    const bobUnit = await req('POST', '/api/governance/agent-identity/register', { name: 'bob-unit', kind: 'agent', owner: 'team' })
    expect(bobUnit.status).toBe(200)
    const bobUnitId = bobUnit.body.identity.id
    await req('POST', `/api/governance/agent-identity/${victim}/card/sign`, {}, 'alice')
    expect((await req('POST', `/api/governance/agent-identity/${victim}/transition`, { to: 'admitted', reason: '准入' }, 'alice')).status).toBe(200)
    expect((await req('POST', `/api/governance/agent-identity/${victim}/credential`, { kind: 'api-key', label: 'prod-key' })).status).toBe(200)
    expect((await req('POST', `/api/governance/agent-identity/${victim}/delegate`, { to: bobUnitId, scope: '代表 victim 执行构建' })).status).toBe(200)
    expect((await req('POST', `/api/governance/agent-identity/${bobUnitId}/delegate`, { to: victim, scope: '代表 bob-unit 执行回归' })).status).toBe(200)
    // alice 登录迁 retired（exit: { kind:'revoke', items:['交接'], confirmedBy: alice })
    const r = await req('POST', `/api/governance/agent-identity/${victim}/transition`, {
      to: 'retired', reason: '下线', exit: { kind: 'revoke', items: ['交接'], confirmedBy: alice },
    }, 'alice')
    expect(r.status).toBe(200)
    // 断言 body.identity.revoked 等于 { credentials: 1, delegationsOut: 1, delegationsIn: 1 }
    expect(r.body.identity.revoked).toEqual({ credentials: 1, delegationsOut: 1, delegationsIn: 1 })
    // 断言 victim.credentials[0].status === 'revoked'，两条委托均带 revokedAt
    expect(r.body.identity.credentials[0].status).toBe('revoked')
    expect(r.body.identity.delegations[0].revokedAt).toBeTruthy()
    const all = await req('GET', '/api/governance/agent-identity')
    const bobRow = all.body.identities.find((i: any) => i.id === bobUnitId)
    expect(bobRow.delegations[0].revokedAt).toBeTruthy()
  })

  it('自然人停用端点：幂等并返回 referencedBy', async () => {
    // 登记并启用 carol 作为 unit 的 takerOver → 停用 carol → 200，referencedBy 含该单元；再停一次 → 200
    const c = await req('POST', '/api/governance/people', { id: 'carol', name: 'carol', emails: ['c@x'], source: 'manual' })
    expect(c.status).toBe(200)
    const carol = c.body.person.id
    await req('POST', `/api/governance/people/${carol}/activate`)
    expect((await req('PUT', `/api/governance/agent-identity/${unitId}/card`, card({ takerOver: carol }), 'alice')).status).toBe(200)
    const r1 = await req('POST', `/api/governance/people/${carol}/deactivate`, { reason: '离职' }, 'alice')
    expect(r1.status).toBe(200)
    expect(r1.body.person.active).toBe(false)
    expect(r1.body.referencedBy.some((u: any) => u.id === unitId)).toBe(true)
    const r2 = await req('POST', `/api/governance/people/${carol}/deactivate`, { reason: '重复' }, 'alice')
    expect(r2.status).toBe(200)
  })

  it('people 登记透传 mxids', async () => {
    const r = await req('POST', '/api/governance/people', { name: 'dave', mxids: ['@dave:sv'] }, 'alice')
    expect(r.status).toBe(200)
    expect(r.body.person.mxids).toEqual(['@dave:sv'])
  })

  it('自然人名单可读，激活后 active=true', async () => {
    const r = await req('GET', '/api/governance/people')
    expect(r.status).toBe(200)
    const a = r.body.people.find((p: { id: string }) => p.id === alice)
    expect(a?.active).toBe(true)
  })
})
