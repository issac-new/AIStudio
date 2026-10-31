// 补丁 715 落地守门（2026-10-31 三区回归未做项收口）：kanban WS upgrade 阶段的
// 异步失败（鉴权查询/DB 繁忙）必须显式回 503 并销毁 socket，不能留 unhandled
// rejection 让浏览器只看到「Connection closed before receiving a handshake」。
// 本测试锁注入态 vendor 源码含 try/catch + 503 + 日志；series 漂移/漏注入即红。
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SOCKET = resolve(__dirname, '../../vendor/hermes-studio/packages/server/src/modules/hermes/sockets/kanban-events.ts')

describe('补丁 715：kanban WS upgrade 失败回 503', () => {
  it('注入态 onUpgrade 含 try/catch + 503 + 日志', () => {
    expect(existsSync(SOCKET), 'vendor WS 文件在（未注入树先跑 npm run inject）').toBe(true)
    const src = readFileSync(SOCKET, 'utf8')
    const start = src.indexOf('const onUpgrade = async')
    expect(start).toBeGreaterThan(0)
    const seg = src.slice(start, start + 3200)
    expect(seg).toMatch(/try\s*\{/)
    expect(seg).toMatch(/catch\s*\(error\)/)
    expect(seg).toMatch(/503 Service Unavailable/)
    expect(seg).toContain('upgrade failed')
  })
})
