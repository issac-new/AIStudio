// R1 — patch 012 matrixLogin 控制器级测试：登录成功后 Matrix 会话本机落盘。
//
// 位置说明：放 custom/client/loop/__tests__（与 store-factory.test.ts 测 server 模块同款
// 安置）——custom/server 树会被注入后的上游 server tsc 经 src/custom 符号链接纳入
// type-check，本测试的物理相对 import（../../../../../upstream/...）在链接视角不可解析
//（TS2307），故置于不被 server tsc 覆盖的 custom/client 侧。
//
// ⚠️ 本测试挂载 patch 012 注入后的上游控制器（clean 树下无 matrixLogin 的落盘行为，
// 与 upstream-terminal-ws-lifecycle.test.ts 依赖 inject 态同款约定）。
// 上游依赖全部 mock：users（避免触碰真实 DB）、jwt、profile-config、
// custom admin-service（validateMatrixToken 假通过）；只放开登录限流与 url-guard 真实现
//（http://localhost:8008 + allowPrivateIp 走真实 SSRF 校验路径）。
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  saveMatrixSession: vi.fn(),
  validateMatrixToken: vi.fn(),
  getMatrixUserInfo: vi.fn(),
  issueUserJwt: vi.fn(),
  findByMatrixUserId: vi.fn(),
  createFromMatrix: vi.fn(),
  syncMatrixMetadata: vi.fn(),
}))

vi.mock('../../../server/matrix/session-store', () => ({ saveMatrixSession: mocks.saveMatrixSession }))

vi.mock('../../../server/matrix/admin-service', () => ({
  validateMatrixToken: mocks.validateMatrixToken,
  getMatrixUserInfo: mocks.getMatrixUserInfo,
  listMatrixUsers: vi.fn(),
  createMatrixUser: vi.fn(),
  resetMatrixUserPassword: vi.fn(),
  setMatrixUserActive: vi.fn(),
  deleteMatrixUser: vi.fn(),
}))

// 上游模块：路径自本文件起 5 级到 ncwk 根，再进 upstream/hermes-studio。
// vi.mock 会提升到文件顶部，路径常量必须用 vi.hoisted 同步提升。
const UPSTREAM = vi.hoisted(() => '../../../../../upstream/hermes-studio/packages/server/src/modules/studio')
vi.mock(`${UPSTREAM}/public/users`, () => ({
  DEFAULT_USERNAME: 'admin',
  DEFAULT_PASSWORD: '123456',
  bootstrapDefaultSuperAdmin: vi.fn(),
  countActiveSuperAdmins: vi.fn(() => 1),
  countUsers: vi.fn(() => 1),
  createFromMatrix: mocks.createFromMatrix,
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  findByMatrixUserId: mocks.findByMatrixUserId,
  findUserById: vi.fn(),
  findUserByUsername: vi.fn(),
  getUserAvatar: vi.fn(),
  listUserProfiles: vi.fn(() => []),
  listUsers: vi.fn(() => []),
  replaceUserProfiles: vi.fn(),
  setUserAvatar: vi.fn(),
  syncMatrixMetadata: mocks.syncMatrixMetadata,
  updateMatrixUserMetadata: vi.fn(),
  updateUser: vi.fn(),
  updateUsername: vi.fn(),
  updateUserPassword: vi.fn(),
  verifyPassword: vi.fn(),
}))
vi.mock(`${UPSTREAM}/public/auth`, () => ({
  getUserJwtExpiresSeconds: vi.fn(() => 3600),
  issueAppJwt: vi.fn(),
  issueUserJwt: mocks.issueUserJwt,
}))
vi.mock(`${UPSTREAM}/public/profile-config`, () => ({
  listProfileNamesFromDisk: vi.fn(() => ['default']),
}))

import { matrixLogin } from '../../../../../upstream/hermes-studio/packages/server/src/modules/studio/controllers/auth'

const USER = {
  id: 7, username: 'swarm', role: 'super_admin', status: 'active',
  matrix_user_id: '@swarm:matrix.test', matrix_display_name: 'Swarm',
  matrix_avatar_url: null, matrix_homeserver_url: 'http://localhost:8008',
  auth_source: 'matrix', created_at: 0, updated_at: 0, last_login_at: null,
}

function makeCtx(body: Record<string, unknown>): { status: number; body: unknown; ip: string; request: { body: Record<string, unknown> } } {
  return {
    status: undefined as unknown as number,
    body: undefined as unknown,
    ip: '203.0.113.77',
    request: { body },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.validateMatrixToken.mockResolvedValue({ userId: '@swarm:matrix.test' })
  mocks.getMatrixUserInfo.mockResolvedValue({ displayName: 'Swarm', avatarUrl: '' })
  mocks.findByMatrixUserId.mockReturnValue(USER)
  mocks.issueUserJwt.mockResolvedValue('jwt-app-token')
})

const LOGIN_BODY = {
  matrixAccessToken: 'syt_browser_token',
  matrixUserId: '@swarm:matrix.test',
  deviceId: 'DEVABC',
  homeserverUrl: 'http://localhost:8008',
}

describe('matrixLogin → saveMatrixSession（patch 012）', () => {
  it('token 校验通过且用户已绑定 → 落盘 session（homeserverUrl 用 SSRF 归一 origin）', async () => {
    const ctx = makeCtx(LOGIN_BODY)
    await matrixLogin(ctx as never)
    expect(ctx.status).toBeUndefined() // koa 默认 200
    expect((ctx.body as { token: string }).token).toBe('jwt-app-token')
    expect(mocks.saveMatrixSession).toHaveBeenCalledTimes(1)
    expect(mocks.saveMatrixSession).toHaveBeenCalledWith({
      homeserverUrl: 'http://localhost:8008',
      userId: '@swarm:matrix.test',
      accessToken: 'syt_browser_token',
      deviceId: 'DEVABC',
    })
  })

  it('token 校验失败（401）→ 不落盘', async () => {
    mocks.validateMatrixToken.mockResolvedValue(null)
    const ctx = makeCtx(LOGIN_BODY)
    await matrixLogin(ctx as never)
    expect(ctx.status).toBe(401)
    expect(mocks.saveMatrixSession).not.toHaveBeenCalled()
  })

  it('校验通过但 userId 不匹配（401）→ 不落盘', async () => {
    mocks.validateMatrixToken.mockResolvedValue({ userId: '@other:matrix.test' })
    const ctx = makeCtx(LOGIN_BODY)
    await matrixLogin(ctx as never)
    expect(ctx.status).toBe(401)
    expect(mocks.saveMatrixSession).not.toHaveBeenCalled()
  })

  it('落盘失败只 warn，不阻断登录（fire-and-forget）', async () => {
    mocks.saveMatrixSession.mockImplementation(() => { throw new Error('EACCES: readonly fs') })
    const ctx = makeCtx(LOGIN_BODY)
    await matrixLogin(ctx as never)
    expect((ctx.body as { token: string }).token).toBe('jwt-app-token')
    expect(ctx.status).toBeUndefined()
  })

  it('老用户（syncMatrixMetadata 路径）同样落盘', async () => {
    const ctx = makeCtx(LOGIN_BODY)
    await matrixLogin(ctx as never)
    expect(mocks.syncMatrixMetadata).toHaveBeenCalledWith(USER.id, expect.objectContaining({ lastLoginAt: expect.any(Number) }))
    expect(mocks.saveMatrixSession).toHaveBeenCalledTimes(1)
  })
})
