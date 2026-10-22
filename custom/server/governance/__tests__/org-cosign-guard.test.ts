// 治理者守卫守门（2026-10-22「治理者由谁治理」缺口补）：
// ① 纯函数：orgTableRows/isAdminRow/detectAdminRowChange（普通行放行、admin 行增删改拦、
//    初始建编豁免、空表建编放行）/cosignEligible（治理岗在编合格）
// ② 集成：PUT org 普通→直写；admin 变更→409 org_needs_cosign；breakGlass 缺理由→400、
//    带理由→落盘+[BREAK-GLASS] 提交+审计留痕；会签发起（单槽）→自签 403→资格 403→
//    audit 批准落盘+留痕→无单 404；驳回缺理由 403、带理由 200 且不落盘。
// 仓根用临时 git 仓（GOVERNANCE_REPO 注入），不依赖推演仓在场——测试自包含。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from 'http'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import type { AddressInfo } from 'net'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'child_process'

const repo = mkdtempSync(join(tmpdir(), 'org-cosign-'))

function git(args: string[]) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
}

let base = ''

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
  app.use(governanceRoutes.routes())
  const server = createServer(app.callback())
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  afterAll(() => {
    server.close()
    rmSync(repo, { recursive: true, force: true })
  })
})

async function req(method: string, path: string, payload?: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, {
    method,
    ...(payload ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}),
  })
  return { status: res.status, body: res.status === 204 ? null : await res.json() }
}

async function currentOrg(): Promise<string> {
  return (await req('GET', '/api/governance/registry/org')).body.markdown
}

/** 把 org 文本中含 from 的行替换为 to（构造「相对当前状态」的行级变更）。 */
function swapRow(md: string, from: string, to: string): string {
  return md.split('\n').map(l => (l.includes(from) ? to : l)).join('\n')
}

// 纯函数模块在 it 内动态 import——文件级 beforeAll 已设 GOVERNANCE_REPO，加载顺序
// 与既有 governance-controller.test.ts 同构（registry-admin 静态依赖 controller 的
// repoRoot，不在 env 就绪前提前加载）。
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

  it('普通行（chen）变更不触发守卫', async () => {
    const { detectAdminRowChange } = await lib()
    const after = swapRow(ORG_INIT, '| chen | 研发 |', '| chen | 高级研发 | wei | chen-pay | @chen |')
    expect(detectAdminRowChange(ORG_INIT, after).changed).toBe(false)
  })

  it('admin 行角色变更/删除/增列第二个 admin 均触发', async () => {
    const { detectAdminRowChange } = await lib()
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

  it('cosignEligible：治理岗（admin/审计）在编合格，普通研发/编外不合格', async () => {
    const { cosignEligible } = await lib()
    expect(cosignEligible(ORG_INIT, 'admin')).toBe(true)
    expect(cosignEligible(ORG_INIT, 'audit')).toBe(true)
    expect(cosignEligible(ORG_INIT, '@audit:matrix.test')).toBe(true)
    expect(cosignEligible(ORG_INIT, 'chen')).toBe(false)
    expect(cosignEligible(ORG_INIT, 'nobody')).toBe(false)
  })
})

