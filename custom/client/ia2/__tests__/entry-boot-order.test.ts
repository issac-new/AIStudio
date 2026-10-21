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

  it('术语覆盖在首次语言切换之后应用（防 switchLocale 重建词条树覆盖已合并的覆盖词条）', () => {
    const lines = src.split('\n')
    const localeAssign = lines.findIndex(l => l.includes('localeReady = import('))
    const awaitLocale = lines.findIndex(l => l.trim() === 'await localeReady')
    const apply = lines.findIndex(l => l.includes('applyIa2TermOverrides(i18n)'))
    expect(localeAssign, 'localeReady 须由启动语言切换赋值').toBeGreaterThan(-1)
    expect(awaitLocale, 'i18nInstalled 须等待 localeReady').toBeGreaterThan(-1)
    expect(apply, '术语覆盖调用须存在').toBeGreaterThan(-1)
    expect(apply, '术语覆盖早于语言切换完成 → 会被 setLocaleMessage 抹掉').toBeGreaterThan(awaitLocale)
  })

  it('isReady 与 mount 保持在链尾（router.isReady → app.mount）', () => {
    expect(isReadyLines.length).toBe(1)
    expect(mountLines.length, "app.mount('#app') 调用应恰好一处").toBe(1)
    expect(mountLines[0]).toBeGreaterThan(isReadyLines[0])
  })
})

describe('entry.mts devAutoLogin 手动登出闸门（2026-10-21 修复）', () => {
  // dev 桩自动登录若不检查 hermes_manual_logout：设置面板登出→清库→重载后 2s 内
  // 即被本桩以 admin 复活（浏览器实锤：/src/main.ts 栈迹写入 hermes_api_key），登出
  // 形同虚设。闸门契约与 LoginView C2 自动登录一致：手动登录成功即清标记。
  const lines = readFileSync(ENTRY, 'utf8').split('\n')

  it('devAutoLogin 在 fetch 登录前检查手动登出闸门', () => {
    const fnStart = lines.findIndex(l => l.includes('async function devAutoLogin'))
    expect(fnStart, 'devAutoLogin 函数须存在').toBeGreaterThan(-1)
    const fetchLine = lines.findIndex((l, i) => i > fnStart && l.includes("fetch('/api/auth/login'"))
    expect(fetchLine, 'devAutoLogin 内须有登录 fetch').toBeGreaterThan(fnStart)
    const gateLine = lines.findIndex((l, i) => i > fnStart && i < fetchLine && l.includes("sessionStorage.getItem('hermes_manual_logout')"))
    expect(gateLine, '闸门检查须在登录 fetch 之前（退出后不得自动拉回 admin）').toBeGreaterThan(fnStart)
  })
})
