# AIStudio 产品一致性整合改造规格

> 日期：2026-10-27
> 状态：已评审，实施中
> 关联：2026-10-26-cockpit-full-audit-refactor.md（在途审计草稿，不作为实现现状）

## 变更

本次改造解决“能力齐全，但对象、状态和入口彼此打架”的问题。
保留三种工作模式、既有路由深链和已同源复用的组件。
工作顺序是先修功能真实性，再收编控制面，最后统一页面表达。

实际走查覆盖 15 个页面状态。
工作台同时展示房间名和“未选择房间”。
IDE 左右各有一份相同的 CLI 会话。
推演展示“暂无历史运行”，但页面已有选中运行。
首页 49 个交互目标中，39 个宽度或高度不足 44px。
正文 token 为 12px，实际还出现 8–11px 文本。

### 目标

1. 日常任务、推演任务、定时 Loop、Workflow Run、Graph Run 和 Sim Run 都有明确身份，创建、详情和写操作不再跨对象。
2. 设置、阶段页签、页面标题、提醒调度和数据加载各自只有一个控制正身。
3. 页面只展示有来源的状态。空、错、部分可用、历史判定和当前证据核验不得混写。
4. 保留中性设计 tokens，减少重复导航、重复列表和无作用域计数，提升字号、命中区和键盘可操作性。

### 非目标

- 不按静态引用删除 67 个服务端域。清理必须先做运行时可达性审计。
- 不合并 IDE 引擎模型与 Hermes 对话模型、项目记忆与 Agent 个人记忆、Legacy Loop 与 Workflow Run。
- 不新增第四种工作模式，不重写设计系统，不把同组件的上下文投影误当重复实现删除。
- 不在共享真实数据根运行写流，不默认推送远端。

## 决策记录

| 决策 | 选择 | 备选 | 理由 | 类型 | 用户裁定 |
|---|---|---|---|---|---|
| 总体改造 | 保留三模式，先修真实性再收编控制面 | 全量重写导航与视觉 | 现有路由和组件大多可复用，主要债务在对象与控制面 | Taste | approved |
| 日常与推演 | 日常页只看日常口径，推演进度只留 `/app/sim` | 同屏保留两套六阶段进度 | 同一“完成”不能同时指任务桶分布和 run-state | Taste | approved |
| 任务身份 | 使用 `daily/sim + run + board + taskId` 复合键 | 继续传裸 taskId | 同 ID 时卡片和审批会定位错误对象 | Mechanical | approved |
| Loop 与 Workflow | 两类对象都保留，分别设详情和跳转 | 退役旧 Loop 或共用 `?wf=` | 旧 Loop 有 cron、自治和预算，Workflow 是一次性步骤运行，能力不等价 | Mechanical | approved |
| 设置 | `GOV_SETTINGS_DOMAINS` 派生目录与侧栏，统一 `IaLegacyShell` | 保留两个设置主页和两套壳 | 当前入口、可见性和壳切换都已漂移 | Taste | approved |
| 阶段页签 | 37 个 key 与深链不变，合并元数据与 loader | 先删页签数量 | 先消除三重登记，避免把功能去重误作功能删除 | Mechanical | approved |
| 视觉 | 沿用 Pure Ink、Naive UI 和现有状态基元 | 创建一套视觉语言 | 实测字体和色彩已基本统一，问题集中在密度、层级与文案 | Taste | approved |
| 英文 | 新改共享组件同步 zh/en | 同期全量翻译历史页面 | 控制范围，避免把 IA 改造扩大成全仓翻译 | Taste | approved |

### 用户授权与既有工作区处置

用户先指示“按你的判断推进”，随后批准本实施计划。现有 `refactor/cockpit-full-audit-20261026` 工作区历史与当前 main 无共同祖先，且含不应继承的批量删除。其实况改动已完整保存到 `stash@{0}`，本任务从 `origin/main` 创建 `refactor/product-coherence`，不继承旧分支提交。

## 改造类型与侵入点

本批以 A 类 `custom/`、`scripts/`、`docs/` 改动为主。若确需变更 vendor 行为，只通过 `patches/` 与 series 登记，并在注入后重放验证。`vendor/**` 的注入脏态不进入提交。

主要侵入点：

- `custom/client/ia2/`：任务身份、工作台、阶段、设置、推演、检索、共享标题解析。
- `custom/client/ide/`：落地页、CLI 会话展示、安全扫描。
- `custom/client/cockpit/`：提醒调度与共享启动生命周期。
- `custom/client/kanban/`：复合任务键和只读边界。
- `custom/server/loop/graph/`：Graph Run 列表与详情共用摘要投影。
- `scripts/regression/`：IDE 23 签、全路由和生产包验收。
- `docs/superpowers/specs/`：本规格、整合正本和数字总账同步。

