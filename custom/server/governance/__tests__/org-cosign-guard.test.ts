// 治理者守卫：纯函数行级判定 + 认证主体会签/紧急通道集成。
// 身份只来自 ctx.state.user；请求体 actor/approver 一律按伪造输入处理。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'http'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import type { AddressInfo } from 'net'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'child_process'

const repo = mkdtempSync(join(tmpdir(), 'org-cosign-'))
const previousLocalOperator = process.env.AISTUDIO_LOCAL_OPERATOR
let server: Server
let base = ''

function git(args: string[]) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
}

const HEAD = ['', '| 账号 | 角色 | 汇报线(lead) | 板（team） | matrix 账号 |', '| --- | --- | --- | --- | --- |']
const ORG_INIT = [
  '# 研发组织与权限（org）', '',
  ...HEAD,
  '| admin | 主管（治理裁决） | — | — | @admin |',
  '| audit | 合规及审计管理 | admin | audit-board | @audit |',
  '| chen | 研发 | wei | chen-pay | @chen |',
  '',
].join('\n')

beforeAll(async () => {
  delete process.env.AISTUDIO_LOCAL_OPERATOR
  git(['init', '-b', 'main'])
  git(['config', 'user.email', 't@t'])
  git(['config', 'user.name', 't'])
  mkdirSync(join(repo, 'docs/admin'), { recursive: true })
  writeFileSync(join(repo, 'docs/admin/org.md'), ORG_INIT)
  git(['add', '-A'])
  git(['commit', '-m', 'init org'])

  process.env.GOVERNANCE_REPO = repo
  const { governanceRoutes } = await import('../governance-controller')
  const app = new Koa()
  app.use(bodyParser())
  app.use((ctx, next) => {
    const username = ctx.get('x-test-user').trim()
    if (username) {
      ctx.state.user = {
        id: username,
        username,
        role: ctx.get('x-test-role').trim() || 'user',
      }
    }
    return next()
  })
  app.use(governanceRoutes.routes())
  server = createServer(app.callback())
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  if (previousLocalOperator === undefined) delete process.env.AISTUDIO_LOCAL_OPERATOR
  else process.env.AISTUDIO_LOCAL_OPERATOR = previousLocalOperator
  rmSync(repo, { recursive: true, force: true })
})

interface TestUser { username: string; role?: string }
const admin: TestUser = { username: 'admin', role: 'super_admin' }
const audit: TestUser = { username: 'audit', role: 'user' }
const chen: TestUser = { username: 'chen', role: 'user' }

async function req(
  method: string,
  path: string,
  payload?: unknown,
  user?: TestUser,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
      ...(user ? { 'x-test-user': user.username, 'x-test-role': user.role ?? 'user' } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  })
  return { status: res.status, body: res.status === 204 ? null : await res.json() }
}

async function currentOrg(): Promise<string> {
  return (await req('GET', '/api/governance/registry/org')).body.markdown
}

function swapRow(md: string, from: string, to: string): string {
  return md.split('\n').map(l => (l.includes(from) ? to : l)).join('\n')
}

async function lib() {
  return await import('../registry-admin')
}

