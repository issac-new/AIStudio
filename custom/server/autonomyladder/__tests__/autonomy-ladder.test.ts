// overlay/custom/server/autonomyladder/__tests__/autonomy-ladder.test.ts
// 自治阶梯（六文调研轮 H2）守门测试：upsert/校验/auto 档语义矛盾拒绝/兼容读取。
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import type { PlatformPrincipal } from '../../../platform/contracts/identity'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  listLadder, getLadder, upsertLadder, removeLadder, validateLadderInput, ladderForProfile,
  _useLadderDirForTests, _resetLadderDirForTests,
} from '../autonomy-ladder'

const appendGovEvent = vi.hoisted(() => vi.fn())
vi.mock('../../govbus/event-log', () => ({ appendGovEvent }))

let dir: string
let base = ''
let server: ReturnType<typeof createServer>
let currentUser: PlatformPrincipal | undefined

beforeAll(async () => {
  const { autonomyLadderRoutes } = await import('../autonomy-ladder-controller')
  const app = new Koa()
  app.use(async (ctx, next) => {
    if (currentUser) (ctx.state as { user?: PlatformPrincipal }).user = currentUser
    await next()
  })
  app.use(bodyParser())
  app.use(autonomyLadderRoutes.routes())
  server = createServer(app.callback())
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ladder-'))
  _useLadderDirForTests(dir)
  currentUser = { id: 1, username: 'root', role: 'super_admin', status: 'active' }
  appendGovEvent.mockReset()
})

afterAll(async () => {
  _resetLadderDirForTests()
  rmSync(dir, { recursive: true, force: true })
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

async function request(method: string, path: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, json: await response.json() as Record<string, unknown> }
}

describe('autonomy ladder', () => {
  it('upsert→list→get→remove 全链 + 幂等按 target', () => {
    const e1 = upsertLadder({ target: 'coding-agent', level: 'assist', approvalPoints: ['生产部署', '删除类文件操作'] })
    expect(e1.maxRiskTier).toBe('low')  // 非 auto 档缺省 low
    upsertLadder({ target: 'workflow:build:deploy', level: 'auto' })
    expect(listLadder()).toHaveLength(2)
    upsertLadder({ target: 'coding-agent', level: 'auto' })  // 同 target 覆盖
    expect(listLadder()).toHaveLength(2)
    expect(getLadder('coding-agent')!.level).toBe('auto')
    expect(getLadder('coding-agent')!.maxRiskTier).toBe('medium')  // auto 档缺省 medium
    expect(removeLadder('coding-agent')).toBe(true)
    expect(removeLadder('coding-agent')).toBe(false)
    expect(listLadder()).toHaveLength(1)
  })

  it('校验：auto 档带确认点=语义矛盾拒绝；非法 level/target 拒绝', () => {
    expect(validateLadderInput({ target: 'a', level: 'auto', approvalPoints: ['x'] })).toHaveLength(1)
    expect(validateLadderInput({ target: 'bad target!', level: 'assist' })).toHaveLength(1)
    expect(validateLadderInput({ target: 'a', level: 'bogus' as never })).toHaveLength(1)
    expect(validateLadderInput({ target: 'a', level: 'assist', maxRiskTier: 'extreme' as never })).toHaveLength(1)
    expect(validateLadderInput({ target: 'a', level: 'assist' })).toHaveLength(0)
    expect(() => upsertLadder({ target: 'a b', level: 'assist' })).toThrow()
  })

  it('ladderForProfile：profile 精确命中 > workflow: 前缀命中 > null', () => {
    upsertLadder({ target: 'workflow:build:deploy', level: 'auto' })
    expect(ladderForProfile('build')?.target).toBe('workflow:build:deploy')
    upsertLadder({ target: 'build', level: 'insight' })
    expect(ladderForProfile('build')?.level).toBe('insight')
    expect(ladderForProfile('nobody')).toBeNull()
  })
})

describe('自治阶梯 REST 授权', () => {
  it('super_admin 可写入与删除配置', async () => {
    const put = await request('PUT', '/api/hermes/autonomy-ladder/alice', { level: 'assist' })
    expect(put.status).toBe(200)
    expect(getLadder('alice')?.level).toBe('assist')
    const del = await request('DELETE', '/api/hermes/autonomy-ladder/alice')
    expect(del.status).toBe(200)
    expect(getLadder('alice')).toBeNull()
    expect(appendGovEvent).toHaveBeenCalledTimes(2)
  })

  it('普通 admin 的 PUT/DELETE 均为 403，配置与审计事件不变', async () => {
    upsertLadder({ target: 'alice', level: 'insight' })
    currentUser = { id: 2, role: 'admin', status: 'active', profiles: ['alice'] }

    const put = await request('PUT', '/api/hermes/autonomy-ladder/alice', { level: 'auto' })
    expect(put.status).toBe(403)
    expect(getLadder('alice')?.level).toBe('insight')
    const del = await request('DELETE', '/api/hermes/autonomy-ladder/alice')
    expect(del.status).toBe(403)
    expect(getLadder('alice')?.level).toBe('insight')
    expect(appendGovEvent).not.toHaveBeenCalled()
  })

  it('无身份写配置为 401 且不进入配置存储', async () => {
    currentUser = undefined
    const response = await request('PUT', '/api/hermes/autonomy-ladder/alice', { level: 'auto' })
    expect(response.status).toBe(401)
    expect(getLadder('alice')).toBeNull()
    expect(appendGovEvent).not.toHaveBeenCalled()
  })
})
