# P3：新信息架构——六区域导航 + 角色仪表盘 + 旧 cockpit 退役

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以六区域一级导航（总览/编排/运行/介入/工作项/沟通）取代三栏驾驶舱，落地 §7B 角色整合项（仪表盘/分诊/策略/追溯矩阵），清偿 P2 台账顺延项，按 R4 完成体验验收，旧 cockpit 退役。

**Architecture:** 新 IA = 新路由树（`/app/*` 前缀一级区域）+ 区域 shell 组件 + 既有子路由整体挂入对应区域；旧 `/hermes/cockpit` 路由保留一个版本周期作重定向（`VITE_IA_RETRO=1` 可临时回旧版，P4 删除）。功能迁移原则：**先吸收后退役**——每个区域挂载等价能力后才允许下线 cockpit 对应部分。状态层：cockpit 上帝 store（1638 行）按区域拆为 `stores/{overview,inbox,orchestrator,tasks}.ts`（runs store 已在 runcenter，Matrix 沟通沿用其 store）。

**Tech Stack:** Vue 3 + Pinia + Vue Router（上游路由 patch 体系）/ Vitest（jsdom 按需）/ 零新依赖。

## Global Constraints

- 上游零污染；feature flag `VITE_IA_RETRO`（默认关闭=新 IA）切换保留一个周期。
- 门禁：`npm test`（基线 1015 过 / 6 skip）+ 收口 `npm run clean && npm run inject && npm run build:full`。
- 视觉 Pure Ink；文案 i18n zh/en 双语（patch 体系，编号从 213 起避免再撞号——开工前 `ls patches/ | grep ^21` 复核）。
- 三图合一原则（spec §8）：执行图是源；本期的"工作项关联"用**事件日志关联**（run 的 persistence 产物 contract → kanban 任务 ID 显式记录），不做正则提取。
- spec 依据：§8（六区域/三图合一/观察者并入）、§7B.1（键盘可达/通知克制）、§7B.4（仪表盘/分诊/策略下发）、§7B.2（追溯矩阵）、§7B.7 P3 行。
- 每任务完成即区域可用（不做半成品大爆炸合并）。

---

### Task 1: 服务端台账清偿 + 回放导出

**Files:**
- Modify: `custom/server/loop/graph/graph-rest.ts`、`graph-runtime.ts`（事件 id）、`phase-nodes.ts`（tasksCompleted 累差）、`matrix-bot.ts`（新事件渲染）、`run-spawner.ts`（熔断告警节流文案）
- Create: 导出端点（graph-rest 内）
- Test: 各文件对应测试追加

**行为规格（P2 台账逐条）：**
1. `GET /api/graph/specs/:id`（台账 #25）：返回 `{id, version, spec}`，404 带 `{error}`；前端 `api.getSpec` 切换到该端点（custom/client/loop/runcenter/api.ts 一行改动 + store 适配）。
2. **回放导出**（台账 #30，spec 门禁缺口）：`GET /api/graph/runs/:id/export` → `Content-Disposition: attachment; filename=run-<id>.json`，body=`{run: instance, spec, events: [...]}`（run 详情+拓扑+全事件一次打包）；前端运行详情加"导出 JSON"按钮。
3. **事件幂等 id**（台账 history 双发去重的根）：EventLogStore append 生成 `eid`（`<runId>-<seq>`）随事件返回；前端 applyEvent 按 eid 去重（修首连 subscribe 双发 + 重连 history 重复）。
4. **tasksCompleted 累差**（Task4 复审发现）：runPersistence 台账写改从 store 读现值累差（或 phaseProgress 记账），多轮成功不再少计。
5. **guard/maxAttempts 对齐**（同复审备忘）：编译器 guard.maxIterations 取 `max(contract.maxAttempts 范围内值, 3)`——实现：编译时读 loop 的 TaskContract 模板 maxAttempts（不可得则 3 并 warn 一次），消除"契约配 ≥5 时回边先耗尽"边界。
6. **matrix-bot 渲染补全**：`loop.escalated`（A2 已加 case）之外补 `loop.persist-failed`、`loop.stuck` 三类的事件文案（人话，一句以内），消除 default 忽略。
7. **熔断告警文案**（fail 策略噪音时长）：tripBreaker 的 loop.stuck 消息附"因持续失败已暂停，需人工处理"（口径已在 README，代码文案对齐）。

