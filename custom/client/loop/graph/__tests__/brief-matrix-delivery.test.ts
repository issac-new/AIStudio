// R1 — Brief Matrix 投递工厂单测（custom/server/loop/graph/brief-matrix-delivery.ts）。
// 覆盖：凭据解析优先级（matrix-session.json → LOOP_MATRIX_* env → gateway dotenv）/
// 无凭据返回 undefined（assembly 走 warn-once + event-log-only 路径）/
// 惰性 getMatrixClient 复用 + m.text 纯文本发送 / 发送失败向上抛（审计记 delivered:false）/
// 房间解析（LOOP_BRIEF_ROOM → gateway MATRIX_HOME_ROOM 回落）/
// #alias 房间经 getRoomIdForAlias 解析（失败上抛走审计）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { saveMatrixSession } from '../../../../server/matrix/session-store'
import { resolveBriefRoom } from '../../../../server/loop/graph/brief-matrix-delivery'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getMatrixClient: vi.fn(),
}))

vi.mock('matrix-js-sdk', () => ({ createClient: mocks.createClient }))
vi.mock('../../../../server/loop/store/matrix-client', () => ({ getMatrixClient: mocks.getMatrixClient }))

import { createMatrixBriefDelivery } from '../../../../server/loop/graph/brief-matrix-delivery'

let home: string
let hermesHome: string
let env: Record<string, string | undefined>

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'brief-delivery-test-'))
  hermesHome = mkdtempSync(join(tmpdir(), 'brief-delivery-hermes-'))
  env = {
    ...process.env,
    HERMES_WEB_UI_HOME: home,
    HERMES_HOME: hermesHome,
  }
  delete env.LOOP_BRIEF_ROOM
  delete env.LOOP_MATRIX_HOMESERVER
  delete env.LOOP_MATRIX_TOKEN
  delete env.LOOP_MATRIX_USER
  delete env.LOOP_MATRIX_PROFILE
  mocks.getMatrixClient.mockReset()
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  rmSync(hermesHome, { recursive: true, force: true })
})

const CLIENT = {
  sendMessage: vi.fn().mockResolvedValue('$evt:1'),
  getRoomIdForAlias: vi.fn().mockResolvedValue({ room_id: '!resolved:matrix.test' }),
}

function useClient(): void {
  CLIENT.sendMessage.mockReset()
  CLIENT.sendMessage.mockResolvedValue('$evt:1')
  CLIENT.getRoomIdForAlias.mockReset()
  CLIENT.getRoomIdForAlias.mockResolvedValue({ room_id: '!resolved:matrix.test' })
  mocks.getMatrixClient.mockReset().mockReturnValue(CLIENT as never)
}

/** 写 gateway dotenv（默认 orchestrator profile；值都走真解析路径） */
function writeGatewayEnv(opts: { profile?: string; homeserver?: string; token?: string; user?: string; homeRoom?: string } = {}): void {
  const dir = join(hermesHome, 'profiles', opts.profile ?? 'orchestrator')
  mkdirSync(dir, { recursive: true })
  const lines = [
    opts.homeserver === undefined ? '' : `MATRIX_HOMESERVER="${opts.homeserver}"`,
    opts.token === undefined ? '' : `MATRIX_ACCESS_TOKEN="${opts.token}"`,
    opts.user === undefined ? '' : `MATRIX_USER_ID="${opts.user}"`,
    opts.homeRoom === undefined ? '' : `MATRIX_HOME_ROOM="${opts.homeRoom}"`,
    '# gateway managed',
  ]
  writeFileSync(join(dir, '.env'), lines.filter(Boolean).join('\n') + '\n')
}

