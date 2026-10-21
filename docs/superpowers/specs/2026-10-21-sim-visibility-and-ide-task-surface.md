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

## 六、补批（2026-10-21 下午 · 挂账实施轮，用户裁定推翻 D1/D5/D6）

用户在方案问询中四项全选并指示「完成挂账内容的实施」：跨实例可见性取「并入日常工作台 + 推演标记」，房间识别取「改 simharness 打标」（显式授权跨仓）。

### 6.1 口径修订（覆盖 §一 的三条边界）

1. **任务并入（推翻 D1 的 kanban 隔离面）**：推演实例任务经观察面**直接并入**日常工作台/看板/右栏，统一带「推演」徽标 + runId；写口不并入（sim 卡在日常侧只读，点击走「在推演中查看」显式跨模式跳转）。日常阶段完成度仍排除 sim 卡（呈现并入、进度口径不变）。
2. **导演台通知（修订 D5）**：导演台仍不代演聊天，但 run 启动/人工闸批准·打回会向配置的观察房间发**真实系统消息**（`SIM_DIRECTOR_NOTIFY_ROOM` + humansim 通道，未配置 fail-soft 跳过并在 UI 如实标注）。
3. **房间标记（落地 D6）**：simharness `mx_create_room` 建房即发 `com.swarmstudio.sim/run` 状态事件（跨仓 `feat/sim-room-tag`@67e01df，spec=该仓 docs/specs/2026-10-21-sim-room-tag.md）；产品端双源识别（状态事件 + observer run-state 房间集），宿主日常房间列表显示「推演」徽标。
4. **IDE 完整 Matrix**：右辅助栏新增「沟通」页签（房间列表 + 房间头 + 消息面板 + 右侧线程面板，复用 matrix-chat 全套 store/组件，读写同工作台画布）。

### 6.2 实现

| 件 | 落点 |
|---|---|
| 观察面端点 | `simcenter-controller.ts` `GET /api/hermes/sim/observer/overview`（SIM 根候选解析 + current-run + 房间键 + kanban-overview sqlite 快道只读聚合；fail-soft） |
| store 双源合并 | `ia2/store/workspace.ts`：host/sim 双私有源 + applyAll 合成，sim 任务带 `source:'sim'/runId`；`simObserver/simRunId/simRoomIds/isSimTask` 导出 |
| 看板并入 | `SwarmKanbanView`：板 chip「推演」徽标、sim 卡点击→推演模式、`?task=` 深链 sim 分流、`withBoard` 写口守卫；`KanbanTaskCard`「推演」徽标 |
| 工作台右栏 | `LinkedTaskList` sim 徽标 + 唯一动作「在推演中查看」（`open-sim` 链路经 TaskDecisionPanel→WorkbenchView） |
| 阶段进度 | `useDailyStageProgress` 过滤 `source==='sim'` |
| 房间徽标 | `MatrixRoomList` 双源识别（状态事件 + simRoomIds），「推演」徽标 |
| IDE Matrix | `IdeMatrixPane`（新）+ sidePane 第 22 页签 + 命令面板；matrix i18n 走 IDE_LOCAL_TEXT 本地字典 |
| 导演台通知 | `director-notify.ts` + humansim `sendHumansimMessage` 导出重构 + graph-rest start/resume 挂钩 + DirectorPanel 回执文案 |
| simharness | `feat/sim-room-tag`：建房打标（run/rfd/taggedAt），失败仅告警 |

### 6.3 新增决策

| # | 决策 | 理由 |
|---|---|---|
| D8 | 任务并入但**写口不并入**：sim 卡日常侧只读 + 显式跨模式跳转 | 并入满足可见性诉求；写口并入会把日常操作打到推演库（必然错板/404），也守住 2026-10-20「不共享写入口」的冻结面 |
| D9 | 观察面读 SIM 根用固定候选（env 显式优先 → cwd/家目录约定位），fail-soft | 宿主日常不配 OBS_SIM_ROOT 也要可用；只读、不读任意路径、缺席如实 available:false |
| D10 | 日常阶段完成度排除 sim 卡 | 阶段进度是日常任务口径；推演卡计入会让「日常做到哪」被推演轮虚增 |
| D11 | 导演台通知走 humansim 通道（notice 类，带审计），未配置即关 | 真实通知而非代演聊天；与 PR-0 受控发送面同一执法/审计链 |

### 6.4 验证账（补批）

- 定向新增全绿：observer 5/5（tmpdir 真实 sqlite 板库 + 软链 current-state）、sim-observer-merge 4/4、sim-badge 2/2、director-notify 3/3。
- 回归：IDE+kanban+matrix-chat 835 用例（side-pane 21→22 签同步）、ia2 全量 676、graph+cockpit 780、simharness 全量 196——除已知负载敏感项外全绿。
- simharness 活体打标与产品端徽标联测：待下一轮建房步（本轮 run22 房间建于打标合入前，由 run-state 房间集兜底识别）。
- 构建/浏览器走查：见验证账补录段。