- [ ] Step 1-5: TDD → `npm test` → Commit `feat(loop): P3 台账清偿——specs/:id/导出/事件幂等/累差/渲染补全`

---

### Task 2: 前端台账清偿 + 键盘可达

**Files:**
- Modify: `runcenter/store/runs.ts`（eid 去重、批量订阅）、`RunListTable.vue`（虚拟滚动）、`NodeInspector.vue`（join state）、`adapters.ts`（gate 双轴统一）、`ApprovalPanel.vue`（specified 身份）
- Test: 对应测试追加

**行为规格：**
1. **eid 去重**：applyEvent 顶部 `if (seen.has(e.eid)) return`（eid 缺失的旧事件回退 `type+ts+nodeId` 组合键）；首连 subscribe 双发修复（connect 回调跳过首轮已发 subscribe）。
2. **批量订阅**（台账量级项）：runs store 订阅改为"可见页 run 才 subscribe"（分页感知，离开页 unsubscribe）。
3. **虚拟滚动**：RunListTable 1000 run 滚动不卡（R5 预算）——自实现最小虚拟列表（行高固定 48px，零新依赖）。
4. **检查器 channel 值**：NodeInspector 的 lastUpdate 键 join `instance.state` 显示当前值，UI 标注"当前值（非事件当时值）"（台账判定已确认 REST instance.state 可用）。
5. **gate 双轴统一**（台账 #28）：deriveStage 的 legacy 轴 `scheduling→'stop'` 改为与图轴一致的 `'gate'` 折叠（或两轴都归 `stop`——实现者选一致性方向并在 deriveStage 注释声明）。
6. **specified 审批身份**：ApprovalPanel 提交 resume 值带 `approver: <当前用户名>`（上游 auth store 取，`useAppStore`/`useAuthStore` 探查）；服务端 `evaluateApprovalPolicy` 的 specified 分支已按 approver 匹配（P1 实现），前端补身份即通。用户名不可得时按钮置灰 tooltip 说明。
7. **键盘可达**（§7B.1）：运行列表 j/k 移动、Enter 打开详情、r 回放、a 审批（触发 peek 展开）；焦点样式可见。

- [ ] Step 1-5: TDD → Commit `feat(loop): 前端台账清偿——去重/虚拟滚动/身份/键盘`

---

### Task 3: 六区域导航骨架 + 路由重排

**Files:**
- Create: `custom/client/ia2/`（新区域根目录）：`routes.ts`、`views/{OverviewView,OrchestrateView,RunsView,InboxView,TasksView,CommsView}.vue`（Task 3 先做壳）、`components/IaNav.vue`、`store/ia.ts`
- Modify: `registries/client/bootstrap.ts`（注册）、patch 路由文件（`/app/*` 路由树 + 登录默认落 `/app`）、i18n 213+
- Test: 路由/导航 jsdom

