// overlay/skillprovision 端点测试：挂载函数、确认闸、清单写盘、供给/回滚响应。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { attachSkillProvisionRoutes } from '../controller'

type Handler = (ctx: any) => Promise<void>
let root = ''
let routes: Map<string, Handler>
let previousProfilesRoot: string | undefined
let previousManifest: string | undefined

function fakeCtx(
  query: Record<string, string> = {},
  body: Record<string, unknown> = {},
  user: { id: number; role: string; profiles?: string[] } | null = null,
): any {
  return { query, request: { body }, state: user ? { user } : {}, status: 200, body: null }
}

function skill(dir: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: x\n---\nbody\n')
}

function makeRoutes(deps?: Parameters<typeof attachSkillProvisionRoutes>[1]): Map<string, Handler> {
  const handlers = new Map<string, Handler>()
  const fakeRouter = {
    get: (p: string, h: Handler) => handlers.set(`GET ${p}`, h),
    post: (p: string, h: Handler) => handlers.set(`POST ${p}`, h),
    put: (p: string, h: Handler) => handlers.set(`PUT ${p}`, h),
  }
  attachSkillProvisionRoutes(fakeRouter as never, deps)
  return handlers
}

beforeEach(() => {
  previousProfilesRoot = process.env.HERMES_PROFILES_ROOT
  previousManifest = process.env.SKILL_PROVISION_MANIFEST
  root = mkdtempSync(join(tmpdir(), 'skillprov-ctl-'))
  const host = join(root, 'host')
  skill(join(host, 'skills', 'alpha'))
  mkdirSync(join(host, 'profiles', 'p1', 'skills'), { recursive: true })
  writeFileSync(join(root, 'manifest.json'), JSON.stringify({ version: 1, roles: [{ match: '*', skills: ['alpha'] }] }))
  routes = makeRoutes({
    canAccessProfile: (user, profile) => user.id === 1 && profile === 'p1',
  })
})

afterEach(() => {
  if (previousProfilesRoot === undefined) delete process.env.HERMES_PROFILES_ROOT
  else process.env.HERMES_PROFILES_ROOT = previousProfilesRoot
  if (previousManifest === undefined) delete process.env.SKILL_PROVISION_MANIFEST
  else process.env.SKILL_PROVISION_MANIFEST = previousManifest
  if (root) rmSync(root, { recursive: true, force: true })
})

const hostRoot = (): string => join(root, 'host')
const manifestPath = (): string => join(root, 'manifest.json')

