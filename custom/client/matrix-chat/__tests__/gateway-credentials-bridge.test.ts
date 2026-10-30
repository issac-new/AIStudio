// matrix-client 凭据桥接守门（run23 复盘根治件）：
// 登录路径「matrix-login 换 JWT 直写 api_key」不写 matrix 四件套 → 依赖
// matrix-js-sdk 的面板（delivery-cases 等）恒空态。initClient 兜底须在凭据
// 缺失时尝试 /api/matrix/gateway-credentials 桥接并持久化；桥接失败保持
// 原错误口径。本文件断言桥接函数的存在与行为契约（源层守门，import 级）。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(
  resolve(__dirname, '../stores/matrix-client.ts'), 'utf8')

describe('凭据桥接（gateway-credentials fallback）', () => {
  it('initClient 凭据缺失时先桥接再报错（顺序契约：bridge 在 error 赋值之前）', () => {
    const bridgeIdx = SRC.indexOf('bridgeCredentialsFromGateway()')
    const errIdx = SRC.indexOf("'No Matrix credentials found'")
    expect(bridgeIdx).toBeGreaterThan(0)
    expect(errIdx).toBeGreaterThan(0)
    expect(bridgeIdx).toBeLessThan(errIdx)
  })

  it('桥接成功后持久化四件套（storeMatrixCredentials 调用在 initClient 内）', () => {
    // initClient 函数体内的 storeMatrixCredentials（登录函数里也有一个，
    // 取 initClient 段做区间断言）
    const initStart = SRC.indexOf('async function initClient()')
    const initEnd = SRC.indexOf('function disconnect', initStart)
    const seg = SRC.slice(initStart, initEnd)
    expect(seg).toContain('bridgeCredentialsFromGateway()')
    expect(seg).toContain('storeMatrixCredentials(creds)')
  })

  it('桥接实现校验四字段齐全且失败返回 null（不吞错成假凭据）', () => {
    const fn = SRC.slice(SRC.indexOf('async function bridgeCredentialsFromGateway'),
      SRC.indexOf('export const useMatrixClientStore'))
    expect(fn).toContain('!res.ok')                       // 非 200 → null
    expect(fn).toContain('g?.configured')                 // configured 门
    expect(fn).toContain('!g.accessToken || !g.userId || !g.homeserverUrl') // 字段齐全门
    expect(fn).toMatch(/catch[\s\S]*return null/)         // 网络失败 → null
  })
})