describe('集成：PUT 守卫 + break-glass + 会签全流程', () => {
  it('普通行变更直写（200）', async () => {
    const md = swapRow(await currentOrg(), '| chen | 研发 |', '| chen | 高级研发 | wei | chen-pay | @chen |')
    const r = await req('PUT', '/api/governance/registry/org', { markdown: md, message: 'chen 晋级' })
    expect(r.status).toBe(200)
    expect(r.body.commit).toBeTruthy()
  })

  it('admin 行变更无 breakGlass → 409 org_needs_cosign', async () => {
    const md = swapRow(await currentOrg(), '主管（治理裁决）', '| admin | 主管（治理裁决·二） | — | — | @admin |')
    const r = await req('PUT', '/api/governance/registry/org', { markdown: md, message: '改 admin' })
    expect(r.status).toBe(409)
    expect(r.body.code).toBe('org_needs_cosign')
    expect(r.body.detail.length).toBeGreaterThan(0)
  })

  it('breakGlass 缺理由 → 400；带理由 → 落盘 + [BREAK-GLASS] 提交 + 审计留痕', async () => {
    const md = swapRow(await currentOrg(), '主管（治理裁决）', '| admin | 主管（治理裁决·二） | — | — | @admin |')
    const bad = await req('PUT', '/api/governance/registry/org', { markdown: md, breakGlass: true })
    expect(bad.status).toBe(400)
    const ok = await req('PUT', '/api/governance/registry/org', {
      markdown: md, message: '改 admin', actor: 'admin',
      breakGlass: true, breakGlassReason: '审计岗休假，单人流转紧急修复',
    })
    expect(ok.status).toBe(200)
    expect(ok.body.breakGlass).toBe(true)
    const subjects = git(['log', '-5', '--format=%s'])
    expect(subjects).toContain('[BREAK-GLASS]')
    const trail = readFileSync(join(repo, 'docs/admin/audit-trail.md'), 'utf-8')
    expect(trail).toContain('org-break-glass')
    expect(trail).toContain('审计岗休假，单人流转紧急修复')
  })

  it('会签流：发起（单槽）→ 自签 403 → 资格 403 → audit 批准落盘 → 无单 404', async () => {
    // 守卫再拦一次，然后发起（admin 行：·二 → ·三）
    const md = swapRow(await currentOrg(), '主管（治理裁决·二）', '| admin | 主管（治理裁决·三） | — | — | @admin |')
    expect((await req('PUT', '/api/governance/registry/org', { markdown: md })).status).toBe(409)
    const open = await req('POST', '/api/governance/registry/org/cosign', {
      markdown: md, message: 'admin 三期', actor: 'admin',
    })
    expect(open.status).toBe(200)
    // 单槽：重复发起 409
    expect((await req('POST', '/api/governance/registry/org/cosign', { markdown: md, actor: 'admin' })).status).toBe(409)
    // GET pending 可见发起人与明细
    const pend = await req('GET', '/api/governance/registry/org/cosign')
    expect(pend.body.pending?.initiator).toBe('admin')
    expect(pend.body.pending?.markdown).toContain('治理裁决·三')
    // 发起人自签 → 403
    expect((await req('POST', '/api/governance/registry/org/cosign/approve', { approver: 'admin' })).status).toBe(403)
    // 普通研发 chen → 403 资格
    expect((await req('POST', '/api/governance/registry/org/cosign/approve', { approver: 'chen' })).status).toBe(403)
    // audit 批准 → 落盘 + 留痕
    const ok = await req('POST', '/api/governance/registry/org/cosign/approve', { approver: 'audit', reason: '编制复核通过' })
    expect(ok.status).toBe(200)
    expect(ok.body.orgCommit).toBeTruthy()
    expect(await currentOrg()).toContain('治理裁决·三')
    const trail = readFileSync(join(repo, 'docs/admin/audit-trail.md'), 'utf-8')
    expect(trail).toContain('org-cosign-approve')
    // 已决无单 → 404
    expect((await req('POST', '/api/governance/registry/org/cosign/approve', { approver: 'audit' })).status).toBe(404)
  })

  it('驳回流：缺理由 403；带理由 200 且 org 不落盘', async () => {
    const md = swapRow(await currentOrg(), '主管（治理裁决·三）', '| admin | 主管（治理裁决·四） | — | — | @admin |')
    expect((await req('PUT', '/api/governance/registry/org', { markdown: md })).status).toBe(409)
    expect((await req('POST', '/api/governance/registry/org/cosign', { markdown: md, message: 'admin 四期', actor: 'admin' })).status).toBe(200)
    expect((await req('POST', '/api/governance/registry/org/cosign/reject', { approver: 'audit' })).status).toBe(403)
    const ok = await req('POST', '/api/governance/registry/org/cosign/reject', { approver: 'audit', reason: '变更依据不足，退回' })
    expect(ok.status).toBe(200)
    expect(await currentOrg()).toContain('治理裁决·三')
    expect(await currentOrg()).not.toContain('治理裁决·四')
    const trail = readFileSync(join(repo, 'docs/admin/audit-trail.md'), 'utf-8')
    expect(trail).toContain('org-cosign-reject')
  })

  it('未触及 admin 行的会签发起 → 400（引导走普通保存）', async () => {
    const md = swapRow(await currentOrg(), '| chen | 高级研发 |', '| chen | 资深研发 | wei | chen-pay | @chen |')
    expect((await req('POST', '/api/governance/registry/org/cosign', { markdown: md })).status).toBe(400)
  })
})