**行为规格：**
- **路由树**：`/app`（总览 OverviewView，登录默认落此）→ `/app/orchestrate`、`/app/runs`、`/app/runs/:runId`、`/app/inbox`、`/app/tasks`、`/app/comms`。既有子路由整体挂入：`/app/comms/*` 吸收 matrix-chat 全部子路由（原样搬路径参数）；`/app/runs/*` 重定向兼容旧 `/hermes/loop/runs`；`swarm-kanban` 吸收进 `/app/tasks`。
- **IaNav**：左侧窄栏一级导航（图标+文案，Pure Ink），当前区域高亮；键盘 `g then 1-6` 跳区域（可选，低优先）。
- **区域壳**：Task 3 六个 View 为可用骨架——RunsView 直接内嵌 RunCenterView 既有内容（wrapper），CommsView 内嵌 matrix-chat router-view，TasksView 内嵌 SwarmKanban，InboxView 先占位（Task 5 实现），OverviewView 先占位（Task 4），OrchestrateView 先占位（Task 6）。
- **兼容重定向**：`/hermes/cockpit` → `/app`；`/hermes/loop/runs` → `/app/runs`；`/hermes/loop/:id` → `/app/runs?loop=:id`（或保留原路由不删——实现者按迁移成本取舍并声明）。
- **VITE_IA_RETRO**：置 1 时登录默认仍落 `/hermes/cockpit` 且侧栏入口双份（回退保险，默认关）。（Task 8 实施更新：cockpit 路由本体已退役删除，该开关语义收窄为「旧 `/hermes/loop*` 深链不强制迁移」；登录落点直改 `/app`，退役路径任何模式都重定向新 IA。）
- **cockpit 不删**（Task 8 才退役）；本期只做新 IA 可用 + 默认切换。

- [ ] Step 1-5: TDD（路由表/重定向/RETRO 开关/内嵌渲染冒烟）→ Commit `feat(ia2): 六区域导航骨架——/app 路由树+区域壳+兼容重定向`

---

### Task 4: 总览首屏 + 角色仪表盘

**Files:**
- Create: `ia2/components/{AttentionStrip,ActiveRunsCard,InboxPreviewCard,ScheduleCard,MetricsCards}.vue`、`ia2/adapters/overview.ts`
- Modify: `OverviewView.vue`（实装）、`store/ia.ts`
- Test: adapters 重点 + 组件冒烟

**行为规格（spec §8 总览 + §7B.4 仪表盘 + R4 首屏不空）：**
- **首屏布局**（上→下）：注意力条（收编 CockpitAttention 逻辑：blocked/review/triage/todo → 点击筛任务）→ 四张卡片一行（活跃运行 / 等你决策 / 今日日程 / 关键指标）→ 今日计划列表（到期 loop）。
- **角色仪表盘卡片**（§7B.4，数据从事件日志聚合——服务端如有现成端点用之，否则前端聚合 replay）：
  - 活跃运行卡：running/awaiting 计数 + 最近活动时间 + 点击进 `/app/runs`
  - 等你决策卡：awaiting-input 计数 + 最久等待时长 + 点击进 `/app/inbox`
  - 今日日程卡：收编 CockpitScheduleModal 的"今日待办+闹钟"只读摘要（点击打开原弹窗复用）
  - 关键指标卡（负责人视角）：近 7 天 run 成功率 / 平均耗时 / 熔断次数（`loop.stuck` 计数）
- **空态引导**（R4）：零数据时显示三步引导卡（选模板→设节奏→跑起来），任一 run 存在即消失。
- **通知克制**（R4/§7B.1）：总览只聚合不推送；卡片数字来自 store 订阅（复用 runs store），不加新轮询。

- [ ] Step 1-5: TDD → Commit `feat(ia2): 总览首屏——注意力+四卡片+角色指标+空态引导`

---

### Task 5: 介入中心（收件箱升一级 + Triage 分诊）

**Files:**
- Create: `ia2/views/InboxView.vue`（实装）、`ia2/components/{TriageQueue,AlarmList}.vue`
- Modify: 复用 runcenter 的 InboxPanel/ApprovalPanel 组件（props 化复用而非复制）
- Test: 分诊排序/归档衰减

