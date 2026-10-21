# 推演可见性口径收口 + IDE 看板任务面补齐（spec）

日期：2026-10-21
分支：`feat/sim-visible-ide`
来源：用户 2026-10-21 复查「全流程推演过程的 kanban 任务、Matrix 聊天等，在日常工作台和 IDE 工作区应均可看到」，要求按建议口径改写并完整补齐。

## 一、可见性口径（改写正本）

> 在推演实例内的日常工作台/看板，可看到该轮全部推演看板任务与 Matrix 房间；IDE 工作区可通过任务深链查看单个推演任务、任务简报及相关 Matrix 消息摘要。宿主日常实例与推演实例的 kanban 数据互相隔离；导演台只负责建卡与人工闸，不产生 Matrix 聊天。

三条边界必须同时成立：

1. **实例边界**：推演 studio `:8802` 以 `HERMES_HOME=$SIM_ROOT/hermes` 启动；宿主 studio `:8647` 默认读 `~/.hermes`。kanban 不跨实例聚合。
2. **入口边界**：工作台/看板是主管聚合视图；IDE 是任务深链 + 任务简报 + 相关消息摘要，不承载完整 Matrix 客户端。
3. **执行路径边界**：产品内导演台只建真实卡/开人工闸；全流程 Matrix 聊天由受控 harness（mux + gateway）产生。

## 二、变更

### 1. 文档口径

- `2026-10-21-swarmstudio-complete-design.md`：§1.4 写入可见性口径；§3.4/§4.6 补 IDE 看板任务面；§4.7 补导演台 Matrix 边界；§5.5 增可见性行；§8/§9 记账。
- `2026-10-05-mux-v8-fullflow-plan.md`：在「共享与隔离并行」后补 2026-10-21 可见性补批，说明“看板互相看不见”是单板 API 的认领围栏，不是 studio 工作台看板；capture-plan 的旧注释待 simharness 下次变更同步（本仓只读消费 simharness）。
- 本 spec 为口径正本；完整设计只做汇编引用。

### 2. IDE 看板数据面

- 新增 `custom/client/ide/composables/useIdeKanbanOverview.ts`：一次读 `/api/hermes/kanban/overview`，返回当前 studio 实例全部板与任务（raw task + board）。
- `IdeKanbanPane` 改为消费该数据源：
  - 默认「全部板」，跨账号分板显示推演任务；支持按板筛选 chip。
  - board/list/swimlane/gantt 四视图保留；list 视图增加 board 列，board 卡片带 board 标识。
  - 移除只读 `default` 板的旧限制（推演板无 `default`，旧实现恒空）。
- 数据源与工作台看板同源（`/api/hermes/kanban/overview`），不再 N+1 spawn CLI 逐板读。

### 3. IDE 侧栏看板任务段

- `IdeTaskSidebar` 在会话列表上方增加可折叠「看板任务」段：
  - 展示当前实例活跃卡（非 done/archived），按优先级/创建时间排序，首屏 8 条。
  - 每行显示标题、来源板、状态；点击走 `/app/ide?task=<id>`，由 `IdeShell` 跨板解析并打开简报。
  - 段底「打开看板」回 `/app/board`；编辑仍在工作台看板，IDE 不新增写入口。
  - 会话优先级桥接改用同一 overview 数据，覆盖全部板（原实现只读 default 板）。

### 4. 导演台边界提示

- `DirectorPanel` 产品内推演区补一行说明：只建真实看板任务与人工闸；Matrix 聊天由受控 harness 产生，这里不代发。

### 5. 守门

- 新增 `kanban-overview.test.ts`：聚合、活跃过滤、board 计数、错误可见。
- 更新 `kanban-pane.test.ts`：全板默认、板筛选、四视图、深链。
- 更新 `task-sidebar.test.ts`：看板任务段、跨板任务点击深链、优先级桥接改用 overview。
- 更新 `sim-center-shell.test.ts`：导演台边界提示在位。

