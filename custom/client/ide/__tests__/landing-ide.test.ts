// overlay/custom/client/ide/__tests__/landing-ide.test.ts
// 守门：登录默认落点三处（patch 276 守卫两处 + patch 277 LoginView 一处）
// 必须指向 /ide——2026-09-16 用户裁决：IDE 工作台为操作主页面。
//
// 背景：274/275 曾把三处落点定为 /hermes/cockpit（同日用户改判为 /ide）。
// 断言对象是注入态上游文件，patch 丢失/漂移时当场 fail。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const UPSTREAM_CLIENT = '../../../../../upstream/hermes-studio/packages/client/src'

function readUpstream(rel: string): string {
  return readFileSync(resolve(__dirname, `${UPSTREAM_CLIENT}/${rel}`), 'utf8')
}

describe('登录落点 → /ide（patch 276/277 守门）', () => {
  const router = readUpstream('router/index.ts')
  const loginView = readUpstream('views/LoginView.vue')

  it('守卫：已持 key 访问登录页跳过重定向 → /ide', () => {
    expect(router).toContain(`next(resolved === '/hermes/chat' ? '/ide' : resolved)`)
  })

  it('守卫：非 superadmin 访问受限页兜底 → /ide', () => {
    expect(router).toContain(`next('/ide')`)
  })

  it('LoginView 表单登录落点 → /ide', () => {
    expect(loginView).toContain(`return resolved === '/hermes/chat' ? '/ide' : resolved;`)
  })

  it('旧 cockpit 落点字面量已全部退位（274/275 产出不再残留在落点表达式里）', () => {
    // 落点表达式不再指向 cockpit；cockpit 路由本身仍在（平行共存），故只查三处表达式形态
    expect(router).not.toContain(`? '/hermes/cockpit' : resolved)`)
    expect(router).not.toContain(`next('/hermes/cockpit')`)
    expect(loginView).not.toContain(`? '/hermes/cockpit' : resolved;`)
  })
})
