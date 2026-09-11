// R1 — Matrix 登录会话本机落盘（~/.hermes-web-ui/matrix-session.json）单测。
// 覆盖：读写往返 / 文件 0600 与目录 0700（已存在宽松文件归一）/ 临时文件原子写 /
// 畸形 JSON 与缺字段兜底 null / 配置目录解析（上游 getWebUiHome 同款 env 覆盖顺序）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, statSync, existsSync, readdirSync,
  chmodSync,
} from 'fs'
import { tmpdir } from 'os'
import { homedir } from 'os'
import { join } from 'path'
import {
  loadMatrixSession,
  saveMatrixSession,
  matrixSessionFilePath,
  resolveAppHome,
  type MatrixSessionInput,
} from '../session-store'

let home: string
let env: Record<string, string | undefined>

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'mx-session-test-'))
  env = { ...process.env, HERMES_WEB_UI_HOME: home }
})

afterEach(() => {
  // 归一权限再删（0500 目录用例后 rmdir 需要写权限）
  try { chmodSync(home, 0o700) } catch { /* 已删 */ }
  rmSync(home, { recursive: true, force: true })
})

const session = (): MatrixSessionInput => ({
  homeserverUrl: 'http://localhost:8008',
  userId: '@swarm:matrix.test',
  accessToken: 'syt_probe_token',
  deviceId: 'DEVDEVICE1',
})

describe('matrixSessionFilePath / resolveAppHome', () => {
  it('HERMES_WEB_UI_HOME 优先（与上游 getWebUiHome 同序）', () => {
    env.HERMES_WEBUI_STATE_DIR = '/other/state'
    expect(resolveAppHome(env)).toBe(home)
    expect(matrixSessionFilePath(env)).toBe(join(home, 'matrix-session.json'))
  })

  it('无一级覆盖时回退 HERMES_WEBUI_STATE_DIR，缺省 homedir()/.hermes-web-ui', () => {
    expect(resolveAppHome({ HERMES_WEBUI_STATE_DIR: '/other/state' })).toBe('/other/state')
    expect(resolveAppHome({})).toBe(join(homedir(), '.hermes-web-ui'))
    expect(matrixSessionFilePath({})).toBe(join(homedir(), '.hermes-web-ui', 'matrix-session.json'))
  })
})

describe('saveMatrixSession / loadMatrixSession 往返', () => {
  it('保存后读取字段完整往返，updatedAt 为 ISO 时间', () => {
    saveMatrixSession(session(), env)
    const loaded = loadMatrixSession(env)
    expect(loaded).not.toBeNull()
    expect(loaded!.homeserverUrl).toBe('http://localhost:8008')
    expect(loaded!.userId).toBe('@swarm:matrix.test')
    expect(loaded!.accessToken).toBe('syt_probe_token')
    expect(loaded!.deviceId).toBe('DEVDEVICE1')
    expect(Number.isNaN(Date.parse(loaded!.updatedAt))).toBe(false)
  })

  it('deviceId 缺省可省略，round-trip 不报错', () => {
    const s = session()
    delete (s as { deviceId?: string }).deviceId
    saveMatrixSession(s, env)
    const loaded = loadMatrixSession(env)
    expect(loaded!.deviceId).toBeUndefined()
  })

  it('重复保存覆盖旧值（重登录刷新 token）', () => {
    saveMatrixSession(session(), env)
    saveMatrixSession({ ...session(), accessToken: 'syt_rotated' }, env)
    expect(loadMatrixSession(env)!.accessToken).toBe('syt_rotated')
  })
})

describe('权限模型（目录 0700 / 文件 0600，已存在宽松文件归一）', () => {
  it('目录不存在时自动创建且权限 0700，文件权限 0600', () => {
    const nested = join(home, 'hermes-web-ui-nested')
    env = { ...env, HERMES_WEB_UI_HOME: nested }
    saveMatrixSession(session(), env)
    expect(statSync(nested).mode & 0o777).toBe(0o700)
    expect(statSync(join(nested, 'matrix-session.json')).mode & 0o777).toBe(0o600)
  })

  it('已存在的宽松权限文件在再次保存时归一为 0600', () => {
    saveMatrixSession(session(), env)
    const file = matrixSessionFilePath(env)
    chmodSync(file, 0o644)
    expect(statSync(file).mode & 0o777).toBe(0o644)
    saveMatrixSession({ ...session(), accessToken: 'syt_rotated' }, env)
    expect(statSync(file).mode & 0o777).toBe(0o600)
  })
})

describe('原子写（临时文件 + rename）', () => {
  it('保存完成后目录内无临时文件残留', () => {
    saveMatrixSession(session(), env)
    saveMatrixSession({ ...session(), accessToken: 'syt_second' }, env)
    const leftovers = readdirSync(home).filter(f => f !== 'matrix-session.json')
    expect(leftovers).toEqual([])
    expect(loadMatrixSession(env)!.accessToken).toBe('syt_second')
  })

  it('目标被同名目录占位时保存失败，且不留临时文件残渣', () => {
    saveMatrixSession(session(), env)
    const file = matrixSessionFilePath(env)
    rmSync(file)
    mkdirSync(file) // 同名目录占位 → rename 失败
    expect(() => saveMatrixSession({ ...session(), accessToken: 'syt_x' }, env)).toThrow()
    // 失败路径不破坏占位目标，也不残留 .tmp-*（rename 前失败被清理）
    expect(statSync(file).isDirectory()).toBe(true)
    expect(readdirSync(home).filter(f => f.includes('.tmp-'))).toEqual([])
  })
})

describe('loadMatrixSession 畸形兜底', () => {
  const expectNull = (): void => {
    expect(loadMatrixSession(env)).toBeNull()
  }

  it('文件不存在 → null', expectNull)

  it('JSON 解析失败 → null', () => {
    mkdirSync(home, { recursive: true })
    writeFileSync(matrixSessionFilePath(env), '{not-json')
    expectNull()
  })

  it('缺必填字段（accessToken 空）→ null', () => {
    saveMatrixSession({ ...session(), accessToken: '' }, env)
    // 空 token 的文件不该被 save 产出合法读回——直接手写一个缺字段文件验证读侧
    writeFileSync(matrixSessionFilePath(env), JSON.stringify({ homeserverUrl: 'http://x', userId: '@u:x' }))
    expectNull()
  })

  it('非对象 JSON（数组/标量）→ null', () => {
    mkdirSync(home, { recursive: true })
    writeFileSync(matrixSessionFilePath(env), '["homeserver"]')
    expectNull()
    writeFileSync(matrixSessionFilePath(env), '"a-string"')
    expectNull()
  })

  it('字段类型错误（accessToken 非字符串）→ null', () => {
    mkdirSync(home, { recursive: true })
    writeFileSync(matrixSessionFilePath(env), JSON.stringify({ homeserverUrl: 'h', userId: 'u', accessToken: 42 }))
    expectNull()
  })

  it('畸形文件不影响后续 save 自愈', () => {
    mkdirSync(home, { recursive: true })
    writeFileSync(matrixSessionFilePath(env), 'garbage')
    saveMatrixSession(session(), env)
    expect(loadMatrixSession(env)!.userId).toBe('@swarm:matrix.test')
  })
})

describe('extra 字段容忍与空 home 目录惰性', () => {
  it('load 不创建目录/文件（只读语义）', () => {
    loadMatrixSession(env)
    expect(existsSync(home)).toBe(true) // mkdtemp 已建；内容应保持为空
    expect(readdirSync(home)).toEqual([])
  })
})
