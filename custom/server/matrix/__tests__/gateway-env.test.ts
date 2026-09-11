// R1 升级 — gateway dotenv 凭据源（~/.hermes/profiles/<profile>/.env）单测。
// 覆盖：最小 dotenv 解析（export 前缀/单双引号/注释/空行/无 = 行/空键）/
// profile 解析（LOOP_MATRIX_PROFILE → active_profile 文件 → orchestrator）/
// 文件路径拼装（HERMES_HOME 覆盖）/ readGatewayMatrixEnv 五件套读取与缺字段兜底。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import { parseDotenv, hermesHomePath, gatewayEnvFilePath, resolveGatewayProfile, readGatewayMatrixEnv } from '../gateway-env'

let hermesHome: string
let env: Record<string, string | undefined>

beforeEach(() => {
  hermesHome = mkdtempSync(join(tmpdir(), 'gw-env-test-'))
  env = { ...process.env, HERMES_HOME: hermesHome }
})

afterEach(() => {
  rmSync(hermesHome, { recursive: true, force: true })
})

const writeProfileEnv = (content: string, profile = 'orchestrator'): string => {
  const dir = join(hermesHome, 'profiles', profile)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, '.env')
  writeFileSync(file, content)
  return file
}

describe('parseDotenv 最小解析', () => {
  it('plain KEY=VALUE 与键前后空格', () => {
    expect(parseDotenv('A=1\n  B = 2 \n')).toEqual({ A: '1', B: '2' })
  })

  it('export 前缀剥离', () => {
    expect(parseDotenv('export A=1\nexport  B=2')).toEqual({ A: '1', B: '2' })
  })

  it('单引号与双引号值去引号', () => {
    expect(parseDotenv('A="x y"\nB=\'z w\'\nC=""\n')).toEqual({ A: 'x y', B: 'z w', C: '' })
  })

  it('跳过注释与空行', () => {
    expect(parseDotenv('# comment\n\nA=1\n   # indented comment\n')).toEqual({ A: '1' })
  })

  it('值内含 = 号按首个 = 分割', () => {
    expect(parseDotenv('URL=http://x?a=b=c')).toEqual({ URL: 'http://x?a=b=c' })
  })

  it('无 = 行与空键行跳过（不抛错）', () => {
    expect(parseDotenv('JUSTTEXT\n=novalue\nA=1')).toEqual({ A: '1' })
  })
})

describe('profile / 路径解析', () => {
  it('LOOP_MATRIX_PROFILE 显式覆盖优先', () => {
    env.LOOP_MATRIX_PROFILE = 'ops-sre'
    expect(resolveGatewayProfile(env)).toBe('ops-sre')
  })

  it('无覆盖时读 active_profile 文件内容（trim）', () => {
    writeFileSync(join(hermesHome, 'active_profile'), 'orchestrator\n')
    expect(resolveGatewayProfile(env)).toBe('orchestrator')
  })

  it('active_profile 缺失回退 orchestrator；hermesHome 缺省 ~/.hermes', () => {
    expect(resolveGatewayProfile(env)).toBe('orchestrator')
    expect(hermesHomePath({})).toBe(join(homedir(), '.hermes'))
    expect(gatewayEnvFilePath(env)).toBe(join(hermesHome, 'profiles', 'orchestrator', '.env'))
  })
})

describe('readGatewayMatrixEnv', () => {
  it('读出五件套（值去引号）', () => {
    writeProfileEnv([
      'MATRIX_HOMESERVER="http://localhost:8008"',
      'MATRIX_ACCESS_TOKEN=syt_gw',
      'MATRIX_USER_ID=@gateway:matrix.test',
      'MATRIX_HOME_ROOM="!home:matrix.test"',
      'MATRIX_HOME_ROOM_THREAD_ID=$abc',
      'UNRELATED=1',
    ].join('\n'))
    const gw = readGatewayMatrixEnv(env)
    expect(gw).toEqual({
      homeserverUrl: 'http://localhost:8008',
      accessToken: 'syt_gw',
      userId: '@gateway:matrix.test',
      homeRoom: '!home:matrix.test',
      homeRoomThreadId: '$abc',
    })
  })

  it('文件缺失 → null', () => {
    expect(readGatewayMatrixEnv(env)).toBeNull()
  })

  it('三必填缺一 → null（缺 homeRoom 不影响，homeRoom 可选）', () => {
    writeProfileEnv('MATRIX_HOMESERVER=http://x\nMATRIX_ACCESS_TOKEN=t\n')
    expect(readGatewayMatrixEnv(env)).toBeNull()
    writeProfileEnv('MATRIX_HOMESERVER=http://x\nMATRIX_ACCESS_TOKEN=t\nMATRIX_USER_ID=@u:x\n')
    expect(readGatewayMatrixEnv(env)).toEqual({
      homeserverUrl: 'http://x', accessToken: 't', userId: '@u:x',
      homeRoom: undefined, homeRoomThreadId: undefined,
    })
  })
})
