// 账号切换器服务端面守门（spec 2026-11-13 matrix-account-switch）：
// ① isSafeProfileName 白名单（路径穿越/保留目录防线）；
// ② readProfileMatrixEnv 按名取档位三件套（缺任一 null）；
// ③ listProfileMatrixAccounts 档位清单（无凭据不列、`_` 目录跳过、稳定排序、不含 token）；
// ④ GET /api/matrix/gateway-credentials?profile= 按名直取（非法 400/未配置 404/无参原链回归）；
// ⑤ GET /api/matrix/profile-accounts 回环四闸（与 gateway-credentials 同闸）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type Koa from 'koa'
import {
  isSafeProfileName,
  readProfileMatrixEnv,
  listProfileMatrixAccounts,
} from '../gateway-env'
import { registerMatrixAuthRoutes } from '../routes'

let hermesHome: string
const savedHome = process.env.HERMES_HOME

beforeEach(() => {
  hermesHome = mkdtempSync(join(tmpdir(), 'profile-accounts-test-'))
  process.env.HERMES_HOME = hermesHome
})

afterEach(() => {
  if (savedHome === undefined) delete process.env.HERMES_HOME
  else process.env.HERMES_HOME = savedHome
  rmSync(hermesHome, { recursive: true, force: true })
})

function writeProfileEnv(profile: string, lines: string[]): void {
  const dir = join(hermesHome, 'profiles', profile)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '.env'), lines.join('\n') + '\n')
}

const FULL = ['MATRIX_HOMESERVER=https://ms.example.org', 'MATRIX_ACCESS_TOKEN=syt_tok', 'MATRIX_USER_ID=@gw:ms.example.org']

describe('isSafeProfileName 白名单', () => {
  it('常规档位名放行（含 a..b——首字符限制下连续点不构成穿越，仅是普通目录名）', () => {
    for (const name of ['orchestrator', 'pay-orchestrator', 'eda_toolchain', 'worker-coder2', 'a.b', 'a..b']) {
      expect(isSafeProfileName(name), name).toBe(true)
    }
  })
  it('`_` 开头保留目录、整段 `..`、含分隔符、空名一律拒绝', () => {
    for (const name of ['_shared', '_trash_20260828', '..', '../x', 'a/b', '/abs', '', '.hidden']) {
      expect(isSafeProfileName(name), name).toBe(false)
    }
  })
})

describe('readProfileMatrixEnv 按名取档位凭据', () => {
  it('token 三件套齐全返回 kind=token（homeRoom 键多余不挡）', () => {
    writeProfileEnv('pay-orchestrator', [...FULL, 'MATRIX_HOME_ROOM=!x:1'])
    expect(readProfileMatrixEnv('pay-orchestrator')).toMatchObject({
      kind: 'token',
      homeserverUrl: 'https://ms.example.org',
      accessToken: 'syt_tok',
      userId: '@gw:ms.example.org',
    })
  })
  it('批二 D8 密码形态：HOMESERVER+PASSWORD+USER_ID → kind=password 带密码', () => {
    writeProfileEnv('orch-pwd', [
      'MATRIX_HOMESERVER=http://localhost:8008',
      'MATRIX_PASSWORD=pw_secret',
      'MATRIX_USER_ID=@swarm:matrix.test',
    ])
    expect(readProfileMatrixEnv('orch-pwd')).toEqual({
      kind: 'password',
      homeserverUrl: 'http://localhost:8008',
      userId: '@swarm:matrix.test',
      password: 'pw_secret',
    })
  })
  it('两种形态齐备时 token 优先（免一次密码登录往返）', () => {
    writeProfileEnv('both', [...FULL, 'MATRIX_PASSWORD=pw_secret'])
    expect(readProfileMatrixEnv('both')?.kind).toBe('token')
  })
  it('密码形态缺 userId 或 homeserver → null', () => {
    writeProfileEnv('pwd-no-user', ['MATRIX_HOMESERVER=http://localhost:8008', 'MATRIX_PASSWORD=pw'])
    expect(readProfileMatrixEnv('pwd-no-user')).toBeNull()
    writeProfileEnv('pwd-no-hs', ['MATRIX_PASSWORD=pw', 'MATRIX_USER_ID=@x:matrix.test'])
    expect(readProfileMatrixEnv('pwd-no-hs')).toBeNull()
  })
  it('token 与密码均缺 → null（仅 homeserver+userId 不构成配置）', () => {
    writeProfileEnv('no-creds2', ['MATRIX_HOMESERVER=https://ms.example.org', 'MATRIX_USER_ID=@gw:ms.example.org'])
    expect(readProfileMatrixEnv('no-creds2')).toBeNull()
  })
  it('档位 .env 缺席 → null', () => {
    expect(readProfileMatrixEnv('ghost')).toBeNull()
  })
})

