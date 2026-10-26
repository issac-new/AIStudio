// element-web CSP 放行守门（真实账号验证轮实锤）：element-web 的 rust crypto
// （matrix-sdk-crypto wasm）在登录后实例化，被 studio 全局 CSP 的
// script-src（'self' 'unsafe-inline'，无 wasm 源）以 CompileError 拒绝——
// 登录 POST 200 但会话启动死锁（无 /sync）。694 号补丁给 /element-web/
// 路径的 script-src 追加 'wasm-unsafe-eval'（窄 token，dsh 网关的
// 'unsafe-eval' 先例更宽）。断言失败=补丁未注入或被升级冲掉，当场红。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { upstreamPath } from '../../../test/upstream-root'

const src = (): string => readFileSync(upstreamPath('hermes-studio/packages/server/src/modules/studio/middleware/security.ts'), 'utf8')

describe('element-web CSP wasm 放行（补丁 694 锁定）', () => {
  it('script-src 按路径分流：/element-web/ 追加 wasm-unsafe-eval，其余路径不加宽', () => {
    const s = src()
    // 路径判定存在且只作用于 element-web 前缀
    expect(s).toMatch(/const isElementWeb = ctx\.path\.startsWith\('\/element-web\/'\)/)
    // script-src 行按该判定拼接 wasm token
    expect(s).toMatch(/script-src 'self' 'unsafe-inline'\$\{isElementWeb \? " 'wasm-unsafe-eval'" : ''\}/)
  })

  it('其余 CSP 指令与默认策略保持逐字不变（只放行 wasm，不开 eval）', () => {
    const s = src()
    expect(s).not.toContain("'unsafe-eval'")
    for (const directive of [
      "default-src 'self'", "base-uri 'self'", "object-src 'none'",
      "frame-ancestors 'none'", "style-src 'self' 'unsafe-inline'",
      "form-action 'self'",
    ]) {
      expect(s).toContain(`"${directive}"`)
    }
  })
})