**行为规格（spec §8 介入 + §7B.4 Triage + §7B.1 通知克制）：**
- **介入收件箱聚合五源**（沿用 NotifyModal 的优先级模型）：interrupts/审批 > 阻塞任务 > 待审任务 > 熔断/停滞告警（`loop.stuck`/`loop.escalated`）> 待办提醒。
- **Triage 分诊队列**（Linear 模式）：待处理项默认视图=「今日待分诊」，按"等待时长 × 严重度"排序；`已分诊`=本地 kv 标记（cockpit-kv 模式），日切自动重置；**自动归档**：完成态条目 7 天后从列表消失（kv 记时间戳，读取时过滤）。
- **就地审批**：interrupt 条目内联 ApprovalPanel（复用 runcenter 组件），批准/拒绝后条目自动流转。
- **通知克制**：本区域不产生推送；桌面横幅逻辑维持现状。

- [ ] Step 1-5: TDD → Commit `feat(ia2): 介入中心——五源聚合+Triage 分诊+就地审批+自动归档`

---

### Task 6: 编排区（只读）+ 实例化入口

**Files:**
- Create: `ia2/views/OrchestrateView.vue`（实装）、`ia2/components/{SpecList,SpecDetail}.vue`
- Modify: `OrchestrateView` 接编译器入口
- Test: 列表/查看/实例化冒烟

**行为规格（spec §8 编排"先只读展示"，P4 才有画布）：**
- **模板库列表**：`GET /api/graph/specs` → 卡片（名称/版本/节点数/描述）；五阶段编译模板 + 每日 Brief 模板可见。
- **SpecDetail**：GraphSpec 只读可视化（复用 runcenter 的 RunGraphCanvas 拓扑布局，传 spec 而非事件投影——buildRunGraph 抽出 `layoutFromSpec(spec)` 复用 layoutRunGraph）+ JSON 查看器（可折叠）。
- **实例化入口**：从模板创建 loop——表单（名称/goal/schedule cron/tenant 可选）→ POST /api/loop/loops → 跳转运行列表。R4：三步内跑起来。
- **导入/导出**：SpecDetail 支持 JSON 导出下载；导入（P4 画布配套，本期置灰 tooltip）。

- [ ] Step 1-5: TDD → Commit `feat(ia2): 编排区——模板库只读+Spec 可视化+实例化入口`

---

### Task 7: 工作项 ↔ run 双向关联 + 追溯矩阵

**Files:**
- Create: `ia2/adapters/traceability.ts`、`ia2/components/RunLinks.vue`（任务详情内嵌）
- Modify: 服务端 persistence 节点产物记录（persistence 已写 kanban 任务——把 `contract.id → kanban taskId` 显式存 contract/事件 payload，替代 title 反查）、CockpitWorkspace/任务抽屉关联区、`TasksView` 实装
- Test: 关联投影 + 矩阵聚合

**行为规格（spec §8 工作项关联 + §7B.2 追溯矩阵）：**
1. **关联数据链**（显式记录替代正则）：persistence 成功后 emit `loop.persisted` 的 payload 增加 `taskId`（KanbanPersistenceAdapter 已拿到 createTask 返回 id——确认链路后透传）；同时 contract store 记录 `persistedTaskId`。
2. **任务 → run**：kanban 任务详情（TasksView/任务抽屉）新增"来源 run"区块：按 taskId 在事件日志反查 `loop.persisted` → 显示 runId 深链（`/app/runs/:runId`）。
3. **run → 任务**：运行详情检查器 persistence 节点显示产物任务链接（打开 TasksView 对应任务）。
4. **追溯矩阵视图**（§7B.2）：TasksView 内"追溯"页签——表格式 需求(loop goal) → run（状态/迭代）→ 产出任务（状态）→ 验证轮次（gate 结果），按 loop 分组；数据源=事件日志聚合（纯函数 adapter 重点测试）。
5. 正则提取路径（sessionTaskId.ts 宽泛 fallback）标记 deprecated 注释（L2 hook 写会话元数据属 hermes-agent 侧，本期不动 agent）。

- [ ] Step 1-5: TDD → Commit `feat(ia2): 工作项↔run 双向关联+追溯矩阵`

---

### Task 8: cockpit 退役 + 沟通升一级 + store 拆分