describe('listProfileMatrixAccounts 档位清单', () => {
  it('有凭据档位才列（token/密码双形态，批二 D8）；`_` 目录与无凭据档位跳过；稳定排序；清单零凭据', () => {
    writeProfileEnv('zeta-team', FULL)
    writeProfileEnv('alpha-team', ['MATRIX_HOMESERVER=https://a.example.org', 'MATRIX_ACCESS_TOKEN=t_a', 'MATRIX_USER_ID=@a:a.example.org'])
    writeProfileEnv('orch-pwd', ['MATRIX_HOMESERVER=http://localhost:8008', 'MATRIX_PASSWORD=pw_secret', 'MATRIX_USER_ID=@swarm:matrix.test'])
    writeProfileEnv('no-creds', ['# 注释占位'])
    mkdirSync(join(hermesHome, 'profiles', '_shared'), { recursive: true })
    writeFileSync(join(hermesHome, 'profiles', '_shared', '.env'), FULL.join('\n') + '\n')
    const accounts = listProfileMatrixAccounts()
    expect(accounts.map(a => a.profile)).toEqual(['alpha-team', 'orch-pwd', 'zeta-team'])
    expect(JSON.stringify(accounts)).not.toContain('syt_tok')
    expect(JSON.stringify(accounts)).not.toContain('t_a')
    expect(JSON.stringify(accounts)).not.toContain('pw_secret')
  })
  it('profiles 目录缺席 → 空清单（不抛错）', () => {
    expect(listProfileMatrixAccounts()).toEqual([])
  })
})

// ─── 路由层 ────────────────────────────────────────────────────────────────

function routesMiddleware(): (ctx: Record<string, unknown>) => Promise<void> {
  const used: Array<(ctx: never, next: () => Promise<void>) => Promise<void>> = []
  const app = { use: (fn: (ctx: never, next: () => Promise<void>) => Promise<void>) => used.push(fn) } as unknown as Koa
  registerMatrixAuthRoutes(app)
  return used[0] as never
}

function fakeCtx(path: string, remoteAddress: string | undefined, query: Record<string, string> = {}, headers: Record<string, string> = {}): Record<string, unknown> {
  return {
    method: 'GET',
    path,
    url: path,
    query,
    state: {},
    request: { socket: { remoteAddress }, headers },
    status: 200,
    body: undefined,
  }
}

