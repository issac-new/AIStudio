// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { normalizeHomeserverUrl, homeserverUrlEquals } from '../utils/server-url'

describe('homeserver 地址等价判定（存量凭据 × server-info 单源对账）', () => {
  it('尾斜杠差异视为同一地址', () => {
    expect(homeserverUrlEquals('http://127.0.0.1:8008/', 'http://127.0.0.1:8008')).toBe(true)
  })

  it('localhost 与 127.0.0.1 互为等价（本地部署混写不误报）', () => {
    expect(homeserverUrlEquals('http://localhost:8008', 'http://127.0.0.1:8008')).toBe(true)
    expect(normalizeHomeserverUrl('http://localhost:8008/')).toBe('http://127.0.0.1:8008')
  })

  it('主机或端口变更判不等（触发迁移横幅）', () => {
    expect(homeserverUrlEquals('http://127.0.0.1:8008', 'http://192.168.1.10:8008')).toBe(false)
    expect(homeserverUrlEquals('http://127.0.0.1:8008', 'http://127.0.0.1:8448')).toBe(false)
  })

  it('https 与 http 不视为等价', () => {
    expect(homeserverUrlEquals('http://127.0.0.1:8008', 'https://127.0.0.1:8008')).toBe(false)
  })
})
