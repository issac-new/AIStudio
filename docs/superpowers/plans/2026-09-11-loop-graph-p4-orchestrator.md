# Loop Graph P4 — 可视化编排器 + 台账清偿（2026-09-11）

Spec：`specs/2026-09-09-loop-graph-aihub-redesign-design.md` §7/§7B.7（P4 行）/§10。
台账：`specs/2026-09-10-loop-graph-p2-ledger.md` §四（P2 顺延 15 + P3 顺延 30）。
分支：`feat/loop-graph-p4-orchestrator`（单分支分波提交，收口 --no-ff 合 main）。

## 验收门禁（spec §10 P4 行）

> 从空白画布拖出"循环内含审批"的图并成功运行。

拆解为可测断言：
1. 编辑器新建空画布 → 拖入节点(含 plan/human) → 连出含守卫回边的环 → 编辑守卫实时标错/放行 → 保存 `POST /api/graph/specs` 成功。
2. 试跑 `POST /api/graph/specs/:id/runs` → run 进入 awaiting-input(审批 interrupt) → 运行中心可见 → resume → run 完成。
3. `npm test` 全绿（基线 1203 passed + 6 skipped）+ `clean && inject && build:full` exit 0。

## 范围控制（spec §11）

只做画布编辑 + 节点面板 + loop 容器 + 编辑守卫 + 模板库 + 导入导出 + §7B.7 P4 行整合项（plan 节点 / Best-of-N fan-out / 死图检测 / worktree 策略配置 / Always allow 按类型记忆 / 模板内置权限档与敏感清单）。不做 marketplace / 协作编辑 / 运行时验证节点（远期）。

## 架构决策

- **自建 spec 起跑链路**（新 `custom/server/loop/graph/spec-runtime.ts`）：specStore 里的自建 spec 目前不进 graphService.graphs（只有 spawner 编译的 loop 模板会注册）。新增 CustomSpecRuntime：用"编辑器节点类型注册表"hydrate GraphSpec → registerGraph → startRun。REST 面 `POST /api/graph/specs/:id/runs`。
- **plan 节点**（`spec-runtime.ts` 内工厂）：interrupt 携带 `{planText, todo[]}` 载荷 + 自路由回本节点（沿用 phase-nodes 审批握手语义：`approval:<id>@<n>` / `__resume:<id>` 通道）；resume 值三出口 `{decision:'approve', mode:'auto'|'stepwise'}` / `{decision:'reject'}` 写 `planResult` 通道；下游三边以谓词消费 decision/mode。批准档位决定 agent 节点权限档（auto=agent 自动执行、stepwise=逐项 interrupt）。
- **Best-of-N fan-out**：fanout 节点按 `config.variants:N` 经 P0 Send 真并行分派 N 条变体边（边 id 约定 `v1..vN`），converge 节点 joinMode 'all' 收集变体产物进 `boN.candidates` 通道；选优两档：`config.pick:'human'`（interrupt 人选，列表含产物摘要）/ `'score'`（谓词按通道值自动选）。这是 §7B.5 "diff 两两对比收敛"的最小可运行落地，diff 视图挂 run 详情（不新开页面）。
- **死图检测**（新 `analyzeGraphSpec()`，graph-spec.ts 旁）：**警告级**（不 throw，编辑器实时渲染），四条：① fan-out 区间内分支间互连边（分支间无顺序保证不可互依）② 分支存在逃逸边（绕过 join 直接回主流程 = 产物回写主上下文面）③ fan-out 后无 converge/join 汇合点（分支必须收敛）④ 并行分支区间内有指向区间外的回边（主流程上下文不进分支）。另有编辑器即时检查复用 `collectBackEdges`（无 guard 环标红）+ 不可达节点（复用入边校验）。
- **loop 容器**：纯编辑器构造。GraphSpec 增可选 `containers?: Array<{id,label,nodeIds[]}>`（序列化元数据，向后兼容——validateGraphSpec 对它只做引用存在性校验）；容器框内子图照常是 nodes+edges，环由守卫回边表达（DAG 布局不破环的规避法，spec §7 原案）。执行叠加：RunGraphCanvas 按容器元数据画框 + 迭代徽标（node.completed 计数已有）。
- **GraphSpec 元数据扩展**（向后兼容可选字段）：`description?: string`、`meta?: { goal?, cron?, permissionLevel?, sensitivePaths?: string[], worktreePolicy?: 'auto'|'manual'|'shared', gateCommands?: string[] }`。模板语义随实例化（T6 台账）：创建 loop 时 payload 带 `template: specId`，服务端从 specStore 取 meta 合成 goal/权限档/敏感清单/worktree 策略进编译选项；模板卡显示 description（替代种类级文案）。
- **Always allow 按类型记忆**：审批面板(A2 fleet 审批 UI 重建处)加"始终允许此类操作"——localStorage `alwaysAllow: Record<nodeType, true>`，ApprovalPanel 渲染前查表命中即自动 resume 并留痕(approver='always-allow:<user>')；服务端不改动（留痕经既有 approver 字段）。
- **编辑器 UI**：`custom/client/loop/orchestrator/` 新模块（SpecEditor.vue + palette/inspector/warnings 子组件），vue-flow 复用 RunGraphCanvas 既有模式（零新依赖）。OrchestrateView 增"空白画布新建"入口；自建 spec 可编辑、loop 编译模板只读（服务端 spec 带 `origin:'editor'|'template'` 判定——specStore 源头区分，编辑器保存的 spec 打 origin 标）。

