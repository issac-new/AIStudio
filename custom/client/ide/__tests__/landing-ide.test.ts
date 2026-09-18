// overlay/custom/client/ide/__tests__/landing-ide.test.ts
// 守门：登录默认落点三处（patch 276 守卫两处 + patch 277 LoginView 一处，
// 297/298 改判）必须指向 /app——2026-09-18 统一导航裁决：登录默认落驾驶舱总览。
//
// 演进：274/275 定 /hermes/cockpit → 同日改判 /ide → 297/298 统一导航改判 /app。
// 断言对象是注入态上游文件，patch 丢失/漂移时当场 fail。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const UPSTREAM_CLIENT = '../../../../../upstream/hermes-studio/packages/client/src'

function readUpstream(rel: string): string {
  return readFileSync(resolve(__dirname, `${UPSTREAM_CLIENT}/${rel}`), 'utf8')
}

describe('登录落点 → /app（patch 276/277+297/298 守门）', () => {
  const router = readUpstream('router/index.ts')
  const loginView = readUpstream('views/LoginView.vue')

  it('守卫：已持 key 访问登录页跳过重定向 → /app', () => {
    expect(router).toContain(`next(resolved === '/hermes/chat' ? '/app' : resolved)`)
  })

  it('守卫：非 superadmin 访问受限页兜底 → /app', () => {
    expect(router).toContain(`next('/app')`)
  })

  it('LoginView 表单登录落点 → /app', () => {
    expect(loginView).toContain(`return resolved === "/hermes/chat" ? "/app" : resolved;`)
  })

  it('历史落点字面量已全部退位（cockpit/ide 不再作登录落点）', () => {
    expect(router).not.toContain(`? '/hermes/cockpit' : resolved)`)
    expect(router).not.toContain(`next('/hermes/cockpit')`)
    expect(router).not.toContain(`? '/ide' : resolved)`)
    expect(router).not.toContain(`next('/ide')`)
    expect(loginView).not.toContain(`? "/ide" : resolved;`)
  })
})
