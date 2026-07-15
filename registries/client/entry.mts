// overlay/registries/client/entry.mts
// A 类入口 shim:复制上游 main.ts 的启动序列,在 app.use(router) 与 app.mount 之间
// 插入 A 类注册(组件/store/路由/导航/i18n 增量)。上游 main.ts 保持原样、零改动。
//
// 忠实复制自 upstream/hermes-studio/packages/client/src/main.ts (v0.6.18)。
// 上游 main.ts 升级时(新增 use 调用、改 FOUC/token 逻辑),本 shim 需同步——
// 这是 spec §3.3/§7 记录的"入口结构升级冲突点"。
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from '../../../upstream/hermes-studio/packages/client/src/router'
import { i18nReady } from '../../../upstream/hermes-studio/packages/client/src/i18n'
import App from '../../../upstream/hermes-studio/packages/client/src/App.vue'
import '../../../upstream/hermes-studio/packages/client/src/styles/global.scss'
import 'katex/dist/katex.min.css'

// === 上游 main.ts 的 FOUC / token 处理(原样复制,勿改)===
const savedBrightness = localStorage.getItem('hermes_brightness') || 'system'
const savedStyle = localStorage.getItem('hermes_style') || 'ink'

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
const isDark = savedBrightness === 'dark' || (savedBrightness === 'system' && prefersDark)

const isComic = savedStyle === 'comic'
const isDesktopShell =
  (window as typeof window & { hermesDesktop?: { isDesktop?: boolean } }).hermesDesktop?.isDesktop === true

if (isDark) document.documentElement.classList.add('dark')
if (isComic) document.documentElement.classList.add('comic')
if (isDesktopShell) document.documentElement.classList.add('hermes-desktop-shell')

const urlParams = new URLSearchParams(window.location.search)
const hashQuery = window.location.hash.split('?')[1]
const urlToken = urlParams.get('token') || (hashQuery ? new URLSearchParams(hashQuery).get('token') : null)
if (urlToken) {
  ;(window as any).__LOGIN_TOKEN__ = urlToken
}

// === 启动 app(上游序列)===
const app = createApp(App)
app.use(createPinia())
app.use(router)

// === A 类注册(mount 前插入)===
// 对应原 custom/index.ts 的 registerCustomFeatures,改为从 overlay/custom 注册。
// v0.6.30+: i18n 改为异步创建(i18nReady 返回 Promise),需 await 后再 use。
// 不用顶层 await(es2020 target 不支持),改用 .then 链式,保证 bootstrap 在 mount 前完成。
i18nReady
  .then((i18n) => {
    app.use(i18n)
  })
  .then(() => import('./bootstrap'))
  .then(({ bootstrapClient }) => bootstrapClient(app))
  .then(() => router.isReady())
  .then(() => {
    // 动态路由(cockpit 子路由如 matrix-chat)在 bootstrap 中 addRoute,
    // 但 router.isReady() 时初始导航可能已完成且未命中这些动态路由。
    // 若当前路由未匹配(警告 "No match found"),重导航一次让新路由生效。
    const current = router.currentRoute.value
    if (current.matched.length === 0) {
      return router.replace(current.fullPath)
    }
  })
  .finally(() => {
    app.mount('#app')
  })
