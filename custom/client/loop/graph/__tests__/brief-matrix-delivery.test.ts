// R1 — Brief Matrix 投递工厂单测（custom/server/loop/graph/brief-matrix-delivery.ts）。
// 覆盖：凭据解析优先级（matrix-session.json → LOOP_MATRIX_* env）/
// 无凭据返回 undefined（assembly 走 warn-once + event-log-only 路径）/
// 惰性 getMatrixClient 复用 + m.text 纯文本发送 / 发送失败向上抛（审计记 delivered:false）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { saveMatrixSession } from '../../../../server/matrix/session-store'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getMatrixClient: vi.fn(),
}))

vi.mock('matrix-js-sdk', () => ({ createClient: mocks.createClient }))
vi.mock('../../../../server/loop/store/matrix-client', () => ({ getMatrixClient: mocks.getMatrixClient }))

import { createMatrixBriefDelivery } from '../../../../server/loop/graph/brief-matrix-delivery'

let home: string
let env: Record<string, string | undefined>

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'brief-delivery-test-'))
  env = { ...process.env, HERMES_WEB_UI_HOME: home }
  mocks.getMatrixClient.mockReset()
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

const CLIENT = { sendMessage: vi.fn().mockResolvedValue('$evt:1') }

function useClient(): void {
  CLIENT.sendMessage.mockReset()
  CLIENT.sendMessage.mockResolvedValue('$evt:1')
  mocks.getMatrixClient.mockReset().mockReturnValue(CLIENT as never)
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