describe('createMatrixBriefDelivery 凭据解析', () => {
  it('无 session 文件且无 LOOP_MATRIX_* env → undefined（assembly warn-once 路径）', () => {
    expect(createMatrixBriefDelivery(env)).toBeUndefined()
  })

  it('session 文件存在 → 返回投递函数，按文件凭据惰性建 client', async () => {
    useClient()
    saveMatrixSession({ homeserverUrl: 'http://localhost:8008', userId: '@swarm:matrix.test', accessToken: 'syt_a' }, env)
    const deliver = createMatrixBriefDelivery(env)
    expect(deliver).toBeTypeOf('function')
    await deliver!('!room:matrix.test', 'brief body')
    expect(mocks.getMatrixClient).toHaveBeenCalledTimes(1)
    expect(mocks.getMatrixClient).toHaveBeenCalledWith({
      homeserverUrl: 'http://localhost:8008',
      accessToken: 'syt_a',
      userId: '@swarm:matrix.test',
      roomId: '!room:matrix.test',
    })
    expect(CLIENT.sendMessage).toHaveBeenCalledWith('!room:matrix.test', { msgtype: 'm.text', body: 'brief body' })
  })

  it('无 session 文件时回退 LOOP_MATRIX_HOMESERVER/TOKEN/USER env', async () => {
    useClient()
    env.LOOP_MATRIX_HOMESERVER = 'https://matrix.org'
    env.LOOP_MATRIX_TOKEN = 'syt_env'
    env.LOOP_MATRIX_USER = '@bot:matrix.org'
    const deliver = createMatrixBriefDelivery(env)!
    await deliver('!r:m', 'hello')
    expect(mocks.getMatrixClient).toHaveBeenCalledWith({
      homeserverUrl: 'https://matrix.org',
      accessToken: 'syt_env',
      userId: '@bot:matrix.org',
      roomId: '!r:m',
    })
  })

  it('env 三件套缺一 → undefined（不带着残缺凭据建 client）', () => {
    env.LOOP_MATRIX_HOMESERVER = 'https://matrix.org'
    env.LOOP_MATRIX_TOKEN = 'syt_env'
    // 缺 LOOP_MATRIX_USER
    expect(createMatrixBriefDelivery(env)).toBeUndefined()
  })

  it('session 文件畸形 → 视同无文件，回退 env', async () => {
    useClient()
    writeFileSync(join(home, 'matrix-session.json'), '{broken')
    env.LOOP_MATRIX_HOMESERVER = 'https://matrix.org'
    env.LOOP_MATRIX_TOKEN = 'syt_env'
    env.LOOP_MATRIX_USER = '@bot:matrix.org'
    const deliver = createMatrixBriefDelivery(env)
    expect(deliver).toBeTypeOf('function')
    await deliver!('!r:m', 'x')
    expect(mocks.getMatrixClient).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'syt_env' }))
  })

  it('重登录后 session 文件更新 → 下次发送用新 token（每次发送重读凭据）', async () => {
    useClient()
    saveMatrixSession({ homeserverUrl: 'http://localhost:8008', userId: '@u:t', accessToken: 'syt_old' }, env)
    const deliver = createMatrixBriefDelivery(env)!
    await deliver('!r:m', 'a')
    saveMatrixSession({ homeserverUrl: 'http://localhost:8008', userId: '@u:t', accessToken: 'syt_new' }, env)
    await deliver('!r:m', 'b')
    expect(mocks.getMatrixClient).toHaveBeenLastCalledWith(expect.objectContaining({ accessToken: 'syt_new' }))
  })
})

describe('createMatrixBriefDelivery 发送行为', () => {
  it('发送失败向上抛（daily-brief 审计记 delivered:false + error）', async () => {
    useClient()
    CLIENT.sendMessage.mockRejectedValue(new Error('M_FORBIDDEN'))
    saveMatrixSession({ homeserverUrl: 'http://localhost:8008', userId: '@u:t', accessToken: 'syt_a' }, env)
    const deliver = createMatrixBriefDelivery(env)!
    await expect(deliver('!r:m', 'x')).rejects.toThrow('M_FORBIDDEN')
  })

  it('client 惰性创建：未发送不建 client', () => {
    saveMatrixSession({ homeserverUrl: 'http://localhost:8008', userId: '@u:t', accessToken: 'syt_a' }, env)
    createMatrixBriefDelivery(env)
    expect(mocks.getMatrixClient).not.toHaveBeenCalled()
  })
})