**Files:**
- Modify: `registries/client/bootstrap.ts`、patch 071/072（路由/导航）、`custom/client/cockpit/`（退役清理）、`custom/client/ia2/`（观察者聚合、策略下发）
- Test: 全路由回归 + 契约测试

**行为规格（spec §8 + §9 退役清单）：**
1. **cockpit 退役**：`/hermes/cockpit` 路由删除（重定向已在 Task 3）；三栏布局组件整体移除 import 路径；孤儿组件删除（CockpitGraphNode/ChatPane/FileTree/FileNode/TaskLifecycleView 若未挂载则删、假终端 terminalLines、setHistoryArchivedFilter 空壳）；**保留**被复用的：CockpitAttention 逻辑（Task 4 收编）、ScheduleModal（总览复用）、NotifyModal 优先级模型（Task 5 收编）、KanbanDiagnosticsSection/KanbanMarkdown/tenant-parser、CockpitIcon、样式 token。
2. **Matrix 升一级**：`/app/comms` 直达 matrix-chat（Task 3 已挂）；上游侧栏"AI协作中心"项（patch 072）改指 `/app`；删除 cockpit 专属入口 patch 中失效部分。
3. **观察者聚合**：跨运行分析并入总览指标卡 + 运行列表筛选（生命周期漏斗 TaskLifecycleView 的等价能力若 Task 4 指标卡未覆盖则补最小版：按状态分布条形图）；TaskLifecycleView 退役（能力等价收编）。
4. **策略下发**（§7B.4 最小版）：设置页新增"图引擎策略"卡——GRAPH_ENGINE 当前模式展示 + 默认审批超时/熔断阈值只读展示（策略文件化随 P4，本期先可见）。
5. **store 拆分**：cockpit store 拆出仍被复用部分（schedule/todo/attention）到 `stores/` 独立模块；cockpit store 本体随退役删除；runs/inbox/ia store 已独立。
6. **契约测试**：`swarm-studio-contract.test.ts` 扩展——六区域路由存在性/重定向正确性/RETRO 开关行为。

- [ ] Step 1-5: 全路由回归 + TDD → Commit `feat(ia2): cockpit 退役——沟通升一级/观察者聚合/store 拆分/契约测试`

---

### Task 9: R4 体验验收 + 收口

**Files:** README、i18n 全量核对、验收清单
- **R4 逐条走查**（spec §7A）：首屏不空（有数据/零数据两态截图级走查）、通知克制（默认只推"等你决策"——盘点现有推送点）、倒序时效（运行列表排序验证）、键盘可达（Task 2）、主题（新 IA 全程 Pure Ink 无新色板）、中文优先（新 UI i18n 全键）。
- 门禁：`npm test` + clean/inject + `build:full` + 手动级路由走查清单（写成自动化断言覆盖到程度即止）。
- README：新 IA 章节重写（六区域导览图文字版）、规模数字更新。
- 台账核销文档更新（P2 ledger 27 条中本期清偿项核销）。
- Commit `docs(ia2): P3 收口——R4 验收 + README + 台账核销`

---

## Self-Review 记录

- **Spec 覆盖**：§10 P3 行全项 → Task 3-8；R4 → Task 2（键盘）/4（首屏/空态）/5（克制）/9（走查）；§7B.4 → Task 4（仪表盘）/5（分诊/归档）/8（策略最小版）；§7B.2 → Task 7；台账 27 条中可行动项 → Task 1/2，其余在 Task 9 核销归类。**明确顺延 P4**：画布编辑、plan 节点、Best-of-N、死图检测、L2 hook 会话元数据（hermes-agent 侧）、策略文件化。
- **风险**：Task 3 路由重排与上游 patch 071 强耦合（上游 v1.0.2 是否漂移 071 的锚点——实现者第一步先验证 patch 071 在当前上游可应用）；Task 8 退役是最大破坏面——RETRO 开关 + 契约测试兜底。
- **依赖序**：1→2（前端依赖服务端 eid）可并行；3→4/5/6→7→8→9 严格依赖。