describe('纯函数：detectAdminRowChange / cosignEligible', () => {
  it('orgTableRows 提取数据行并跳过表头/分隔行', async () => {
    const { orgTableRows } = await lib()
    const rows = orgTableRows(ORG_INIT)
    expect(rows).toHaveLength(3)
    expect(rows[0][0]).toBe('admin')
  })

  it('isAdminRow：账号=admin 或角色含「治理裁决」', async () => {
    const { isAdminRow } = await lib()
    expect(isAdminRow(['admin', '主管'])).toBe(true)
    expect(isAdminRow(['boss', '主管（治理裁决）'])).toBe(true)
    expect(isAdminRow(['chen', '研发'])).toBe(false)
  })

  it('普通行变更不触发守卫；admin 行增删改触发', async () => {
    const { detectAdminRowChange } = await lib()
    const ordinary = swapRow(ORG_INIT, '| chen | 研发 |', '| chen | 高级研发 | wei | chen-pay | @chen |')
    expect(detectAdminRowChange(ORG_INIT, ordinary).changed).toBe(false)
    const tweak = swapRow(ORG_INIT, '| admin | 主管（治理裁决） |', '| admin | 主管（治理裁决·二） | — | — | @admin |')
    expect(detectAdminRowChange(ORG_INIT, tweak).changed).toBe(true)
    const noAdmin = ORG_INIT.split('\n').filter(l => !l.startsWith('| admin |')).join('\n')
    expect(detectAdminRowChange(ORG_INIT, noAdmin).changed).toBe(true)
    const twoAdmins = ORG_INIT.replace('| audit |', '| admin2 | 主管（治理裁决） | admin | — | @admin2 |\n| audit |')
    expect(detectAdminRowChange(ORG_INIT, twoAdmins).changed).toBe(true)
  })

  it('初始建编豁免：before 无 admin 行 → 放行', async () => {
    const { detectAdminRowChange } = await lib()
    const empty = ['# org', ...HEAD, ''].join('\n')
    expect(detectAdminRowChange(empty, ORG_INIT).changed).toBe(false)
  })

  it('cosignEligible：治理岗在编合格，普通研发/编外不合格', async () => {
    const { cosignEligible } = await lib()
    expect(cosignEligible(ORG_INIT, 'admin')).toBe(true)
    expect(cosignEligible(ORG_INIT, 'audit')).toBe(true)
    expect(cosignEligible(ORG_INIT, '@audit:matrix.test')).toBe(true)
    expect(cosignEligible(ORG_INIT, 'chen')).toBe(false)
    expect(cosignEligible(ORG_INIT, 'nobody')).toBe(false)
  })
})

