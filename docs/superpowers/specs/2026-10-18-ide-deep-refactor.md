# IDE 工作区深度重构 — 变更说明与决策

## 背景

2026-10-18 全量回归发现 13 项缺陷，归并为四类结构性债：启动/选择状态分散、工作区根多源、页签各自拉取与轮询、安全加固与文件访问路径不一致。用户批准方案 A（P0 整改 → P1 优化 → P2 整合 → P3 门禁）。

并行会话已合入「Ycode 工作区与 kanban 任务 workspace 关联」（`ead84b77`）：服务端 `GET /api/ide/task-workspace`（patch 658）、`ide.taskWorkspace`、任务根自动切换、任务会话跟随、简报任务工作区/任务会话两新块。本方案在其上收口，不重复实现。

## 范围

- P0：`useIdeBoot` 启动编排、`useIdeWorkspace` 根单一事实源（以 `ide.taskWorkspace` 为任务层输入）、`useIdeTask` 任务读模型、`ideErrors`/`useIdeResource`、媒体鉴权、E2E 冒烟。
- P1：页签懒加载、轮询生命周期、存储快照缓存、大会话性能基线、状态栏窄屏。
- P2：状态所有权整合、i18n 单一事实源、自检注册表/CLI、体验一致性。
- P3：tab mount matrix、契约测试、补丁守卫、打包预算、合并脚本与回归清单。

## 行为定义

1. **启动**：`useIdeBoot.resolveSessionQuery` 负责「未装载先 load → switchSession」；`IdeChatPane` 只在 `resolveBootSession` 未命中时 `ensureSession`。裸落地仍由引导页决定是否进入会话。
2. **工作区根**：`useIdeWorkspace.root` 优先级为「materialized 任务根 → 活动会话 workspace → ide.workspace」。根变化时写入 `filesStore.workspaceRoot`；校验失败显示可解释状态，不让文件树打 400。
3. **任务读模型**：`useIdeTask.snapshot(id)` 先取 `getTask` 详情回填，再尽力从看板 overview 补 board slug；缓存与在途合并；归档/已完成任务不依赖 `listTasks`。
4. **错误分级**：401/403/404/503/超时/500 统一映射。401 提示登录态，403 提示权限，404 空态或静默冷却，503 提示依赖未启动，500 显示真实错误。IDE 面板不得直出裸状态码或 `ECONNREFUSED`。
5. **媒体**：本地图片/音频/视频不再把 API key 放在 URL。Markdown 渲染出占位属性，IDE 聊天容器用鉴权 fetch 换成 blob URL；下载仍走 header 鉴权与 root。
6. **页签**：files/review/terminal 保留同步导入；其余 14 个页签改 `defineAsyncComponent`，加载态与错误边界在 `IdeSidePane` 统一。
7. **存储**：快照落盘缓存，面板先返回缓存并后台刷新；`?refresh=1` 强制同步扫描；清理后失效。
8. **自检**：探针注册表带 id/severity/owner/fix hint；支持 `--json` CLI 与历史对比；UI 仍可一键跑。

## 决策记录

- D1 启动逻辑抽成 `useIdeBoot`，不新建第四套 store。理由：会话选择的事实源是 chat store，IDE 只需要「何时 load、何时 switch、何时建草稿」的编排；独立 store 会再造一个可漂移的状态。
- D2 工作区根以 `ide.taskWorkspace` 为任务层输入，而不是再起一套任务解析。理由：并行轮已落服务端解析与 materialized 语义，重复实现会分叉。
- D3 任务详情优先于 `listTasks`。理由：`listTasks` 默认过滤 done/archived，已归档任务深链在逐板扫描里永远命中不了；`getTask` 详情是单任务权威读。
- D4 错误分级复用一套纯函数，不逐个面板写文案。理由：本轮出现裸 401、ECONNREFUSED、裸 404 三种形态，逐面板修会漏。
- D5 媒体采用「占位 + 鉴权 blob 重写」，不在下载端点恢复 query token。理由：token 进 URL 会泄露到日志/Referer；视频/音频一次性 blob 有内存上限，先覆盖会话内预览，超大视频后续再评估签短时 URL。
- D6 页签懒加载用 `defineAsyncComponent` 保留现有 `v-if` 链，不做注册表重写。理由：现有 17 页签模板与 testid 已被测试与深链依赖，换渲染模型收益低于回归风险。
- D7 存储缓存采用 stale-while-revalidate，不引入后台常驻扫描进程。理由：面板是低频入口，磁盘缓存足够把热开降到毫秒级；常驻扫描会与聊天争事件循环。
- D8 P2 的 store 拆分收敛为「状态所有权整合」：会话/根/任务状态移到 composables，`ide` store 继续管布局与偏好。理由：物理拆四个 store 会改动 100+ 导入点，用户可见收益低；先把写入点收成单一来源。
- D9 i18n 本地字典集中到 `custom/client/ide/i18n.ts`，并新增 IDE 模板 CJK 字面量扫描。理由：并行轮已因硬编码「IDE 工作区」返工；机械门禁比人工记忆可靠。
- D10 自检从 UI 组件逻辑抽成注册表 + CLI。理由：同一批探针要被 UI、E2E、合入清单复用，不能只活在弹层里。

## 验证

- P0：五类入口（裸落地/会话深链/任务深链/幽灵/归档）、同根、无裸错误、媒体预览、E2E 冒烟。
- P1：首屏 chunk 基线、隐藏页签零轮询、存储热开 <200ms、430 条会话性能基线。
- P2：EN/ZH 无裸键、自检 CLI 可用、体验走查。
- P3：tab mount matrix、契约/补丁守卫、打包预算、合并脚本。
- 全量 vitest >= 4900 且零失败；server tsc、vue-tsc、build:full 全绿。
