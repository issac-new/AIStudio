import { afterEach, describe, expect, it, vi } from 'vitest'
import { provisionMatrixIdentity } from '../matrix-login'

const validPresentation = {
  matrixAccessToken: 'matrix-access-token',
  matrixUserId: '@alice:one.example',
  homeserverUrl: 'https://one.example',
  deviceId: 'DEVICEONE',
  matrixInfo: { displayName: 'Alice', avatarUrl: '' },
}

function matrixUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    username: 'alice-existing',
    role: 'admin',
    status: 'active',
    matrix_user_id: validPresentation.matrixUserId,
    matrix_homeserver_url: validPresentation.homeserverUrl,
    ...overrides,
  }
}

function makeDeps() {
  return {
    findByMatrixUserId: vi.fn(),
    createFromMatrix: vi.fn(),
    listUserProfiles: vi.fn(() => []),
    replaceUserProfiles: vi.fn(),
    syncMatrixMetadata: vi.fn(),
    saveMatrixSession: vi.fn(),
    issueUserJwt: vi.fn(async () => 'jwt-app-token'),
    countActiveSuperAdmins: vi.fn(() => 1),
  }
}

describe('Matrix 零权限供应', () => {
  it('新身份只落待激活账号，不写 token/session/profile', async () => {
    const deps = makeDeps()
    deps.findByMatrixUserId.mockReturnValue(null)
    deps.createFromMatrix.mockReturnValue(matrixUser({ status: 'disabled' }))

    const result = await provisionMatrixIdentity(validPresentation, deps)

    expect(result).toMatchObject({
      kind: 'pending',
      status: 'disabled',
      code: 'ACCOUNT_PENDING_ACTIVATION',
    })
    expect(result).not.toHaveProperty('token')
    expect(deps.createFromMatrix).toHaveBeenCalledWith(expect.objectContaining({
      matrixUserId: validPresentation.matrixUserId,
      homeserverUrl: validPresentation.homeserverUrl,
      role: 'admin',
      status: 'disabled',
    }))
    expect(deps.issueUserJwt).not.toHaveBeenCalled()
    expect(deps.saveMatrixSession).not.toHaveBeenCalled()
    expect(deps.replaceUserProfiles).not.toHaveBeenCalled()
    expect(deps.syncMatrixMetadata).not.toHaveBeenCalled()
  })

  it('零 super_admin 时返回既有 CLI 指引且不签发任何会话', async () => {
    const deps = makeDeps()
    deps.findByMatrixUserId.mockReturnValue(null)
    deps.createFromMatrix.mockReturnValue(matrixUser({ status: 'disabled' }))
    deps.countActiveSuperAdmins.mockReturnValue(0)

    const result = await provisionMatrixIdentity(validPresentation, deps)

    expect(result).toMatchObject({
      kind: 'pending',
      status: 'disabled',
      code: 'ACCOUNT_PENDING_ACTIVATION',
      guidance: expect.stringContaining('hermes-web-ui reset-default-login'),
    })
    expect(result).not.toHaveProperty('token')
    expect(deps.issueUserJwt).not.toHaveBeenCalled()
    expect(deps.saveMatrixSession).not.toHaveBeenCalled()
    expect(deps.replaceUserProfiles).not.toHaveBeenCalled()
    expect(deps.syncMatrixMetadata).not.toHaveBeenCalled()
  })

  it('已有账号来源不同返回冲突，且不改绑或签发会话', async () => {
    const deps = makeDeps()
    deps.findByMatrixUserId.mockReturnValue(matrixUser({
      role: 'super_admin',
      matrix_homeserver_url: 'https://other.example',
    }))

    const result = await provisionMatrixIdentity(validPresentation, deps)

    expect(result).toMatchObject({ kind: 'conflict', code: 'MATRIX_IDENTITY_CONFLICT' })
    expect(result).not.toHaveProperty('token')
    expect(deps.createFromMatrix).not.toHaveBeenCalled()
    expect(deps.syncMatrixMetadata).not.toHaveBeenCalled()
    expect(deps.issueUserJwt).not.toHaveBeenCalled()
    expect(deps.saveMatrixSession).not.toHaveBeenCalled()
    expect(deps.replaceUserProfiles).not.toHaveBeenCalled()
  })

  it('旧账号未绑定 origin 时返回冲突且不自动补绑', async () => {
    const deps = makeDeps()
    deps.findByMatrixUserId.mockReturnValue(matrixUser({ matrix_homeserver_url: null }))

    const result = await provisionMatrixIdentity(validPresentation, deps)

    expect(result).toMatchObject({ kind: 'conflict', code: 'MATRIX_IDENTITY_ORIGIN_UNBOUND' })
    expect(deps.syncMatrixMetadata).not.toHaveBeenCalled()
    expect(deps.issueUserJwt).not.toHaveBeenCalled()
    expect(deps.saveMatrixSession).not.toHaveBeenCalled()
  })

  it('旧账号 origin 不可规范化时返回冲突且不自动补绑', async () => {
    const deps = makeDeps()
    deps.findByMatrixUserId.mockReturnValue(matrixUser({ matrix_homeserver_url: 'not-a-url' }))

    const result = await provisionMatrixIdentity(validPresentation, deps)

    expect(result).toMatchObject({ kind: 'conflict', code: 'MATRIX_IDENTITY_CONFLICT' })
    expect(deps.syncMatrixMetadata).not.toHaveBeenCalled()
    expect(deps.issueUserJwt).not.toHaveBeenCalled()
    expect(deps.saveMatrixSession).not.toHaveBeenCalled()
  })

  it('active 普通 admin 空 profiles 仍待授权，不签发任何会话', async () => {
    const deps = makeDeps()
    deps.findByMatrixUserId.mockReturnValue(matrixUser())
    deps.listUserProfiles.mockReturnValue([])

    const result = await provisionMatrixIdentity(validPresentation, deps)

    expect(result).toMatchObject({
      kind: 'pending',
      status: 'active',
      code: 'PROFILE_GRANT_REQUIRED',
    })
    expect(result).not.toHaveProperty('token')
    expect(deps.syncMatrixMetadata).not.toHaveBeenCalled()
    expect(deps.issueUserJwt).not.toHaveBeenCalled()
    expect(deps.saveMatrixSession).not.toHaveBeenCalled()
    expect(deps.replaceUserProfiles).not.toHaveBeenCalled()
  })

  it('激活且已授权的普通 admin 才同步元数据并签发会话', async () => {
    const deps = makeDeps()
    const user = matrixUser()
    deps.findByMatrixUserId.mockReturnValue(user)
    deps.listUserProfiles.mockReturnValue([{ profile_name: 'alice' }])

    const result = await provisionMatrixIdentity(validPresentation, deps)

    expect(result).toMatchObject({ kind: 'active', status: 'active', token: 'jwt-app-token' })
    expect(deps.syncMatrixMetadata).toHaveBeenCalledWith(user.id, expect.objectContaining({
      displayName: 'Alice',
      lastLoginAt: expect.any(Number),
    }))
    expect(deps.saveMatrixSession).toHaveBeenCalledWith({
      homeserverUrl: validPresentation.homeserverUrl,
      userId: validPresentation.matrixUserId,
      accessToken: validPresentation.matrixAccessToken,
      deviceId: validPresentation.deviceId,
    })
    expect(deps.issueUserJwt).toHaveBeenCalledWith(user)
    expect(deps.replaceUserProfiles).not.toHaveBeenCalled()
  })

  it('active super_admin 没有 profile 行也可签发会话', async () => {
    const deps = makeDeps()
    deps.findByMatrixUserId.mockReturnValue(matrixUser({ role: 'super_admin' }))
    deps.listUserProfiles.mockReturnValue([])

    const result = await provisionMatrixIdentity(validPresentation, deps)

    expect(result).toMatchObject({ kind: 'active', token: 'jwt-app-token' })
    expect(deps.issueUserJwt).toHaveBeenCalledOnce()
    expect(deps.saveMatrixSession).toHaveBeenCalledOnce()
  })

  it('激活成功后使用同步后的用户快照签发和返回', async () => {
    const deps = makeDeps()
    const stale = matrixUser({ matrix_display_name: 'Old name', last_login_at: null })
    const refreshed = matrixUser({ matrix_display_name: 'Alice', last_login_at: 123456 })
    deps.findByMatrixUserId
      .mockReturnValueOnce(stale)
      .mockReturnValueOnce(refreshed)
    deps.listUserProfiles.mockReturnValue([{ profile_name: 'alice' }])

    const result = await provisionMatrixIdentity(validPresentation, deps)

    expect(deps.findByMatrixUserId).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ kind: 'active', user: refreshed })
    expect(deps.issueUserJwt).toHaveBeenCalledWith(refreshed)
  })

  it('相同 localpart 跨 origin 不共用本地用户名', async () => {
    const deps = makeDeps()
    deps.findByMatrixUserId.mockReturnValue(null)
    deps.createFromMatrix.mockImplementation(data => matrixUser({
      username: data.username,
      status: 'disabled',
      matrix_user_id: data.matrixUserId,
      matrix_homeserver_url: data.homeserverUrl,
    }))

    await provisionMatrixIdentity(validPresentation, deps)
    await provisionMatrixIdentity({
      ...validPresentation,
      matrixUserId: '@alice:two.example',
      homeserverUrl: 'https://two.example',
    }, deps)

    const firstUsername = deps.createFromMatrix.mock.calls[0][0].username
    const secondUsername = deps.createFromMatrix.mock.calls[1][0].username
    expect(firstUsername).not.toBe(secondUsername)
  })
})