describe('集成：认证主体会签 + break-glass', () => {
  it('普通行变更直写（200）；admin 变更无 breakGlass → 409', async () => {
    const ordinary = swapRow(await currentOrg(), '| chen | 研发 |', '| chen | 高级研发 | wei | chen-pay | @chen |')
    const saved = await req('PUT', '/api/governance/registry/org', { markdown: ordinary, message: 'chen 晋级' })
    expect(saved.status).toBe(200)
    expect(saved.body.commit).toBeTruthy()

    const md = swapRow(await currentOrg(), '主管（治理裁决）', '| admin | 主管（治理裁决·二） | — | — | @admin |')
    const guarded = await req('PUT', '/api/governance/registry/org', { markdown: md, message: '改 admin' })
    expect(guarded.status).toBe(409)
    expect(guarded.body.code).toBe('org_needs_cosign')
    expect(guarded.body.detail.length).toBeGreaterThan(0)
  })

  it('breakGlass 理由必填；actor 只取登录人，body 伪造身份不得进入审计', async () => {
    const md = swapRow(await currentOrg(), '主管（治理裁决）', '| admin | 主管（治理裁决·二） | — | — | @admin |')
    const bad = await req('PUT', '/api/governance/registry/org', { markdown: md, breakGlass: true }, admin)
    expect(bad.status).toBe(400)
    const ok = await req('PUT', '/api/governance/registry/org', {
      markdown: md, message: '改 admin', actor: 'mallory',
      breakGlass: true, breakGlassReason: '审计岗休假，单人流转紧急修复',
    }, admin)
    expect(ok.status).toBe(200)
    expect(ok.body.breakGlass).toBe(true)
    expect(git(['log', '-5', '--format=%s'])).toContain('[BREAK-GLASS]')
    const trail = readFileSync(join(repo, 'docs/admin/audit-trail.md'), 'utf-8')
    expect(trail).toContain('org-break-glass')
    expect(trail).toContain('审计岗休假，单人流转紧急修复')
    expect(trail).toContain('admin')
    expect(trail).not.toContain('mallory')
  })

  it('会签：发起仅 super_admin；伪造 approver、自签均失败；audit 以登录身份批准并留痕', async () => {
    const md = swapRow(await currentOrg(), '主管（治理裁决·二）', '| admin | 主管（治理裁决·三） | — | — | @admin |')
    expect((await req('PUT', '/api/governance/registry/org', { markdown: md })).status).toBe(409)
    expect((await req('POST', '/api/governance/registry/org/cosign', {
      markdown: md, message: '非管理员发起', actor: 'audit',
    }, audit)).status).toBe(403)

    const open = await req('POST', '/api/governance/registry/org/cosign', {
      markdown: md, message: 'admin 三期', actor: 'mallory',
    }, admin)
    expect(open.status).toBe(200)
    expect((await req('POST', '/api/governance/registry/org/cosign', { markdown: md, actor: 'mallory' }, admin)).status).toBe(409)
    const pend = await req('GET', '/api/governance/registry/org/cosign')
    expect(pend.body.pending?.initiator).toBe('admin')
    expect(pend.body.pending?.markdown).toContain('治理裁决·三')

    // 登录 admin 但 body 冒充 audit：必须按 admin 自签拒绝，不能替他人批准。
    expect((await req('POST', '/api/governance/registry/org/cosign/approve', {
      approver: 'audit', reason: '伪造他人',
    }, admin)).status).toBe(403)
    // 登录 chen 但 body 冒充 audit：资格检查针对 chen。
    expect((await req('POST', '/api/governance/registry/org/cosign/approve', {
      approver: 'audit', reason: '伪造治理岗',
    }, chen)).status).toBe(403)
    // 普通登录角色也可决议；registry-admin 继续负责治理资格与异人校验。
    const ok = await req('POST', '/api/governance/registry/org/cosign/approve', {
      approver: 'mallory', reason: '编制复核通过',
    }, audit)
    expect(ok.status).toBe(200)
    expect(ok.body.orgCommit).toBeTruthy()
    expect(await currentOrg()).toContain('治理裁决·三')
    const trail = readFileSync(join(repo, 'docs/admin/audit-trail.md'), 'utf-8')
    expect(trail).toContain('org-cosign-approve')
    expect(trail).toContain('admin→audit')
    expect(trail).not.toContain('mallory')
    expect((await req('POST', '/api/governance/registry/org/cosign/approve', { approver: 'mallory' }, audit)).status).toBe(404)
  })

  it('匿名决议 401 且不闭单；驳回仍须理由，审计记录登录人', async () => {
    const md = swapRow(await currentOrg(), '主管（治理裁决·三）', '| admin | 主管（治理裁决·四） | — | — | @admin |')
    expect((await req('PUT', '/api/governance/registry/org', { markdown: md })).status).toBe(409)
    expect((await req('POST', '/api/governance/registry/org/cosign', {
      markdown: md, message: 'admin 四期', actor: 'mallory',
    }, admin)).status).toBe(200)

    const anonymous = await req('POST', '/api/governance/registry/org/cosign/approve', {
      approver: 'audit', reason: '匿名伪造',
    })
    expect(anonymous.status).toBe(401)
    expect((await req('GET', '/api/governance/registry/org/cosign')).body.pending?.status).toBe('pending')
    expect((await req('POST', '/api/governance/registry/org/cosign/reject', { approver: 'mallory' }, audit)).status).toBe(403)
    const ok = await req('POST', '/api/governance/registry/org/cosign/reject', {
      approver: 'mallory', reason: '变更依据不足，退回',
    }, audit)
    expect(ok.status).toBe(200)
    expect(await currentOrg()).toContain('治理裁决·三')
    expect(await currentOrg()).not.toContain('治理裁决·四')
    const trail = readFileSync(join(repo, 'docs/admin/audit-trail.md'), 'utf-8')
    expect(trail).toContain('org-cosign-reject')
    expect(trail).toContain('admin→audit')
    expect(trail).not.toContain('mallory')
  })

  it('未触及 admin 行的会签发起 → 400（引导走普通保存）', async () => {
    const md = swapRow(await currentOrg(), '| chen | 高级研发 |', '| chen | 资深研发 | wei | chen-pay | @chen |')
    expect((await req('POST', '/api/governance/registry/org/cosign', { markdown: md }, admin)).status).toBe(400)
  })
})