describe('凭据第三级回落：gateway dotenv（orchestrator .env）', () => {
  it('无 session 文件、无 LOOP_MATRIX_* env → 回落 gateway 凭据', async () => {
    useClient()
    writeGatewayEnv({ homeserver: 'http://gw:8008', token: 'syt_gw', user: '@gateway:matrix.test' })
    const deliver = createMatrixBriefDelivery(env)
    expect(deliver).toBeTypeOf('function')
    await deliver!('!r:m', 'hello')
    expect(mocks.getMatrixClient).toHaveBeenCalledWith({
      homeserverUrl: 'http://gw:8008',
      accessToken: 'syt_gw',
      userId: '@gateway:matrix.test',
      roomId: '!r:m',
    })
  })

  it('优先级：session 文件压过 gateway', async () => {
    useClient()
    saveMatrixSession({ homeserverUrl: 'http://s:8008', userId: '@s:t', accessToken: 'syt_session' }, env)
    writeGatewayEnv({ homeserver: 'http://gw:8008', token: 'syt_gw', user: '@gateway:matrix.test' })
    const deliver = createMatrixBriefDelivery(env)!
    await deliver('!r:m', 'x')
    expect(mocks.getMatrixClient).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'syt_session' }))
  })

  it('优先级：LOOP_MATRIX_* env 压过 gateway', async () => {
    useClient()
    env.LOOP_MATRIX_HOMESERVER = 'https://matrix.org'
    env.LOOP_MATRIX_TOKEN = 'syt_env'
    env.LOOP_MATRIX_USER = '@bot:matrix.org'
    writeGatewayEnv({ homeserver: 'http://gw:8008', token: 'syt_gw', user: '@gateway:matrix.test' })
    const deliver = createMatrixBriefDelivery(env)!
    await deliver('!r:m', 'x')
    expect(mocks.getMatrixClient).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'syt_env' }))
  })

  it('env 三件套残缺时跳到 gateway（残缺级不作硬失败）', async () => {
    useClient()
    env.LOOP_MATRIX_HOMESERVER = 'https://matrix.org' // 缺 TOKEN/USER
    writeGatewayEnv({ homeserver: 'http://gw:8008', token: 'syt_gw', user: '@gateway:matrix.test' })
    const deliver = createMatrixBriefDelivery(env)!
    await deliver('!r:m', 'x')
    expect(mocks.getMatrixClient).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'syt_gw' }))
  })

  it('LOOP_MATRIX_PROFILE 指向其他 profile', async () => {
    useClient()
    writeGatewayEnv({ profile: 'ops-sre', homeserver: 'http://sre:8008', token: 'syt_sre', user: '@sre:m' })
    env.LOOP_MATRIX_PROFILE = 'ops-sre'
    const deliver = createMatrixBriefDelivery(env)!
    await deliver('!r:m', 'x')
    expect(mocks.getMatrixClient).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'syt_sre' }))
  })

  it('gateway dotenv 畸形/缺必填 → undefined（无任何凭据）', () => {
    writeGatewayEnv({ homeserver: 'http://gw:8008' }) // 缺 TOKEN/USER
    expect(createMatrixBriefDelivery(env)).toBeUndefined()
  })
})

describe('resolveBriefRoom 房间解析（LOOP_BRIEF_ROOM → gateway MATRIX_HOME_ROOM）', () => {
  it('LOOP_BRIEF_ROOM 优先，即便 gateway 有 HOME_ROOM', () => {
    writeGatewayEnv({ homeserver: 'h', token: 't', user: 'u', homeRoom: '!home:matrix.test' })
    env.LOOP_BRIEF_ROOM = '!explicit:matrix.test'
    expect(resolveBriefRoom(env)).toBe('!explicit:matrix.test')
  })

  it('无 LOOP_BRIEF_ROOM 回落 gateway MATRIX_HOME_ROOM', () => {
    writeGatewayEnv({ homeserver: 'h', token: 't', user: 'u', homeRoom: '#brief-home:matrix.test' })
    expect(resolveBriefRoom(env)).toBe('#brief-home:matrix.test')
  })

  it('两处皆无 → undefined（assembly 保持 event-log-only）', () => {
    expect(resolveBriefRoom(env)).toBeUndefined()
  })

  it('gateway 凭据缺失但 HOME_ROOM 存在 → 房间仍可解析（房间与凭据独立）', () => {
    writeGatewayEnv({ homeRoom: '!home:matrix.test' }) // 无凭据三件套
    expect(resolveBriefRoom(env)).toBe('!home:matrix.test')
  })
})

describe('#alias 房间解析', () => {
  it('#alias:server 经 getRoomIdForAlias 解析后发送', async () => {
    useClient()
    saveMatrixSession({ homeserverUrl: 'http://localhost:8008', userId: '@u:t', accessToken: 'syt_a' }, env)
    const deliver = createMatrixBriefDelivery(env)!
    await deliver('#brief-home:matrix.test', 'hello')
    expect(CLIENT.getRoomIdForAlias).toHaveBeenCalledWith('#brief-home:matrix.test')
    expect(CLIENT.sendMessage).toHaveBeenCalledWith('!resolved:matrix.test', { msgtype: 'm.text', body: 'hello' })
  })

  it('!room id 直发，不走 alias 解析', async () => {
    useClient()
    saveMatrixSession({ homeserverUrl: 'http://localhost:8008', userId: '@u:t', accessToken: 'syt_a' }, env)
    const deliver = createMatrixBriefDelivery(env)!
    await deliver('!plain:matrix.test', 'hello')
    expect(CLIENT.getRoomIdForAlias).not.toHaveBeenCalled()
    expect(CLIENT.sendMessage).toHaveBeenCalledWith('!plain:matrix.test', expect.anything())
  })

  it('alias 解析失败向上抛（审计记 delivered:false）', async () => {
    useClient()
    CLIENT.getRoomIdForAlias.mockRejectedValue(new Error('M_NOT_FOUND'))
    saveMatrixSession({ homeserverUrl: 'http://localhost:8008', userId: '@u:t', accessToken: 'syt_a' }, env)
    const deliver = createMatrixBriefDelivery(env)!
    await expect(deliver('#ghost:matrix.test', 'x')).rejects.toThrow('M_NOT_FOUND')
    expect(CLIENT.sendMessage).not.toHaveBeenCalled()
  })
})