function useDefaultHost(): void {
  process.env.HERMES_PROFILES_ROOT = join(hostRoot(), 'profiles')
  process.env.SKILL_PROVISION_MANIFEST = manifestPath()
}

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

  it('apply 任一显式目标越权则整请求拒绝，已授权 profile 也不得先写', async () => {
    mkdirSync(join(hostRoot(), 'profiles', 'p2', 'skills'), { recursive: true })
    const ctx = fakeCtx({}, {
      hostRoot: hostRoot(), manifestPath: manifestPath(), profiles: ['p1', 'p2'], dryRun: false, confirm: true,
    }, { id: 1, role: 'user' })
    await routes.get('POST /provision/apply')!(ctx)
    expect(ctx.status).toBe(403)
    expect(ctx.body.ok).toBe(false)
    expect(existsSync(join(hostRoot(), 'profiles', 'p1', 'skills', 'alpha'))).toBe(false)
    expect(existsSync(join(hostRoot(), 'profiles', 'p2', 'skills', 'alpha'))).toBe(false)
  })

  it('apply 未传 profiles 时校验默认全量目标，而非只检查请求参数', async () => {
    mkdirSync(join(hostRoot(), 'profiles', 'p2', 'skills'), { recursive: true })
    const ctx = fakeCtx({}, {
      hostRoot: hostRoot(), manifestPath: manifestPath(), dryRun: false, confirm: true,
    }, { id: 1, role: 'user' })
    await routes.get('POST /provision/apply')!(ctx)
    expect(ctx.status).toBe(403)
    expect(existsSync(join(hostRoot(), 'profiles', 'p1', 'skills', 'alpha'))).toBe(false)
    expect(existsSync(join(hostRoot(), 'profiles', 'p2', 'skills', 'alpha'))).toBe(false)
  })

  it('跨根同名 profile 不能替代默认运行根授权，备用根与默认根均零写入', async () => {
    useDefaultHost()
    const alternateHost = join(root, 'alternate-host')
    skill(join(alternateHost, 'skills', 'alpha'))
    mkdirSync(join(alternateHost, 'profiles', 'p1', 'skills'), { recursive: true })
    const alternateManifest = join(root, 'alternate-manifest.json')
    writeFileSync(alternateManifest, JSON.stringify({ version: 1, roles: [{ match: '*', skills: ['alpha'] }] }))
    const ctx = fakeCtx({}, {
      hostRoot: alternateHost, manifestPath: alternateManifest, profiles: ['p1'], dryRun: false, confirm: true,
    }, { id: 1, role: 'user' })
    await routes.get('POST /provision/apply')!(ctx)
    expect(ctx.status).toBe(403)
    expect(existsSync(join(alternateHost, 'profiles', 'p1', 'skills', 'alpha'))).toBe(false)
    expect(existsSync(join(hostRoot(), 'profiles', 'p1', 'skills', 'alpha'))).toBe(false)
  })

  it('普通用户 apply 禁止 simRoot 覆盖，并在任何写入前返回', async () => {
    useDefaultHost()
    const ctx = fakeCtx({}, {
      simRoot: join(root, 'alternate-sim'), profiles: ['p1'], dryRun: false, confirm: true,
    }, { id: 1, role: 'user' })
    await routes.get('POST /provision/apply')!(ctx)
    expect(ctx.status).toBe(403)
    expect(existsSync(join(hostRoot(), 'profiles', 'p1', 'skills', 'alpha'))).toBe(false)
  })

  it('普通用户 apply 禁止 manifestPath 覆盖，并在任何写入前返回', async () => {
    useDefaultHost()
    const alternateManifest = join(root, 'alternate-manifest.json')
    writeFileSync(alternateManifest, JSON.stringify({ version: 1, roles: [{ match: '*', skills: ['alpha'] }] }))
    const ctx = fakeCtx({}, {
      manifestPath: alternateManifest, profiles: ['p1'], dryRun: false, confirm: true,
    }, { id: 1, role: 'user' })
    await routes.get('POST /provision/apply')!(ctx)
    expect(ctx.status).toBe(403)
    expect(existsSync(join(hostRoot(), 'profiles', 'p1', 'skills', 'alpha'))).toBe(false)
  })

  it('rollback 任一目标越权则保留所有台账与技能目录', async () => {
    mkdirSync(join(hostRoot(), 'profiles', 'p2', 'skills'), { recursive: true })
    const setup = fakeCtx({}, {
      hostRoot: hostRoot(), manifestPath: manifestPath(), dryRun: false, confirm: true,
    })
    await routes.get('POST /provision/apply')!(setup)
    expect(setup.body.summary.copied).toBe(2)

    const ctx = fakeCtx({}, {
      hostRoot: hostRoot(), manifestPath: manifestPath(), profiles: ['p1', 'p2'], dryRun: false, confirm: true,
    }, { id: 1, role: 'user' })
    await routes.get('POST /provision/rollback')!(ctx)
    expect(ctx.status).toBe(403)
    expect(existsSync(join(hostRoot(), 'profiles', 'p1', 'skills', 'alpha'))).toBe(true)
    expect(existsSync(join(hostRoot(), 'profiles', 'p2', 'skills', 'alpha'))).toBe(true)
    expect(existsSync(join(hostRoot(), 'profiles', 'p1', 'skills', '.skill-provisioning.json'))).toBe(true)
    expect(existsSync(join(hostRoot(), 'profiles', 'p2', 'skills', '.skill-provisioning.json'))).toBe(true)
  })

  it('普通用户 rollback 禁止路径覆盖，已有技能在拒绝后保持原样', async () => {
    useDefaultHost()
    const setup = fakeCtx({}, { profiles: ['p1'], dryRun: false, confirm: true })
    await routes.get('POST /provision/apply')!(setup)
    expect(setup.body.summary.copied).toBe(1)

    const ctx = fakeCtx({}, {
      simRoot: join(root, 'alternate-sim'), profiles: ['p1'], dryRun: false, confirm: true,
    }, { id: 1, role: 'user' })
    await routes.get('POST /provision/rollback')!(ctx)
    expect(ctx.status).toBe(403)
    expect(existsSync(join(hostRoot(), 'profiles', 'p1', 'skills', 'alpha'))).toBe(true)
  })

  it('manifest 写入先校验清单实际命中的目标，越权时不创建文件', async () => {
    mkdirSync(join(hostRoot(), 'profiles', 'p2', 'skills'), { recursive: true })
    const target = join(root, 'nested', 'manifest.json')
    const ctx = fakeCtx({}, {
      hostRoot: hostRoot(),
      manifestPath: target,
      manifest: { version: 1, roles: [{ match: 'p2', skills: ['alpha'] }] },
    }, { id: 1, role: 'user' })
    await routes.get('PUT /provision/manifest')!(ctx)
    expect(ctx.status).toBe(403)
    expect(ctx.body.ok).toBe(false)
    expect(existsSync(target)).toBe(false)
  })

  it('manifest 普通用户即使目标可见也拒绝，super_admin 可写任意目标', async () => {
    mkdirSync(join(hostRoot(), 'profiles', 'p2', 'skills'), { recursive: true })
    const ownTarget = join(root, 'own-manifest.json')
    const own = fakeCtx({}, {
      hostRoot: hostRoot(), manifestPath: ownTarget,
      manifest: { version: 1, roles: [{ match: 'p1', skills: ['alpha'] }] },
    }, { id: 1, role: 'user' })
    await routes.get('PUT /provision/manifest')!(own)
    expect(own.status).toBe(403)
    expect(own.body.ok).toBe(false)
    expect(existsSync(ownTarget)).toBe(false)

    const rootTarget = join(root, 'root-manifest.json')
    const admin = fakeCtx({}, {
      hostRoot: hostRoot(), manifestPath: rootTarget,
      manifest: { version: 1, roles: [{ match: 'p2', skills: ['alpha'] }] },
    }, { id: 9, role: 'super_admin' })
    await routes.get('PUT /provision/manifest')!(admin)
    expect(admin.body.ok).toBe(true)
    expect(existsSync(rootTarget)).toBe(true)
  })

  it('普通用户不带路径覆盖也不能 PUT 默认中央清单，目标文件零写入', async () => {
    useDefaultHost()
    const central = join(root, 'central-manifest.json')
    process.env.SKILL_PROVISION_MANIFEST = central
    const ctx = fakeCtx({}, {
      manifest: { version: 1, roles: [{ match: 'p1', skills: ['alpha'] }] },
    }, { id: 1, role: 'user' })
    await routes.get('PUT /provision/manifest')!(ctx)
    expect(ctx.status).toBe(403)
    expect(ctx.body.ok).toBe(false)
    expect(existsSync(central)).toBe(false)
  })

  it('无 DI 时按生产 user.profiles 形状允许默认根本人 apply', async () => {
    useDefaultHost()
    const productionRoutes = makeRoutes()
    const ctx = fakeCtx({}, { profiles: ['p1'], dryRun: false, confirm: true }, {
      id: 1, role: 'user', profiles: ['p1'],
    })
    await productionRoutes.get('POST /provision/apply')!(ctx)
    expect(ctx.status).toBe(200)
    expect(ctx.body.summary.copied).toBe(1)
    expect(existsSync(join(hostRoot(), 'profiles', 'p1', 'skills', 'alpha'))).toBe(true)
  })

  it('无 DI 时 user.profiles 拒绝他人 profile，缺授权面保持 fail closed', async () => {
    useDefaultHost()
    const productionRoutes = makeRoutes()
    const denied = fakeCtx({}, { profiles: ['p1'], dryRun: false, confirm: true }, {
      id: 1, role: 'user', profiles: ['p2'],
    })
    await productionRoutes.get('POST /provision/apply')!(denied)
    expect(denied.status).toBe(403)
    expect(existsSync(join(hostRoot(), 'profiles', 'p1', 'skills', 'alpha'))).toBe(false)

    const noAccessShape = fakeCtx({}, { profiles: ['p1'], dryRun: false, confirm: true }, {
      id: 1, role: 'user',
    })
    await productionRoutes.get('POST /provision/apply')!(noAccessShape)
    expect(noAccessShape.status).toBe(403)
    expect(existsSync(join(hostRoot(), 'profiles', 'p1', 'skills', 'alpha'))).toBe(false)
  })
})
