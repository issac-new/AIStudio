// overlay/custom/server/matrix/__tests__/server-info.test.ts
// server-info 单一事实源守门（spec 2026-10-20-matrix-server-info-single-source）：
// 解析顺序=显式 env > gateway dotenv > 本部署兜底，任何一级缺失安静回落不抛错。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getMatrixServerInfo, domainOfMxid, FALLBACK_MATRIX_SERVER_INFO } from '../server-info'

let home = ''
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'server-info-')) })
afterEach(() => { rmSync(home, { recursive: true, force: true }) })

function writeDotenv(text: string): void {
  mkdirSync(join(home, 'profiles', 'orchestrator'), { recursive: true })
  writeFileSync(join(home, 'profiles', 'orchestrator', '.env'), text)
}

describe('getMatrixServerInfo 解析顺序', () => {
  it('显式 env 三件套全赢（含去尾斜杠）', () => {
    writeDotenv('MATRIX_HOMESERVER=http://dotenv:8008\nMATRIX_USER_ID=@u:dotenv.test\n')
    const info = getMatrixServerInfo({
      HERMES_HOME: home,
      MATRIX_HOMESERVER_URL: 'https://hs.example.com/',
      MATRIX_SERVER_NAME: 'example.org',
      ELEMENT_WEB_URL: 'https://chat.example.com/',
    })
    expect(info).toEqual({
      homeserverUrl: 'https://hs.example.com',
      serverName: 'example.org',
      elementWebUrl: 'https://chat.example.com/',
    })
  })

  it('无显式 env 时回落 gateway dotenv：homeserver 取 MATRIX_HOMESERVER，域名取 USER_ID 域段', () => {
    writeDotenv('MATRIX_HOMESERVER=http://10.0.0.8:8008\nMATRIX_USER_ID=@leader:corp.internal\nMATRIX_ACCESS_TOKEN=t\n')
    const info = getMatrixServerInfo({ HERMES_HOME: home })
    expect(info.homeserverUrl).toBe('http://10.0.0.8:8008')
    expect(info.serverName).toBe('corp.internal')
    expect(info.elementWebUrl).toBe('/element-web/')
  })

  it('dotenv 缺失 → 全兜底（127.0.0.1:8008 / matrix.test / /element-web/）', () => {
    const info = getMatrixServerInfo({ HERMES_HOME: home })
    expect(info).toEqual(FALLBACK_MATRIX_SERVER_INFO)
  })

  it('dotenv 键为空串 → 视为缺失落兜底', () => {
    writeDotenv('MATRIX_HOMESERVER=\nMATRIX_USER_ID=\n')
    const info = getMatrixServerInfo({ HERMES_HOME: home })
    expect(info).toEqual(FALLBACK_MATRIX_SERVER_INFO)
  })

  it('dotenv 的 homeserver 尾斜杠同样去掉', () => {
    writeDotenv('MATRIX_HOMESERVER=http://127.0.0.1:8008/\nMATRIX_USER_ID=@a:matrix.test\n')
    const info = getMatrixServerInfo({ HERMES_HOME: home })
    expect(info.homeserverUrl).toBe('http://127.0.0.1:8008')
  })
})

describe('domainOfMxid', () => {
  it('标准 mxid 取域段', () => {
    expect(domainOfMxid('@alice:matrix.test')).toBe('matrix.test')
    expect(domainOfMxid('@a:b.c:8448')).toBe('b.c:8448')
  })
  it('非法输入返回空串', () => {
    expect(domainOfMxid('')).toBe('')
    expect(domainOfMxid('alice')).toBe('')
    expect(domainOfMxid('@alice')).toBe('')
  })
})

describe('routes.ts 端点注册守门', () => {
  it('matrix router 注册了 GET /server-info 且无凭据字段', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname } = await import('node:path')
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'routes.ts'), 'utf-8')
    expect(src).toContain("router.get('/server-info'")
    expect(src).toContain('getMatrixServerInfo')
    // 端点不返回凭据（access_token 只允许出现在 gateway-credentials 段）
    const endpointBlock = src.slice(src.indexOf("router.get('/server-info'"))
    expect(endpointBlock).not.toContain('accessToken')
  })
})