## 详细设计

### 对象与状态契约

任务展示键采用 `daily:<board>:<taskId>` 和 `sim:<runId>:<board>:<taskId>`。
原 `task.id` 仍用于所属 API。
写操作只接受 daily ref。
sim 只进入只读详情。

Loop 与 Workflow 分域处理。
Legacy Loop 使用 `/app/l/:loopId` 展示设置与最新运行。
Workflow 使用 `?wf=<runId>`。
Graph Run 的列表和详情由同一服务端 `projectRunSummary` 生成状态与时间。

异步数据必须区分加载、真空、错误、部分可用和陈旧数据。
`allSettled` 不得直接等同空数组。
审批、提醒、地图保存和创建动作必须给出真实成功或失败反馈。

### 控制面契约

设置目录和设置侧栏由 `GOV_SETTINGS_DOMAINS` 派生。
surface、icon、权限和 feature gate 均在元数据中声明。
设置目录与详情使用 `IaLegacyShell`。
路由层级与 `VIEW_LOADERS` 同步变更，不形成双壳。

阶段页签保留 37 个 key，合并元数据、loader 和 props。⑥治理的分组只用于展示。`ProactivitySection` 只在⑥只读，①仍允许编辑。

`recentTitle()` 的既有解析提升为共享 page presentation resolver，供面包屑、最近轨迹和 `document.title` 使用。推演左侧导航承接 `run/from`，中央不再重复四项导航。

### 页面与视觉契约

IDE 左侧保留任务、CLI 会话及其动作，中央只展示当前对象工作区。空态表示“尚未选择”，不得把“没有选中”写成“没有数据”。

正文以 14px 为主，辅助文字不低于 12px。主要动作使用 40–44px 命中区。复核 1440、1280、768、375 四种宽度与明暗主题。保留现有 tokens、状态色和组件，不新增平行的按钮或卡片体系。

## 复用约束

复用现有 `workspace`、`loopStore`、`runsStore`、`WorkflowPanel`、`IaLegacyShell`、`GOV_SETTINGS_DOMAINS`、`STAGE_TABS`、`recentTitle()`、`UiStatusPill`、`UiEmptyState`、Naive UI 主题和 `useSharedArm`。新增代码只承载复合身份、共享解析和缺失的薄详情投影，不复制运行器、看板、审批或 Matrix 数据面。

## 安全约束

写流只在隔离数据根运行。
daily/sim 同 ID 必须验证不写错对象。
地图旧 rev 必须返回未覆盖提示。
安全扫描只读取本地真实 git diff，不把路径当内容，不输出敏感原值。
权限与 feature gate 失败必须可见，不用假空态掩盖。

## 验证

每个任务先写失败测试，再实现并运行目标测试。
子代理报告由主会话复核和复跑。
合入前运行全量 `npm test`。
服务端模块有改动时运行 `npm run typecheck:harness`。
随后运行 `OVERLAY_UPSTREAM_ROOT=$PWD/vendor npm run build:full`、动态 route manifest、dev 与 dist 全路由走查、IDE 23 签 smoke。

隔离写流覆盖：Workflow 创建后详情、Loop 创建后详情、地图正常保存与旧 rev 拒绝、daily/sim 同 ID 不写错对象。
另验 401/403/404/500、部分 board 失败、提醒重复和 WebSocket 生命周期。

浏览器复核整改前后关键页面，覆盖四种宽度与明暗主题。
证据明确区分静态检查、单测、dev 活体、dist 活体和隔离写流。
验证基建同步修正：IDE smoke 补 context、matrix。
verify-dist 使用当前 vendor 与真实 `assets/js` 入口。
route manifest 修正 37 阶段签来源。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：补充对象边界、设置正身、共享页面解析和视觉密度约束。版本与变更记录随批更新。
- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`：阶段页签改为当前 37 的准确分布，测试与补丁数字按最终实测更新。
- README、USAGE 仅在用户可见入口或术语变化时同步，不复制内部过程数字。

## 风险与回滚

路由层级、复合任务键和设置壳属于高风险改动，必须保留旧深链并以同 ID 夹具验证。
任何一批出现功能回退，只回退该批提交，不整批清空其他已验证修复。
旧工作区内容可从 `stash@{0}` 恢复。
本任务的提交按任务边界拆分。

## 未验证项记录要求

交付说明必须列出未运行的验证、失败测试、跳过的环境和残余风险。全路由到达不等于所有按钮已验证，单测全绿不等于活体功能可用。
