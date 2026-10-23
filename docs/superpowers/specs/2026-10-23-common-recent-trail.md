# 侧栏「常用 · 最近」访问轨迹面板

- 日期：2026-10-23
- 版本：v1（2026-10-23 首版，分支 feat/common-recent-trail）
- 需求：用户原话「增加一个"最近"功能（放在"常用"里）保留用户页面操作事项的轨迹，便于回溯」
- 交付面：overlay custom client（IaSideNav + 新 recent-trail.ts 纯逻辑核 + 新 composables/useRecentTrail.ts + nav-centers 注册表扩充），验证走 vitest（纯逻辑全覆盖 + 组件接线面）。

## 决策记录

1. **入口放常用组末位、是面板开关不是路由项**。五项常用入口（流程总览/工作台/看板/审批收件箱/检索）零改动，「最近」以 IaSideNavItem 同款行式接在其后（lead '⏱'，data-testid `ia-side-nav-recent`）：点击 toggle 轨迹面板，再点或点击面板外（文档级 mousedown，锚点行与面板内部除外）关闭。推演模式（isSimMode）下不出现——跟随常用组现行为（常用组整组不在推演模式渲染）。折叠态面板照常可用：面板绝对定位（`left: calc(100% + 8px)`）弹在锚点行右侧，即侧栏右缘之外，锚点收窄为图标列不影响。
2. **记录粒度 = fullPath（含 query）**。IaSideNav 挂载时安装 `watch(() => route.fullPath)`，阶段页 `?tab=` 切换也是一次操作（`/app/stage/design?tab=tasks` 与 `?tab=g2` 是两条记录）。初始落地页不记：「还没有访问记录」空态保持可达，首个导航事件起记（落地不算「用户页面操作」，也避免空态文案成死 UI）。推演页访问同样入轨——轨迹是用户级的，日常面板里出现推演入口可一键回推演模式，是收益不是泄露。
3. **去重与上限**：新条目置顶；同 fullPath 已存在（含栈顶）剔除旧条目后置顶并刷新 ts，不重复入栈；上限 20 条，超出丢最旧（更长的历史是噪音不是回溯窗口）。入栈/解析/标题/时间是纯函数（recent-trail.ts），composable 只持状态与持久化——同 badge-count.ts 先例，不 import `@/router`（模块级 createWebHashHistory 在 node 测试环境即炸，2026-10-18 坑同源）。
4. **localStorage 持久化**：key `swarm.recentTrail.v1`，值 JSON 数组。读写全程 try/catch：读遇脏 JSON/非数组整体丢弃（轨迹可由后续导航重建，不值得半量抢救）、字段类型不全的元素剔除；写失败（隐私模式/配额）静默降级为仅内存，不因持久化炸导航；无 localStorage 环境（node）仅内存。每次 `useRecentTrail()` 调用自 localStorage 重建（侧栏同屏只挂一份，无共享必要，跨挂载一致性由持久化保证）。
5. **页面名解析引用单一事实源，不复制字符串**。为此把常用组五项（COMMON_NAVS）、工作台兄弟路由集合（WORKBENCH_ROUTE_NAMES）、推演六签（SIM_NAVS）的静态定义自 IaSideNav.vue 迁入 nav-centers.ts，组件侧只留依赖响应式路由的 match 高亮判定——行为不变（键/路由名/文案原样搬移），侧栏渲染与轨迹标题从此共用同一份文案。解析链：推演六签 → 常用五入口（兄弟路由归「工作台」）→ 六阶段页（`?tab=` 命中 stage-tabs.ts STAGE_TABS 时拼「阶段 · 页签」，未知/缺失不拼；页签元数据的实际单一事实源是 stage-tabs.ts，stage-meta.ts 只持阶段级定义）→ 专题岛屿（ISLAND_NAVS）；全部未命中回落路由名，再回落 fullPath。标题在记录时按当时 locale 固化，切语言后旧条目不重译（重访即刷新）——尽力而为，不猜页面名。
6. **相对时间分段**：<1 分钟（含时钟偏移的未来值）「刚刚」；<1 小时「N 分钟前」；<24 小时「N 小时前」；超过 24 小时用绝对时间——落在昨天（日历日）「昨天 HH:MM」，更早「M/D HH:MM」，跨年带年份。时间显示随 useNowTick 共享 30s tick 重算，不僵死。
7. **清空交互**：面板底部「清空」按钮（`recent-clear`）清数组 + `removeItem` 清 localStorage；空态时按钮禁用。行点击 `router.push(fullPath)` 并关面板；点当前页行只关面板不导航。面板 z 层用 `--ia-z-header-panel`（与 z-layers.ts 账本成对，低于 modal 的裁定不被破坏）。

## 验证证据

- 新增守门：`custom/client/ia2/__tests__/recent-trail.test.ts` 26 用例全绿——纯逻辑核（入栈去重/置顶/上限截断/不改入参、解析容错四类脏输入、标题解析回落链含 ?tab= 与数组 query、相对时间五分段含跨年与时钟偏移）+ 组件接线面（常用组「最近」项与推演模式不出现、开关面板/点击外关闭/面板内不关、空态可达与清空禁用、?tab= 各记一次与回访去重置顶、行点击回跳含 query、清空生效、跨挂载持久化与脏数据降级、setItem 抛错不炸导航）。
- 指定回归：`npx vitest run custom/client/ia2/__tests__/recent-trail.test.ts custom/client/ia2/__tests__/flow-nav-dup-suffix.test.ts` = **2 文件 28 用例全通过**。
- 整目录零回归：`npx vitest run custom/client/ia2/__tests__/` = **102 文件 742 用例全通过**（32.7s），side-nav.test.ts / side-nav-badges.test.ts / stage-status-traffic.test.ts 等对 IaSideNav 有源文本断言的既有测试均绿。
- 测试编写中实证的两处自纠：测试文件级 `afterEach(vi.restoreAllMocks)` 会击穿 setup.ts 的 window.matchMedia 桩（后续挂载全红），已改为 spy 局部 finally 恢复；测试数据误用阶段④页签键 `board` 于阶段③（正确为 `tasks`），代码「未知页签不拼」行为正确、测试数据修正后绿。

## 残留与移交

- 「最近」开关键复用 IaSideNavItem 的 active 态表达「面板已开」，连带 `aria-current="page"`——对非路由项语义不严格准确；IaSideNavItem 尚无 aria-expanded 支持，如需严格语义应给行组件加展开态属性（改动面扩大，本轮不做）。
- 面板无键盘 Esc 关闭与焦点圈禁（规格只约定点击外关闭，未做键盘路径）。
- 标题 locale 固化见决策 5：切语言后旧条目维持原语言，重访刷新；如需全量重译可在渲染时按 routeName+fullPath 重解析（需存 query，暂不为小众场景扩 schema）。
- 浏览器 web 版（8649/临时实例）人工走查未在本轮执行——本批为纯前端交互，自动化已覆盖接线面；合入后走查时重点看折叠态面板弹出位置与窄屏（≤720px 硬紧凑）下的可用性。