## 三、决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 可见性按 **studio 实例** 定义，不做宿主↔推演跨实例 kanban 聚合 | 日常/推演分离是 2026-10-20 冻结边界；跨实例聚合会把两套 HERMES_HOME 的任务混在一起，写入口与证据链都会失真。 |
| D2 | IDE 看板默认「全部板」+ 板筛选，不按 default 板兜底 | 推演任务落在账号分板（fanfan-pm-plan 等），实例内没有 default 板；只读 default 是“IDE 看不到推演任务”的直接根因。 |
| D3 | IDE 复用 `/api/hermes/kanban/overview`，不逐板 listTasks | 逐板 CLI spawn 约 9s/板、28 板不可接受；overview 是现有工作台看板同源聚合端点，sqlite 快道已完成。 |
| D4 | IDE 侧栏「看板任务」只读，点击走 `?task=` 深链 | IDE 的设计中心是会话/任务简报，不造第二套看板写面；编辑仍回 `/app/board`。 |
| D5 | 导演台不接 Matrix 发送 | 导演台是产品内图执行面；全流程 Matrix 由 harness 的模拟员工/网关产生。接一条假发送链会制造“导演台也能演聊天”的错误预期。 |
| D6 | 宿主日常 Matrix 观察员房间不在本轮代码修复 | sim 与 host 共用 `:8008`，`@admin` 默认被邀入 harness 房间；准确识别需 harness 侧房间标记或独立观察员账号/homeserver，跨仓且需产品裁定。本轮如实挂账。 |
| D7 | 工作台看板维持主管聚合语义，不按登录账号过滤 | 第一用户是主管；工作台是跨板驾驶舱。`/api/hermes/kanban?board=` 的 profile 围栏仍服务单板 API/agent 认领，两者口径不同，文档写明，避免 capture-plan 旧注释继续误导。 |

## 四、验证

- 定向测试：
  - `npx vitest run custom/client/ide/__tests__/kanban-overview.test.ts`
  - `npx vitest run custom/client/ide/__tests__/kanban-pane.test.ts`
  - `npx vitest run custom/client/ide/__tests__/task-sidebar.test.ts`
  - `npx vitest run custom/client/ia2/__tests__/sim-center-shell.test.ts`
- 类型检查：本仓 `vue-tsc` 基线含上游错误；本轮改动文件以定向测试 + 构建为准（视并行会话情况决定是否跑全量 build，避免与在途换装互踩）。
- 浏览器：在推演实例 `:8802` 或 dev 热更新下逐项走查：
  - IDE 看板默认显示跨账号板任务，切板 chip 生效；
  - IDE 侧栏「看板任务」段可见，点击打开任务简报；
  - 导演台边界提示可见；
  - 工作台/看板仍显示同一实例全部板任务；宿主日常不出现推演 kanban。
- 未验证项如实记录：本轮不做宿主跨实例聚合、不做 harness 房间标记、不跑完整 26 步。

### 验证账（2026-10-21，worktree `sim-visible-ide-1021`）

- 定向测试 40/40：`kanban-overview` 2、`kanban-pane` 4、`task-sidebar` 17、`sim-center-shell` 17。
- IDE 全目录回归：118 文件 / 720 用例全绿（含 `scss-syntax-guard`、`sidepane-tabs-i18n`）。
- `domain-split` 3/3 通过；未新增跨域导入。
- `vue-tsc --noEmit` 仍报既有 alias 解析基线错误（`@/api/client`、`@/stores/hermes/chat` 等，存量文件同族）；本轮新增模块未出现可区分的业务类型错误。
- 全量 `npm test`（worktree，778 文件）：5525 通过 / 29 跳过 / 2 负载敏感超时（`engine-round5`、`raci-visibility`）；4 个失败文件单跑 48/48 全绿，无本轮新增失败。
- 未跑 `npm run build`、未做登录态浏览器走查：主工作树有 zcode 3.16.2 在途换装，避免共享 dist/注入互踩；合并前建议补构建与 UI 走查。
- 分支已 rebase 到 main `a5a54ff2`（设计文档单一正本合并轮）后复跑定向测试，仍 40/40。

## 五、不做（挂账）

- 宿主日常 ↔ 推演实例的跨实例只读聚合（与 D1 冲突，需产品重新裁定）。
- harness 房间标记 / 独立观察员账号 / 独立 homeserver（D6，跨仓）。
- 导演台 Matrix 发送（D5）。
- IDE 内完整 Matrix 客户端（入口仍在工作台房间画布）。
- `npm run build` 与登录态浏览器走查：本轮未做（共享 dist 与在途换装风险）；合并前建议补。
