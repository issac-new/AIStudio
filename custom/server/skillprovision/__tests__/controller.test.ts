// overlay/skillprovision 端点测试：挂载函数、确认闸、清单写盘、供给/回滚响应。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { attachSkillProvisionRoutes } from '../controller'

type Handler = (ctx: any) => Promise<void>
let root = ''
let routes: Map<string, Handler>

function fakeCtx(query: Record<string, string> = {}, body: Record<string, unknown> = {}): any {
  return { query, request: { body }, status: 200, body: null }
}

function skill(dir: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: x\n---\nbody\n')
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'skillprov-ctl-'))
  const host = join(root, 'host')
  skill(join(host, 'skills', 'alpha'))
  mkdirSync(join(host, 'profiles', 'p1', 'skills'), { recursive: true })
  writeFileSync(join(root, 'manifest.json'), JSON.stringify({ version: 1, roles: [{ match: '*', skills: ['alpha'] }] }))
  routes = new Map()
  const fakeRouter = {
    get: (p: string, h: Handler) => routes.set(`GET ${p}`, h),
    post: (p: string, h: Handler) => routes.set(`POST ${p}`, h),
    put: (p: string, h: Handler) => routes.set(`PUT ${p}`, h),
  }
  attachSkillProvisionRoutes(fakeRouter as never)
})

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true })
})

const hostRoot = (): string => join(root, 'host')
const manifestPath = (): string => join(root, 'manifest.json')

describe('skillprovision controller', () => {
  it('注册了报告/清单/供给/回滚端点', () => {
    expect([...routes.keys()].sort()).toEqual([
      'GET /provision/fleet',
      'GET /provision/manifest',
      'GET /provision/report',
      'POST /provision/apply',
      'POST /provision/rollback',
      'PUT /provision/manifest',
    ])
  })

  it('GET report 返回对账结构', async () => {
    const ctx = fakeCtx({ hostRoot: hostRoot(), simRoot: join(root, 'no-sim'), manifestPath: manifestPath() })
    await routes.get('GET /provision/report')!(ctx)
    expect(ctx.status).toBe(200)
    expect(ctx.body.ok).toBe(true)
    expect(ctx.body.report.profiles.some((p: any) => p.profile === 'p1')).toBe(true)
    expect(ctx.body.report.manifest.source).toBe('file')
  })

  it('PUT manifest 校验并写盘', async () => {
    const target = join(root, 'nested', 'manifest.json')
    const ctx = fakeCtx({}, {
      manifestPath: target,
      manifest: { version: 1, roles: [{ match: '*', skills: ['alpha'] }] },
    })
    await routes.get('PUT /provision/manifest')!(ctx)
    expect(ctx.body.ok).toBe(true)
    expect(existsSync(target)).toBe(true)
  })

  it('非干跑缺 confirm 返回 400', async () => {
    const ctx = fakeCtx({}, { hostRoot: hostRoot(), manifestPath: manifestPath(), dryRun: false })
    await routes.get('POST /provision/apply')!(ctx)
    expect(ctx.status).toBe(400)
    expect(ctx.body.problems.join()).toContain('confirm_required')
  })

  it('干跑返回 planned 且不写盘', async () => {
    const ctx = fakeCtx({}, { hostRoot: hostRoot(), manifestPath: manifestPath(), dryRun: true })
    await routes.get('POST /provision/apply')!(ctx)
    expect(ctx.status).toBe(200)
    expect(ctx.body.dryRun).toBe(true)
    expect(ctx.body.summary.planned).toBe(1)
    expect(existsSync(join(hostRoot(), 'profiles', 'p1', 'skills', 'alpha'))).toBe(false)
  })

  it('确认后供给并回滚', async () => {
    const apply = fakeCtx({}, { hostRoot: hostRoot(), manifestPath: manifestPath(), dryRun: false, confirm: true })
    await routes.get('POST /provision/apply')!(apply)
    expect(apply.body.summary.copied).toBe(1)
    expect(existsSync(join(hostRoot(), 'profiles', 'p1', 'skills', 'alpha'))).toBe(true)

    const rollback = fakeCtx({}, { hostRoot: hostRoot(), manifestPath: manifestPath(), dryRun: false, confirm: true })
    await routes.get('POST /provision/rollback')!(rollback)
    expect(rollback.body.summary.removed).toBe(1)
    expect(existsSync(join(hostRoot(), 'profiles', 'p1', 'skills', 'alpha'))).toBe(false)
  })
})
