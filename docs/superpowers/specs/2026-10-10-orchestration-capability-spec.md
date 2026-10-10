# 任务协同图、任务工厂与容量分析——麦肯锡人机协同组织概念产品化（2026-10-10）

## 主旨

把两篇麦肯锡系文章的组织概念落成 SwarmStudio 的三个产品面：以「业务结果」为锚的任务协同图、完成 run 沉淀为可复用资产的任务工厂闭环、按执行者聚合的容量分析。三块共享同一条数据面改造（任务卡的依赖链接与人日估算随列表带出），各自独立交付、独立提交，2026-10-10 三提交合入 main。

受众：SwarmStudio 二次开发维护者。读完应能定位每块功能的代码入口、数据口径与已知边界，并在后续轮次中扩展（结构化决策边界、LLM 模块推断接线均为预留口）。

## 概念来源与映射

| 文章概念 | 产品面 | 入口 |
|---|---|---|
| Orchestration Chart（任务协同图）：一项业务结果如何由人、Agent、数据与控制点协同完成；风险设计与任务分工同时确定 | /app/board 新页签「任务协同」：根卡选择 + 任务链画布（人=蓝/Agent=紫/未指派=灰/控制点=橙描边）+ 五问侧栏 | `overlay/custom/client/ia2/views/orchestration/OrchestrationView.vue`，纯函数层 `ia2/api/orchestration.ts` |
| Agentic Mission Factory（智能体任务工厂）：任务→重设人机工作流→投产→沉淀可复用资产回共享底座 | 完成额 run 一键「沉淀为模板」：origin='factory' 入 specs 表、meta.factory 溯源、mission-templates 台账（保存即提交）、复用计数随模板起跑累加 | 服务端 `loop/graph/graph-rest.ts`（POST /api/graph/runs/:id/deposit-template）；客户端 RunDetailView 沉淀按钮 + 协同图第五问资产列 |
| 任务-能力-智能体地图 / 容量而非人数：分析单元从岗位到任务；AI 释放容量是组织设计变量 | 交付健康页签新「容量分析」节：按人估算人日/实际人日、Agent 承接人日、估算覆盖率 | 服务端 `governance/capacity-analytics.ts`（GET /api/governance/capacity/overview）；客户端 `kanban/components/CapacitySection.vue` |

文章要点（调研输入）：

- 文章一（AI组织进化论 2026-10-10，转述麦肯锡季刊《AI is changing work. Now it has to change the organization》）：组织结构图回答「谁向谁汇报」，任务协同图回答「这件事如何被完成」；协调型岗位五年增速约为一线岗位 1.5-2 倍，要看工作有没有被重新组织而不只看速度；任务工厂强调控制措施随流程设计、资产要能被下一项任务复用。
- 文章二（麦肯锡官方 2026-07-30《智能体驱动型组织：AI如何重写人力资源的底层逻辑》）：分析单元从岗位变成任务节点；能力编码为可复用资产（Prompt/SOP/Playbook/流程模板）；容量而非人数——AI 释放的容量（如客服约 40% 示意）是组织设计变量；治理成本随协调成本下降而上升，必须嵌入设计。

## 数据面改造（三期共用前置）

改造前任务卡列表 JSON 不带依赖链接与人日估算（实测 `hermes kanban list --json` 974 卡中 parents/estimate 字段全缺），两处根因分别修：

1. CLI 输出面：`runtime/hermes_cli/kanban_output.py` 的 `_TASK_DICT_FIELDS` 增 `estimate_days`/`estimate_meta`；`kanban.py` `_cmd_list` JSON 分支在连接存活期内用 `task_graph_contexts`（分块 ≤500）批量并入 `parents`/`children`。已随 `deploy-agent-runtime --apply` 同步运行时安装树。
2. 聚合快道：`custom/server/services/hermes/kanban-overview.ts` 的 `listTasksFast` 直读 SQLite 全行，本就带 estimate 列但丢链接——补 `task_links` 全表查询按 id 分桶挂回 parents/children，与 CLI 同口径。

