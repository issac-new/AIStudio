// overlay/custom/server/matrix/__tests__/raci-matrix.test.ts
// RACI 真实 Matrix 派守门（room-invite-gap 根治）：
//  - 有凭据 → 真走 client-server HTTP（createRoom/invite/send 按序、邀人幂等）
//  - 无凭据 → 回落内存模拟（无网关环境/既有测试不破）
//  - DispatchResult.mode 如实反映走的通道
// fetch 全部存根（fetchStub），不触真实网络。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'fs'

// vi.hoisted 保证 mock 工厂引用的常量先于 vi.mock 提升初始化
const MOCK_HOME = vi.hoisted(() => '/tmp/raci-matrix-test-home')
vi.mock('os', () => {
  const path = require('path')
  return {
    default: { homedir: () => MOCK_HOME, tmpdir: () => '/tmp', EOL: '\n', platform: () => 'darwin' },
    homedir: () => MOCK_HOME,
    tmpdir: () => '/tmp',
    EOL: '\n',
    platform: () => 'darwin',
    arch: () => 'arm64',
    join: path.posix.join,
  }
})

const SIM_HOME = MOCK_HOME
const ENV_DIR = `${SIM_HOME}/.hermes/profiles/chen`
function writeCredsEnv(): void {
  mkdirSync(ENV_DIR, { recursive: true })
  writeFileSync(`${ENV_DIR}/.env`,
    'MATRIX_HOMESERVER=http://127.0.0.1:8008\nMATRIX_ACCESS_TOKEN=tok\nMATRIX_USER_ID=@chen-agent:matrix.test\n')
}

import { RACIDispatchService } from '../../services/kanban/raci-dispatch'

function mkTask(body: Record<string, unknown> | null) {
  return {
    id: 't_raci_1',
    title: '支付收银台联调',
    body: body ? JSON.stringify(body) : null,
    assignee: 'chen',
    status: 'todo',
  }
}

const RACI = {
  raci: {
    responsible: ['@chen-agent:matrix.test'],
    approver: ['@bella:matrix.test'],
    consulted: [],
    informed: ['@qi:matrix.test'],
  },
}

interface FetchCall { url: string; method: string; body: string }

function stubFetch(opts: { alreadyInRoom?: boolean } = {}) {
  const calls: FetchCall[] = []
  const stub = vi.fn(async (input: unknown, init?: { method?: string; body?: string }) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const body = init?.body ?? ''
    calls.push({ url, method, body })
    if (url.includes('/createRoom')) {
      return new Response(JSON.stringify({ room_id: '!newroom:matrix.test' }), { status: 200 })
    }
    if (url.includes('/invite') && opts.alreadyInRoom) {
      return new Response(JSON.stringify({ errcode: 'M_FORBIDDEN', error: 'User @x is already in the room.' }), { status: 403 })
    }
    return new Response('{}', { status: 200 })
  })
  vi.stubGlobal('fetch', stub)
  return calls
}

describe('RACI 真实 Matrix 派发（room-invite-gap 根治）', () => {
  let dedupeSeq = 0
  // 每用例唯一 dedupe 路径：sidecar 去重以 roomId 命中即短路返回（无 mode），
  // 路径串了会让后跑的用例命中先跑用例的记录。
  const freshDedupe = () => `${SIM_HOME}/dedupe-${Date.now()}-${++dedupeSeq}.json`
  beforeEach(() => {
    // 有凭据：gateway dotenv 三必填齐备
    process.env.HERMES_HOME = `${SIM_HOME}/.hermes`
    process.env.LOOP_MATRIX_PROFILE = 'chen'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.HERMES_HOME
    delete process.env.LOOP_MATRIX_PROFILE
  })

  it('有凭据 → 真走 createRoom+invite+send，邀全 RACI 名单，mode=matrix', async () => {
    writeCredsEnv()
    const calls = stubFetch()
    const res = await RACIDispatchService.dispatch(mkTask(RACI), freshDedupe())
    expect(res.ok).toBe(true)
    expect(res.mode).toBe('matrix')
    expect(res.roomId).toBe('!newroom:matrix.test')
    const create = calls.find(c => c.url.includes('/createRoom'))
    expect(create).toBeDefined()
    const invitees = JSON.parse(create!.body).invite as string[]
    expect(invitees).toEqual(expect.arrayContaining(['@chen-agent:matrix.test', '@bella:matrix.test', '@qi:matrix.test']))
    expect(calls.filter(c => c.url.includes('/invite')).length).toBe(3) // 补邀幂等兜底
    expect(calls.some(c => c.url.includes('/send/m.room.message'))).toBe(true)
  })

  it('邀人遇 already-in-room → 幂等成功不抛错', async () => {
    writeCredsEnv()
    stubFetch({ alreadyInRoom: true })
    const res = await RACIDispatchService.dispatch(mkTask(RACI), freshDedupe())
    expect(res.ok).toBe(true) // 幂等邀人不炸整个派发
  })

  it('无凭据 → 回落内存模拟，mode=simulated', async () => {
    delete process.env.HERMES_HOME
    process.env.HERMES_HOME = `${SIM_HOME}/empty-home` // 无 profiles/.env
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const res = await RACIDispatchService.dispatch(mkTask(RACI), freshDedupe())
    expect(res.ok).toBe(true)
    expect(res.mode).toBe('simulated')
    expect(fetchSpy).not.toHaveBeenCalled() // 无凭据绝不出网
  })
})
