# 登录页路径与诚实 404 未登录冻结环修复（run23 采集链解锁）

日期：2026-10-28 ｜ 状态：已实施 ｜ 关联：run23 起跑（RUN_ID=20261028-v8-run23）；simharness/docs/specs/2026-10-28-model-preflight-bare-provider.md（同轮另一起跑红）

## 变更

- `custom/client/ia2/routes.ts` ia2.notFound 路由记录补 `meta: { public: true }`：未登录访问未知路径时直接呈现 404 页，不再走「需登录→弹回 login→再改道」链。
- `custom/client/ia2/routes.ts` buildIaRoutes 顶部新增 `{ path: '/login', name: 'ia2.loginAlias', redirect: '/' }`：`/login` 恢复为有效 URL（直达登录页＝根路径）。

## 决策记录

- D1 根因（实测链）：应用登录页=根路径 `'/'`（上游 login 记录），不存在 `/login` 路径记录；未登录撞未知路径时，上游 catch-all→`ia2NotFoundGuard` 改道 ia2.notFound→主守卫判非 public 且无 token 弹回 `next({name:'login',redirect:...})`→login 解析回根路径→导航再次触发改道——守卫重定向环以微任务风暴饿死渲染主线程（CDP 采样栈恒落 `pushWithRedirect`；load 事件永不触发、Vue 不挂载、`#app` 只剩 boot-fallback；dev 态因模块按需加载有让出点故能侥幸收敛，prod 单 bundle 紧环必冻）。2026-10-21「诚实 404」批引入该链后无整轮推演覆盖，run23 采集链预检首次暴露。
- D2 notFound 设 public 为环的根治断点：404 页对未登录可见是 Web 通行做法；调试 bundle 就地改 meta 复测 load 事件恢复、应用可渲染（假说验证通过后才动源码）。
- D3 `/login` 别名与 D1 并用：采集链（r18-frames 先 goto /login 注入凭证）与历史深链按该习惯 URL 访问；别名直达登录页避免每次都走 404 页绕行。别名记录的 matched 非 catch-all，不与 ia2NotFoundGuard 互动（无新环面）。

## 验证

- 修复前：8802（v1.0.2 dist）headless 打 `/#/login` 与裸 `/login` 均 load 超时；CDP 断点采样见 `pushWithRedirect` 与 login⇄notFound 交替 push（`to={name:'ia2.notFound',from:'/login'}` / `to={name:'login',redirect:'/app/not-found?from=/login'}`）；DOM 仅 boot-fallback（Vue 未挂载）。
- 假说验证：调试构建（--minify false）将 notFound 就地改 public 后同 URL load OK、应用渲染（appLen≈19K）。
- 修复后（随批）：`npx vitest run custom/client/ia2` 全绿；重建 dist 供 SIM 后 r18-frames capture-precheck headless 通过；8649 dev 打开不受影响。
- 未验证项：无（登录后弹回 /app 分支沿用既有 resolveLoginRedirect 逻辑，未改动）。

## 设计文档影响

DESIGN_SYNC: none——防冻结环缺陷修复；对外行为变化仅「404 页未登录可见」与「/login 成为有效别名」，不动整合正本的路由契约与判据面。
