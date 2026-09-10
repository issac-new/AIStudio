# Loop Graph P3 — R4 体验验收走查清单（2026-09-10）

来源：spec《loop-graph AI hub 重设计》§7A · R4「人的使用习惯与感受」（P3 验收标准）。走查方法：能写成自动化断言的逐条核对断言（注明测试文件与用例）；自动化覆盖不到的通知盘点、主题抽查以人工 grep/代码走查记录锚点。走查基线：分支 `feat/loop-graph-p3-ia` HEAD `39b8140` + Task 9 收口补修。

**结论：六条全部通过，其中"通知克制"与"主题"各带如实注记的边界项（见 §2.4、§5.3），无阻断项。**

---

## 1. 首屏不空 — 通过（自动化断言覆盖）

| 走查点 | 断言/锚点 | 结果 |
|---|---|---|
| 零数据两态：空态三步引导出现 | `custom/client/ia2/__tests__/overview-components.test.ts`「空态三步引导：零 run 零任务时出现，任一 run 存在即消失」：零 run 零任务 → `.ia-guide` 出现且含三步文案 + 去编排 CTA；任一 run 存在即消失（响应式） | ✅ |
| 有数据两态：首屏默认有内容 | 同文件「布局：注意力条 → 四卡片一行 → 今日计划」：blocked 任务上注意力条、四卡片渲染、到期 loop 进今日计划 | ✅ |
| 零数据引导"从模板三步内跑起来" | 空态引导三步 = 选模板 → 设节奏 → 跑起来，CTA 跳 `/app/orchestrate`（OverviewView `goOrchestrate`，编排区含模板库一键实例化） | ✅ |
| 首拉完成前不判空（防闪） | `booted` 锚（OverviewView.vue，`showGuide` 要求首轮 fetchRuns 完成后才判空） | ✅ |

## 2. 通知克制 — 通过（人工盘点，含边界注记）

生产推送面（graph 引擎装配路径）盘点结论：**默认只有"等你决策"语义到达聊天/横幅，节点成功零推送**。

### 2.1 桌面横幅（Electron/浏览器 Notification）

| 推送点 | 触发条件 | 克制判定 |
|---|---|---|
| `packages/client/src/components/layout/GlobalPendingActions.vue:62`（upstream） | `settingsStore.display.notify_on_approval` 开启时推待审批动作——"等你决策"类 | ✅ 且用户可关 |
| `packages/client/src/stores/hermes/chat.ts:3519` `showCompletionNotificationIfEnabled`（upstream） | `display.notify_on_complete` 开启时推 chat run 完成 | ⚠️ 注记 1 |
| `custom/client/ia2/store/workspace.ts` `fireReminder`（overlay P3） | 用户自设待办闹钟（15/5 分钟前），`tag` 去重 | ✅ 用户显式配置，非系统主动 |

注记 1：completion 通知是 upstream 聊天运行面的既有机制（用户在显示设置里逐项 opt-in，配置缺省 falsy：settings store `display = data.display || {}`，hermes-agent 侧 `gateway/run_notifications.py:1553` 同缺省 False），不属于 loop graph 推送面；R4 约束的"节点成功不推送"在 loop graph 面成立（见 2.3）。

### 2.2 Matrix 聊天推送

| 推送点 | 现状 | 克制判定 |
|---|---|---|
| `custom/server/loop/engine/team-approval.ts:44` 审批请求消息 | 等你决策类；该模块为 legacy 引擎组件，当前无生产装配引用 | ✅ 语义正确且未活跃 |
| `custom/server/loop/engine/matrix-bot.ts` 全量事件播报（含 `loop.completed` 🎉、`loop.tick-complete` ✅ 等成功类） | **未接入图引擎装配**：全仓仅自身与测试文件引用（graph-assembly/run-spawner/interrupt-timeout 中均为注释提及"socket 房间供 matrix-bot 消费"） | ⚠️ 注记 2 |
| R1 每日 Brief | `daily-brief.ts` 只落事件日志（`delivered:false`），投递未接（P2 台账 #33 待用户决策） | ✅ 现状每日至多一次且未投递 |

注记 2：matrix-bot 的事件面（成功也播报）先于 R4 存在且当前是死代码；若未来重新接线，必须先收敛到"等你决策"事件集（stuck/escalated/approval），否则将违反 R4。此条作为 P4 前置约束记账。

### 2.3 图引擎生产路径（唯一活跃推送面）

- run 转 `awaiting-input`（interrupt = 等你决策）→ 介入中心五源聚合 + `/graph` socket 实时反映，**应用内聚合，不外推聊天**（`cb52539` Task 5、`4bcb1e8` Task 8）。
- 审批长期无人应答 → `loop.escalated` 兼容事件，**24h 节流重发**（`custom/server/loop/graph/interrupt-timeout.ts`：`ESCALATION_THROTTLE_MS = 24h` + 水印落盘）。
- 失败熔断（连续失败 N 次）→ loop `paused` + `loop.stuck` 事件进台账/socket，无聊天外推。
- 总览/介入中心所有聚合组件为"只聚合不推送"（MetricsCards.vue 头注）。

### 2.4 R4 原文两条的如实对照

- 「每日 brief 一次」：brief 未投递（#33），现状每日零推送，约束空满足；接线后按 cron 每日一次。
- 「同 run 的失败通知 5 分钟内合并」：当前失败无聊天推送通道（应用内聚合天然合并），无需 5 分钟窗口；escalation 重发节流为 24h。若 P4 接聊天推送，需补该合并窗口——记账。