describe('GET /api/matrix/gateway-credentials?profile=', () => {
  it('按名直取档位三元组（不走 active 解析；批二起响应带 kind）', async () => {
    writeProfileEnv('pay-orchestrator', FULL)
    // active 指向另一个档位——证明 ?profile= 不受 active 影响
    writeProfileEnv('orchestrator', ['MATRIX_HOMESERVER=https://active.example.org', 'MATRIX_ACCESS_TOKEN=t_active', 'MATRIX_USER_ID=@act:active.example.org'])
    const mw = routesMiddleware()
    const ctx = fakeCtx('/api/matrix/gateway-credentials', '127.0.0.1', { profile: 'pay-orchestrator' })
    await mw(ctx as never)
    expect(ctx.status).toBe(200)
    expect(ctx.body).toMatchObject({ configured: true, kind: 'token', accessToken: 'syt_tok', userId: '@gw:ms.example.org' })
  })

  it('批二 D8 密码形态：kind=password 回密码不带 accessToken（客户端先密码登录换 token）', async () => {
    writeProfileEnv('orch-pwd', [
      'MATRIX_HOMESERVER=http://localhost:8008',
      'MATRIX_PASSWORD=pw_secret',
      'MATRIX_USER_ID=@swarm:matrix.test',
    ])
    const mw = routesMiddleware()
    const ctx = fakeCtx('/api/matrix/gateway-credentials', '127.0.0.1', { profile: 'orch-pwd' })
    await mw(ctx as never)
    expect(ctx.status).toBe(200)
    expect(ctx.body).toEqual({
      configured: true,
      kind: 'password',
      homeserverUrl: 'http://localhost:8008',
      userId: '@swarm:matrix.test',
      password: 'pw_secret',
    })
  })

  it('非法档位名 400（穿越/保留目录）；未配置三件套 404', async () => {
    writeProfileEnv('pay-orchestrator', ['# 空占位'])
    const mw = routesMiddleware()
    for (const bad of ['..', '_shared', 'a/b']) {
      const ctx = fakeCtx('/api/matrix/gateway-credentials', '127.0.0.1', { profile: bad })
      await mw(ctx as never)
      expect(ctx.status, bad).toBe(400)
    }
    const ctx404 = fakeCtx('/api/matrix/gateway-credentials', '127.0.0.1', { profile: 'pay-orchestrator' })
    await mw(ctx404 as never)
    expect(ctx404.status).toBe(404)
  })

  it('无参行为回归：active .env 优先，session 回落不变', async () => {
    writeProfileEnv('orchestrator', FULL)
    const mw = routesMiddleware()
    const ctx = fakeCtx('/api/matrix/gateway-credentials', '127.0.0.1')
    await mw(ctx as never)
    expect(ctx.status).toBe(200)
    expect(ctx.body).toMatchObject({ configured: true, accessToken: 'syt_tok' })
  })

  it('非回环对端带 profile 参数同样 403（闸先于参数语义）', async () => {
    writeProfileEnv('pay-orchestrator', FULL)
    const mw = routesMiddleware()
    const ctx = fakeCtx('/api/matrix/gateway-credentials', '192.168.1.10', { profile: 'pay-orchestrator' })
    await mw(ctx as never)
    expect(ctx.status).toBe(403)
    expect(JSON.stringify(ctx.body)).not.toContain('syt_tok')
  })
})

describe('GET /api/matrix/profile-accounts', () => {
  it('回环对端返回档位账号清单（不含 token）', async () => {
    writeProfileEnv('pay-orchestrator', FULL)
    writeProfileEnv('ops-sre', ['MATRIX_HOMESERVER=https://ops.example.org', 'MATRIX_ACCESS_TOKEN=t_ops', 'MATRIX_USER_ID=@ops:ops.example.org'])
    const mw = routesMiddleware()
    const ctx = fakeCtx('/api/matrix/profile-accounts', '::1')
    await mw(ctx as never)
    expect(ctx.status).toBe(200)
    expect(ctx.body).toEqual({
      accounts: [
        { profile: 'ops-sre', userId: '@ops:ops.example.org', homeserverUrl: 'https://ops.example.org' },
        { profile: 'pay-orchestrator', userId: '@gw:ms.example.org', homeserverUrl: 'https://ms.example.org' },
      ],
    })
  })

  it('非回环对端 403（四闸与 gateway-credentials 同源）', async () => {
    writeProfileEnv('pay-orchestrator', FULL)
    const mw = routesMiddleware()
    for (const addr of ['192.168.1.10', undefined]) {
      const ctx = fakeCtx('/api/matrix/profile-accounts', addr)
      await mw(ctx as never)
      expect(ctx.status, String(addr)).toBe(403)
    }
  })

  it('转发头含非回环客户端 403', async () => {
    const mw = routesMiddleware()
    const ctx = fakeCtx('/api/matrix/profile-accounts', '127.0.0.1', {}, { 'x-forwarded-for': '203.0.113.9' })
    await mw(ctx as never)
    expect(ctx.status).toBe(403)
  })
})