## 三期设计与验证证据

### 一期：任务协同图页签（提交 7c269f97）

- 视图：根卡（无父有子）下拉选择 → VueFlow 画布分层布局（双延迟 fitView 防异步数据后到溢出视口，走查实锤后加）→ 右侧五问面板。
- 五问数据全部由既有 REST 组合推导（listTasks + autonomy-ladder + escalation pending + graph specs），零新增后端端点；纯函数（分类/控制点/根卡/树构建防环/五问/布局）单测 10 例。
- 口径诚实：人/Agent 用 `-agent` 后缀约定（面板脚注明示非权威 roster）；估算覆盖率如实展示，未估算卡不折算。
- 验证：浏览器走查 130 根卡可选、19 节点画布、DOM 断言视口零溢出；ia-views 页签数 10→11 断言更新；20/20 绿。

### 二期：任务工厂闭环（提交 6f04dc4e）

- `GraphSpec.origin` 扩 `'factory'`（editor POST 伪造拒绝，与 template 同保留）；`meta.factory` 记 sourceRunId/depositedAt/depositedBy/reuseCount。
- `POST /api/graph/runs/:id/deposit-template`：完成 run（含外部源 sim-*，事件流推导状态）→ 结构化校验后入 specs 表；治理注册表新 kind `mission-templates`（首写种子表头，保存即提交=变更审计）；台账失败不回滚模板，`registered=false + registryError` 如实告示。
- 复用计数：`POST /specs/:id/runs` 命中 factory 模板 reuseCount+1（best-effort；legacy 模式 501 不计数）。
- 客户端：RunDetailView 完成 run 显示「沉淀为模板」按钮 + 内联表单 + 结果条；协同图第五问分桶列 factory 模板（复用次数排序）与 loop 模板。
- 验证（端到端实测）：种入 e2e-factory-run（completed 外部源）→ 沉淀 `factory-mv21yw5ornfo` → 台账 aipaydev 仓提交 53216af 落盘 → 浏览器走查资产列/按钮/表单三面通过；守门 mission-factory 5 例。

### 三期：容量分析面板（提交 466d3226）

- 服务端 `GET /api/governance/capacity/overview?days=N`：SQLite 只读全库聚合（collectAssigneeStats 同源同法），按人输出估算人日/已交付人日/实际人日/在途卡数，汇总含覆盖率与 Agent 已承接人日。
- 客户端 CapacitySection：时间窗 7/30/90 切换 + 四汇总卡 + echarts 分组柱状（估算 vs 实际 Top12）。
- 口径诚实：估算仅任务拆解链路写入（覆盖率如实，实测 90 天窗 974 卡覆盖 0%——现网没有 decompose 卡，如实展示不造假）；实际人日为墙上时长上界口径，注脚随响应下发。
- 验证：假库聚合 2 例 + 实测端点（350.6 实际人日，Top3 aiteam-orchestrator/worker-coder/pay-fintech）+ 浏览器走查。

## 边界与明确不做（本轮）

- 不做结构化决策边界 schema（role-boundary 仍是注入 brief 的提示词文本）——留待协同图经真实使用验证后另议。
- 不接线 requirement→graph 编译器的 LLM 模块推断（现为关键词正则，北极星大件另立轮次）。
- 升级边未画上画布（escalation 与任务链的关联在五问面板以统计+示例呈现）。
- 人/Agent 识别的权威化（读 agent-roster.yaml）未做，`-agent` 后缀约定明示于两处 UI 脚注。

## 验证面清点

- vitest：orchestration 10 例 / mission-factory 5 例 / capacity 2 例 / ia-views 页签断言更新 / kanban-read-cache 回归——合计 45/45 绿。
- 浏览器走查（dev 8649 热更新链路）：任务协同页签（根卡/画布/五问）、运行详情沉淀按钮与表单、交付健康容量节（含滚动截图留档 /tmp/orch-*.png）。
- 运行时部署：`deploy-agent-runtime --apply` 三文件同步（kanban_db/kanban/kanban_output），CLI list JSON 四字段实测带出。