## 任务表

| # | 任务 | 域 | 要点 |
|---|------|----|------|
| T1 | GraphSpec 元数据 + analyzeGraphSpec 死图检测 | server | description/meta/containers 字段 + validate 兼容 + 四条警告 + 单测 |
| T2 | spec-runtime：编辑器节点注册表 + plan 节点 | server | human/function/gate/condition/fanout/converge/plan 工厂；plan 三出口 interrupt 握手 + 单测 |
| T3 | spec-runtime：fan-out/converge + 起跑链路 | server | Send 并行变体 + join 收集 + 人选/谓词选优；hydrate→register→startRun；`POST /api/graph/specs/:id/runs` + REST 单测 |
| T4 | REST 深化：保存校验 + 删除 + origin | server | POST specs 过 validateGraphSpec(400 带结构化错误)；DELETE specs/:id(仅 origin=editor)；specs 列表带 description/origin |
| T5 | 模板语义随实例化 | server+client | loop create 带 template→meta 合成(goal/权限档/敏感清单/worktreePolicy/gateCommands)；SpecCard description；三步弹层预填 goal |
| T6 | 编辑器画布 + 节点面板 + 配置面板 | client | vue-flow 编辑模式/拖入/连线/删边/节点配置表单/loop 容器分组 |
| T7 | 编辑守卫 + 导入导出 + 试跑闭环 | client | 实时警告渲染(无 guard 环红边/不可达灰/死图四条)、JSON 版本化导入导出、保存+试跑跳 run 详情 |
| T8 | RunGraphCanvas 容器框 + 迭代徽标 | client | containers 元数据画框 + node.completed 徽标（执行叠加） |
| T9 | A2 fleet 审批 UI 重建 + Always allow | client | 介入/运行详情的舰队审批卡（pending 列表+就地批准）;按类型记忆自动通过留痕 |
| T10 | 台账清偿：服务端批 | server | P2 #6/7/9/10/11/13/14/17 + P3 服务端项（saas-store 窗口/getEvents 语义分叉+taskId 端点/导出 limit/SQLite eid 升级用例） |
| T11 | 台账清偿：前端批 | client | P2 #20/21/23/25 + P3 前端项（翻页清 expandedRunId/nowTick/fetchRuns 错误/buildTodayPlan/SpecDetail computed/cron 文案/a11y/错误横幅/锚定新 loop/死代码×2/watchKanbanTasks/store.retro/scss import/router warn/KANBAN_STATUSES/iteration 注释/done 测试标题/跨视图批准留痕） |
| T12 | 台账大项与文档 | both | #24 layoutRunGraph 分层布局优化；#31 inject.mjs 校验前置；#32 上游文档债核对记录；A1 回退窗口关闭声明（README/spec）；T5 自动归档文档回写 |
| T13 | 终审 + 收口 | — | 全门禁（test/inject/build:full）+ 台账核销表更新 + 合 main |

## 不做（记台账）

- #24 虚拟化（只做分层布局优化，虚拟化待规模触发）
- Best-of-N 的 diff 两两对比可视化（人选列表含摘要即可，diff 视图远期）
- 协作编辑 / marketplace / 运行时验证节点（spec §11 明确排除）
- matrix-bot 事件面收敛、失败通知 5min 合并窗口（通知通道改造，独立期）

## 门禁

- 每任务：vitest 相关套件绿 + tsc 无新错
- 收口：`npm test` 全绿（≥1203 passed）→ `npm run clean && npm run inject`（patch 数以 series 为准）→ `npm run build:full` exit 0 → 合 main → 推 origin → 本机构建安装