## 3. 倒序时效 — 通过（自动化断言覆盖）

| 走查点 | 断言/锚点 | 结果 |
|---|---|---|
| 运行列表按最后活动排序 | `custom/client/loop/runcenter/__tests__/runs-store.test.ts:414`「sortedRuns：awaiting-input 置顶 → 最后活动倒序」 | ✅ |
| 进行中 run 的活动心跳（最后事件距今） | `RunListTable.vue:64-69,245`：每行渲染 `relativeTime(run.lastActivityAt)`（runcenter.time.* 相对时间）；`lastActivityAt` 由事件投影实时更新（store `recompute`） | ✅ |

## 4. 键盘可达 — 通过（自动化断言覆盖，Task 2 交付核对）

| 走查点 | 断言/锚点 | 结果 |
|---|---|---|
| j/k 移动、Enter 打开、r 回放、a 审批 | `custom/client/loop/runcenter/__tests__/runcenter-components.test.ts:384`「键盘：j/k 移动焦点行、Enter 发 select、r 发 replay、a 发 peek」 | ✅ |
| a 在 awaiting 行直达审批、边界不越界 | 同文件 `:405`「键盘 a 键：awaiting-input 行发 approve；k 在首行不越界」 | ✅ |
| 总览可点卡片为 `<button>` | Task 4 交付纪律（卡片可点元素原生 button，键盘可达） | ✅ |

## 5. 主题（Pure Ink 无新色板）— 通过（人工 grep 抽查，含边界注记）

走查方法：对 `custom/client/ia2/` 与 `custom/client/loop/runcenter/` 全量 grep 色值 token（hex/rgb/hsl），并判定每处是否在 `var(...)` 回退链内。

### 5.1 变量优先纪律成立

- 图节点状态全部走主题变量（`RunGraphCanvas.vue:196-202`）：running=`var(--color-success)`、failed=`var(--color-danger)`、awaiting=`var(--color-warning)`，即 R4 要求的三色 + 灰阶，零新色板。
- ia2 全部样式在 `ia2.scss` + 组件 scoped，颜色均为 `var(--text-*/--bg-*/--success/--warning)` 及其回退链；Task 9 新增 `.ia-metrics__note` 同纪律（`var(--text-tertiary, var(--text-secondary))`）。

### 5.2 机器扫描残余 12 行，逐类判定

| 类别 | 位置 | 判定 |
|---|---|---|
| 中性黑 alpha（scrim/阴影）`rgba(0,0,0,…)` | OrchestrateView.vue:225、RunListTable.vue:406、RunCenterView.vue:427 | ✅ 灰阶，R4 允许 |
| `rgba(var(--color-warning-rgb,…)/--color-success-rgb…)` | ApprovalPanel.vue:168、RunListTable.vue:355、RunStageBadge.vue:69 | ✅ 变量优先（rgb 通道变量），非硬编码 |

### 5.3 边界注记（不阻断，记账）

- `color: #fff`（on-accent 文字）3 处：InboxPanel.vue:158、RunCenterView.vue:294,397 — 彩色底上的白字属灰阶用法，但未走 `var(--color-on-accent, #fff)`（GraphEnginePolicyCard.vue:98 为正例）。视觉级 P4 顺手统一。
- 选中环 `rgba(59,130,246, 0.25)`（RunGraphCanvas.vue:203）：交互高亮蓝未走 `var(--accent-primary, …)`（同文件 :71 已有变量先例）。P2 遗留视觉级，P4 顺手项。

## 6. 中文优先（新 UI i18n 全键）— 通过（脚本核对）

走查方法：node 脚本加载注入态 zh/en locale，递归展开全键路径做集合 diff。

| 核对项 | 结果 |
|---|---|
| 新 IA 键（`ia2.*`）zh/en 集合 diff | **双向为空**：zh 140 键 = en 140 键（含 Task 9 新增 `ia2.overview.metricDurationSamples` / `metricPartial` 两键；收口同时清除 6+6 个无消费方的 `ia2.placeholder.*` 遗留键） |
| P3 新增 runcenter 键（patch 203-216/213-214/215-216 段） | 随全量 diff 覆盖：除下述存量 6 键外双向为空 |
| 全文件 diff（含存量） | 仅 6 键 en 有 zh 无：`sidebar.swarmKanban`、`sidebar.matrixChat`、`kanban.trash.dropHere`、`kanban.noAttachments`、`kanban.unassigned`、`kanban.taskNeedsAttention` — 均为 P3 之前的历史 overlay 键，不在"新 UI"验收范围；zh 端 vue-i18n 回退兜底。存量债记账，P4 清扫 |
| 默认文案中文优先 | IaShell/IaNav/六区域视图默认 locale 为 zh（上游 locale 机制），文案中文为先，en 全量对称可切 |

---

## 附：走查与自动化的边界声明

- 通知克制与主题两条无法完全自动化（跨 upstream/overlay 的推送链路盘点、CSS 色值语义判定），以代码走查 + grep 脚本留痕，锚点均到 file:line。
- 无浏览器级人工点击走查（jsdom 断言 + 静态走查覆盖）；`build:full` 产物级验证在 Task 9 门禁另行执行。
- R4「深色/浅色跟随系统」由上游主题机制承担（`prefers-color-scheme` 切换 CSS 变量），新 IA 零硬编码色值即自动跟随，未单独断言。