const VENDOR_STUDIO = '../../../../../vendor/hermes-studio/packages/server/src/modules/studio'
const DATABASE_MODULE = `${VENDOR_STUDIO}/infrastructure/database/index`
const PROFILE_CONFIG_MODULE = `${VENDOR_STUDIO}/public/profile-config`
let vendorDb: { close(): void; exec(sql: string): void } | null = null

async function initVendorAuth() {
  vi.resetModules()
  vi.stubEnv('AUTH_JWT_SECRET', 'platform-matrix-test-secret')
  const { DatabaseSync } = await import('node:sqlite')
  vendorDb = new DatabaseSync(':memory:')
  vi.doMock(DATABASE_MODULE, () => ({
    getDb: () => vendorDb,
    getStoragePath: () => ':memory:',
    isSqliteAvailable: () => true,
  }))
  vi.doMock(PROFILE_CONFIG_MODULE, () => ({ listProfileNamesFromDisk: () => ['default', 'alice'] }))
  const schemas = await import(`${VENDOR_STUDIO}/infrastructure/database/schemas`)
  schemas.initAllHermesTables()
  const users = await import(`${VENDOR_STUDIO}/repositories/users-store`)
  const auth = await import(`${VENDOR_STUDIO}/middleware/auth`)
  return { db: vendorDb, schemas, users, auth }
}

