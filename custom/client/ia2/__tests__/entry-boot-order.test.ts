// overlay/custom/client/ia2/__tests__/entry-boot-order.test.ts
// 冷启动装载时序守门（2026-09-18 驾驶舱黑屏回归）：entry shim 中 app.use(router)
// 必须发生在 bootstrapClient（registerIa2 的全部 addRoute）之后。若 router 提前
// 安装，桌面壳落点 #/app 的初导航在 /app 注册前只能命中 patch 297 的 catch-all
// （redirect: '/app'）→ 自环 → 生产构建栈溢出，app.mount 永不执行（永久 logo 页）。
// 本测试读 entry.mts 源码钉死顺序；router 表与 catch-all 本体由 unified-nav-guard 钉。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// 自本文件 4 级到 overlay 根（custom/client/ia2/__tests__）
const ENTRY = resolve(__dirname, '../../../../registries/client/entry.mts')

/** 行级精确匹配调用语句（trim 后整行相等），排除注释里的字样污染 */
function callLines(src: string, stmt: string): number[] {
  return src
    .split('\n')
    .map((line, i) => ({ line: line.trim(), i }))
    .filter(({ line }) => line === stmt)
    .map(({ i }) => i)
}

describe('entry.mts 冷启动装载时序', () => {
  const src = readFileSync(ENTRY, 'utf8')
  const useRouterLines = callLines(src, 'app.use(router)')
  const bootstrapLines = callLines(src, ".then(({ bootstrapClient }) => bootstrapClient(app))")
  const piniaLines = callLines(src, 'app.use(createPinia())')
  const isReadyLines = callLines(src, '.then(() => router.isReady())')
  const mountLines = callLines(src, "app.mount('#app')")

  it('app.use(router) 恰好一次，且在 bootstrapClient(app) 之后（防初导航 catch-all 自环）', () => {
    expect(useRouterLines.length, 'app.use(router) 调用应恰好一处').toBe(1)
    expect(bootstrapLines.length, 'bootstrapClient(app) 调用应恰好一处').toBe(1)
    expect(
      useRouterLines[0],
      'router 安装早于 bootstrap：/app 初导航会命中 catch-all 自环（见 entry.mts 内注释）',
    ).toBeGreaterThan(bootstrapLines[0])
  })

  it('createPinia 先于 router 安装（router 守卫依赖 store）', () => {
    expect(piniaLines.length).toBe(1)
    expect(useRouterLines[0]).toBeGreaterThan(piniaLines[0])
  })

  it('isReady 与 mount 保持在链尾（router.isReady → app.mount）', () => {
    expect(isReadyLines.length).toBe(1)
    expect(mountLines.length, "app.mount('#app') 调用应恰好一处").toBe(1)
    expect(mountLines[0]).toBeGreaterThan(isReadyLines[0])
  })
})
