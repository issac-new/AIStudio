// element-web 悬挂面 fail-soft 守门（九点对账轮 P1-4，spec=
// docs/superpowers/specs/2026-10-26-nine-point-reconciliation.md）。
// vendor 中间件无独立单测面（嵌在 bootstrap() 内），按仓先例「上游组件用静态源码
// 断言锁定」（2026-10-23 provider-prompt 轮同法）：断言注入态 http.ts 的门序与
// 503 载荷。断言失败=补丁 691 未注入或被上游升级冲掉，必须当场红。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 路径基点=checkout 根（4 级回溯）再进 vendor/hermes-studio（单仓整合起 inject 目标）
const HTTP_TS = resolve(__dirname, '../../../../vendor/hermes-studio/packages/server/src/bootstrap/http.ts')

const src = (): string => readFileSync(HTTP_TS, 'utf-8')

describe('element-web fail-soft（补丁 691 锁定）', () => {
  it('静态分支前有目录在位判定（existsSync）', () => {
    const s = src()
    expect(s).toContain('const elementWebAvailable = existsSync(elementWebDir)')
    expect(s).toMatch(/import \{[^}]*existsSync[^}]*\} from 'fs'/)
  })

  it('目录缺席时静态请求 503 available:false，且先于 send 静态回退', () => {
    const s = src()
    const gate = s.indexOf('if (!elementWebAvailable)')
    const sendIdx = s.indexOf('await send(ctx, relativePath')
    expect(gate).toBeGreaterThan(-1)
    expect(sendIdx).toBeGreaterThan(gate)
    expect(s).toContain('ctx.status = 503')
    expect(s).toContain('available: false')
  })

  it('ELEMENT_WEB_DIR 显式覆盖同时作用于静态目录与可用性判定', () => {
    const s = src()
    expect(s).toContain('process.env.ELEMENT_WEB_DIR?.trim()')
    expect(s).toContain('const elementWebAvailable = existsSync(elementWebDir)')
  })

  it('config.json 动态端点仍在静态分支之前（补丁 667 序不被 691 打乱）', () => {
    const s = src()
    const cfg = s.indexOf("ctx.path === '/element-web/config.json'")
    const stat = s.indexOf("ctx.path.startsWith('/element-web/')")
    expect(cfg).toBeGreaterThan(-1)
    expect(stat).toBeGreaterThan(cfg)
  })
})