function jwtContext(token: string) {
  return {
    path: '/api/studio/sessions',
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
    query: {},
    state: {},
    request: { body: {}, ip: '203.0.113.10' },
    req: { socket: { remoteAddress: '203.0.113.10' } },
    ip: '203.0.113.10',
    status: 200,
    body: null,
    get: () => '',
  } as any
}

afterEach(() => {
  vendorDb?.close()
  vendorDb = null
  vi.doUnmock(DATABASE_MODULE)
  vi.doUnmock(PROFILE_CONFIG_MODULE)
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('vendor Matrix 存储与统一认证', () => {
  it('createFromMatrix 显式 disabled 时落 disabled 且零 profiles', async () => {
    const { users } = await initVendorAuth()

    const user = users.createFromMatrix({
      matrixUserId: validPresentation.matrixUserId,
      username: 'alice-pending',
      displayName: 'Alice',
      avatarUrl: '',
      homeserverUrl: validPresentation.homeserverUrl,
      role: 'admin',
      status: 'disabled',
    })

    expect(user).toMatchObject({ role: 'admin', status: 'disabled' })
    expect(users.listUserProfiles(user!.id)).toEqual([])
  })

  it('管理端省略 status 时默认 active，但不暗授 default profile', async () => {
    const { users } = await initVendorAuth()

    const user = users.createFromMatrix({
      matrixUserId: validPresentation.matrixUserId,
      username: 'alice-managed',
      displayName: 'Alice',
      avatarUrl: '',
      homeserverUrl: validPresentation.homeserverUrl,
      role: 'admin',
    })

    expect(user).toMatchObject({ status: 'active' })
    expect(users.listUserProfiles(user!.id)).toEqual([])
  })

  it('激活与 profile 授权写失败时整体回滚，并可在修复后重试', async () => {
    const { db, schemas, users } = await initVendorAuth()
    const user = users.createFromMatrix({
      matrixUserId: validPresentation.matrixUserId,
      username: 'alice-transaction',
      displayName: 'Alice',
      avatarUrl: '',
      homeserverUrl: validPresentation.homeserverUrl,
      role: 'admin',
      status: 'disabled',
    })!
    users.replaceUserProfiles(user.id, ['alice'], 'alice')
    db!.exec(`
      CREATE TRIGGER reject_profile_grant
      BEFORE INSERT ON ${schemas.USER_PROFILES_TABLE}
      WHEN NEW.profile_name = 'forbidden'
      BEGIN SELECT RAISE(ABORT, 'forced profile failure'); END;
    `)
    const controller = await import(`${VENDOR_STUDIO}/controllers/auth`)
    const ctx = {
      params: { id: encodeURIComponent(validPresentation.matrixUserId) },
      request: { body: { status: 'active', profiles: ['forbidden'] } },
      state: { user: { id: 999, role: 'super_admin' } },
      status: 200,
      body: null,
    } as any

    await expect(controller.updateMatrixUser(ctx)).rejects.toThrow('forced profile failure')

    expect(users.findByMatrixUserId(validPresentation.matrixUserId)).toMatchObject({ status: 'disabled' })
    expect(users.listUserProfiles(user.id).map((profile: { profile_name: string }) => profile.profile_name)).toEqual(['alice'])

    db!.exec('DROP TRIGGER reject_profile_grant')
    ctx.request.body = { status: 'active', profiles: ['alice'] }
    await controller.updateMatrixUser(ctx)

    expect(ctx.status).toBe(200)
    expect(users.findByMatrixUserId(validPresentation.matrixUserId)).toMatchObject({ status: 'active' })
    expect(users.listUserProfiles(user.id).map((profile: { profile_name: string }) => profile.profile_name)).toEqual(['alice'])
  })

  it('统一 HTTP 认证拒绝普通 admin 的旧空授权 JWT', async () => {
    const { users, auth } = await initVendorAuth()
    const user = users.createUser({ username: 'empty-admin', password: 'secret', role: 'admin', profiles: [] })!
    const ctx = jwtContext(auth.signUserJwt(user, 'platform-matrix-test-secret'))
    const next = vi.fn(async () => {})

    await auth.requireUserJwt(ctx, next)

    expect(ctx.status).toBe(403)
    expect(ctx.body).toMatchObject({ code: 'PROFILE_GRANT_REQUIRED' })
    expect(next).not.toHaveBeenCalled()
  })

  it('token introspection 同样拒绝普通 admin 的旧空授权 JWT', async () => {
    const { users, auth } = await initVendorAuth()
    const user = users.createUser({ username: 'empty-admin', password: 'secret', role: 'admin', profiles: [] })!
    const token = auth.signUserJwt(user, 'platform-matrix-test-secret')

    expect(await auth.authenticateUserToken(token)).toBeNull()
  })

  it('App token 检查把空授权普通 admin 视为 invalid', async () => {
    const { users, auth } = await initVendorAuth()
    const user = users.createUser({ username: 'empty-admin', password: 'secret', role: 'admin', profiles: [] })!
    const token = await auth.issueAppJwt(user, 'device-empty', 'lan')
    const connections = await import(`${VENDOR_STUDIO}/repositories/app-connections-store`)
    connections.upsertAppConnection({
      deviceCode: 'device-empty',
      deviceName: '',
      deviceBrand: '',
      deviceModel: '',
      connectionType: 'lan',
      userId: user.id,
      token,
      tokenExpiresAt: 9999999999,
    })

    expect(await auth.inspectAppUserToken(token)).toMatchObject({ status: 'invalid', user: null })
  })

  it('Model API key 通道同样拒绝空授权普通 admin', async () => {
    const { users, auth } = await initVendorAuth()
    const user = users.createUser({ username: 'empty-admin', password: 'secret', role: 'admin', profiles: [] })!
    const keys = await import(`${VENDOR_STUDIO}/services/model-api/keys`)
    const { apiKey } = keys.createModelApiKey(user.id, 'empty-admin-key', ['model/test'], null)
    const ctx = jwtContext(apiKey)
    ctx.path = '/api/ekko-studio/models/v1/models'
    ctx.get = (name: string) => name.toLowerCase() === 'authorization' ? `Bearer ${apiKey}` : ''
    const next = vi.fn(async () => {})

    await auth.requireUserJwt(ctx, next)

    expect(ctx.status).toBe(403)
    expect(ctx.body).toMatchObject({ error: { code: 'PROFILE_GRANT_REQUIRED' } })
    expect(next).not.toHaveBeenCalled()
  })

  it('super_admin 没有 profile 行仍通过统一认证', async () => {
    const { users, auth } = await initVendorAuth()
    const user = users.createSuperAdmin('root', 'secret')!
    const token = auth.signUserJwt(user, 'platform-matrix-test-secret')
    const ctx = jwtContext(token)
    const next = vi.fn(async () => {})

    await auth.requireUserJwt(ctx, next)

    expect(next).toHaveBeenCalledOnce()
    expect(await auth.authenticateUserToken(token)).toMatchObject({ id: user.id, role: 'super_admin' })
  })

  it('active 普通 admin 有 profile 时仍通过统一认证', async () => {
    const { users, auth } = await initVendorAuth()
    const user = users.createUser({
      username: 'granted-admin',
      password: 'secret',
      role: 'admin',
      profiles: ['alice'],
      defaultProfile: 'alice',
    })!
    const token = auth.signUserJwt(user, 'platform-matrix-test-secret')
    const ctx = jwtContext(token)
    const next = vi.fn(async () => {})

    await auth.requireUserJwt(ctx, next)

    expect(next).toHaveBeenCalledOnce()
    expect(await auth.authenticateUserToken(token)).toMatchObject({
      id: user.id,
      role: 'admin',
      profiles: ['alice'],
    })
  })
})
