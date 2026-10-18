// Cua 会话闸门守门：fail-closed 默认、显式开启放行、写原子、能力探测、REST 形状。
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const storeDir = mkdtempSync(join(tmpdir(), 'ide-cua-'))
process.env.IDE_CUA_POLICY_FILE = join(storeDir, 'ide-cua.json')

const policy = await import('../policy')
const { setBrokerTransport } = policy as typeof import('../policy')
const { isSessionCuaEnabled, setSessionCua, cuaEnvForSession, cuaAvailability, CUA_DISABLE_ENV } = policy as typeof import('../policy')

describe('cua policy（fail-closed 默认）', () => {
  beforeEach(() => {
    writeFileSync(process.env.IDE_CUA_POLICY_FILE!, JSON.stringify({ version: 1, sessions: {} }))
  })

  it('未开启/未知会话/空 id → 注入 ZCODE_CUA_DISABLE=1', () => {
    expect(cuaEnvForSession('s1')).toEqual({ [CUA_DISABLE_ENV]: '1' })
    expect(cuaEnvForSession(null)).toEqual({ [CUA_DISABLE_ENV]: '1' })
    expect(cuaEnvForSession('')).toEqual({ [CUA_DISABLE_ENV]: '1' })
    expect(isSessionCuaEnabled('s1')).toBe(false)
  })

  it('开启但无 broker 凭据 → 仍 fail-closed；配对后注入 socket+authority；关闭回落', () => {
    expect(setSessionCua('s1', true)).toBe(true)
    expect(cuaEnvForSession('s1')).toEqual({ [CUA_DISABLE_ENV]: '1' })
    setBrokerTransport({ socket: '/tmp/cua.sock', authority: 'node-backend' })
    expect(cuaEnvForSession('s1')).toEqual({
      ZCODE_CUA_PERMISSION_BROKER_SOCKET: '/tmp/cua.sock',
      ZCODE_CUA_PLUGIN_AUTHORITY: 'node-backend',
    })
    expect(setSessionCua('s1', false)).toBe(false)
    expect(cuaEnvForSession('s1')).toEqual({ [CUA_DISABLE_ENV]: '1' })
    setBrokerTransport(null)
  })

  it('损坏/缺文件策略按空策略处理（fail-closed 不炸）', () => {
    writeFileSync(process.env.IDE_CUA_POLICY_FILE!, '{broken')
    expect(isSessionCuaEnabled('s1')).toBe(false)
    expect(cuaEnvForSession('s1')).toEqual({ [CUA_DISABLE_ENV]: '1' })
  })

  it('只认 true 值与合法键；其它值忽略', () => {
    writeFileSync(process.env.IDE_CUA_POLICY_FILE!, JSON.stringify({ version: 1, sessions: { s1: true, s2: false, '': true, s3: 'yes' } }))
    expect(isSessionCuaEnabled('s1')).toBe(true)
    expect(isSessionCuaEnabled('s2')).toBe(false)
    expect(isSessionCuaEnabled('s3')).toBe(false)
    expect(isSessionCuaEnabled('')).toBe(false)
  })

  it('空 id 拒写（仍 fail-closed）', () => {
    expect(setSessionCua('  ', true)).toBe(false)
    expect(isSessionCuaEnabled('')).toBe(false)
  })

  it('cuaAvailability：有版本目录 → available+版本；无 → false', () => {
    const base = join(storeDir, 'zcode-home')
    const cache = join(base, 'cli', 'plugins', 'cache', 'zcode-plugins-official', 'computer-use')
    mkdirSync(join(cache, '0.6.4'), { recursive: true })
    mkdirSync(join(cache, '0.6.5'), { recursive: true })
    const before = process.env.ZCODE_DATA_BASE_DIR
    process.env.ZCODE_DATA_BASE_DIR = base
    try {
      expect(cuaAvailability()).toEqual({ available: true, seededAt: '0.6.5' })
      process.env.ZCODE_DATA_BASE_DIR = join(storeDir, 'empty-home')
      expect(cuaAvailability()).toEqual({ available: false, seededAt: null })
    } finally {
      if (before === undefined) delete process.env.ZCODE_DATA_BASE_DIR
      else process.env.ZCODE_DATA_BASE_DIR = before
    }
  })
})
