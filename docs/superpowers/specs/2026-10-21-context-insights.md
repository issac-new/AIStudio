# 2026-10-21 context-insights — 全链路追踪与用量统计聚合（对标 dsh-context）

## 背景

以 `upstream/dsh-context`（DeepSeek Harness 第三方上下文插件，bowenliang123，v0.73.3+）为底层技术组件参考，完善 SwarmStudio 的会话内上下文透视与跨会话用量统计。两轮审计结论（2026-10-21）：

- dsh-context 核心方法 = **寄生宿主不可变事件流做 fold**（不自建采集管道），历史不落盘、按需重折；组成拆分是启发式估算（4 字符≈1 token），仅 provider usage/缓存命中为精确值；成本 client 端按 models.dev 价表算。
- SwarmStudio 底座已厚：Studio SQLite 逐 run 逐模型调用记 usage+成本（`session_usage`），messages 全量保留（含压缩快照），`/usage/rounds`、`/api/ide/compaction-trace`、token-meter 三投影、IdeContextBar/IdeMetricsPopover/IdeCompactionCard/IdeContextArchivePane 均已存在但**散落**。

差距不在埋点，在聚合与少数缺失面（逐请求组成趋势、Fleet 子树成本、跨会话热力图/组成环、历史请求还原）。

## 变更（范围 P1-P4，用户 2026-10-21 裁定全量；P5 Context Browser 不在本轮）

- **P1 会话内 Context 页签**：`IdeSidePaneTab` 新增 `context`（observe 组），新组件 `IdeContextPane.vue` 收编四件资产为分区卡片：①统计汇总（轮次/计费 token/成本/缓存率，数据=ideUsageApi `/usage/rounds`）②当前组成（复用 computeBreakdown+context-six-source，与 IdeContextBar 同源同值）③压缩留痕（复用 compaction-trace 端点与 compactthreshold 前瞻）④每轮用量表（复用 rounds-table）。ctxarchive 页签保持独立，context 页签放互链入口。零上游 patch。
- **P2 逐请求组成趋势**：服务端在 `custom/server/tokens/` 域新增 fold：以 messages 日志为不可变事件流，按消息序重折出逐轮组成序列（system/user/assistant/tool 四段，估算口径与前端 computeBreakdown 单一事实源对齐——抽公共模块供两端复用）；对齐 chat_compression_snapshots 压缩事件打标。REST 端点挂现有 tokens controller。前端在 context 页签内加 ECharts 堆叠柱（observe 组已有 echarts 依赖）。
- **P3 Fleet 子树聚合**：服务端按 `parent_session_id` 折子树，合并 Studio `session_usage` 成本与 hermes state.db 会话 token 列（复用上游 sessions-db 读路径）；返回「当前会话+父+子 agent」卡片数据。前端进 context 页签分区（无独立 tab）。
- **P4 UsageView 增强**：patches 新增（series 从 673 起）增强上游 `/hermes/usage` 页：活动热力图（复刻 G7 口径）、会话卡片列表（组成环+缓存率+成本，读 session_usage 聚合端点）、缓存命中率 KPI 卡。patch 面最小化：能 A 类挂的走 registries，只动必须动上游模板的部分。

## 决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 不引入 dsh-context 运行时依赖，只移植数据模型/口径/交互 | 框架不同（React+Cordis vs Vue+Pinia），直连无收益；且工作区规则禁改 upstream |
| D2 | 历史组成=重折 messages 日志推导，**不逐请求落组成快照** | 对标 dsh-context fold-over-log；快照方案写放大且动上游 schema，否决 |
| D3 | token 估算口径单一事实源：从 `custom/client/ide/utils/contextBreakdown` 抽公共包（client+server 共用） | 三不变量之「单一事实源」；避免前后端口径漂移 |
| D4 | 估算值必须带 ≈/估算标注，无遥测显示「无遥测」不显示 0% | 沿用 G4/ContextBar 诚实惯例；fail-soft 不造假 |
| D5 | ctxarchive 不并入 context 页签 | 21 页签整合时已裁定档案是知识组定位；互链足够 |
| D6 | P1/P2/P3 走 A 类（custom/），P4 才动 patches（673+） | patch 面最小化；改上游行为必须走 patches 的规则 |
| D7 | 参照仓 `upstream/dsh-context` 只读，语义对齐以其实测代码为准（audit 报告 2026-10-21） | spec 引用的 fold/口径细节见审计记录，不再复述 |
| D8 | P2 趋势用 CSS 堆叠条带，不引 echarts（原计划 echarts，实施时改） | 页签体积/主题一致性/jsdom 可测；dsh 用 canvas 属其框架惯例 |
| D9 | P4 会话卡用 token 迷你条不做组成环（原计划环，实施时收敛） | 环需逐会话 fold 消息，12 卡 N 次 fold 不值；环留 P5 Context Browser 一并做 |
| D10 | P4 会话卡端点挂 /api/ide/usage-insights/sessions（patch 484 既有路由），patch 673 仅 UsageView 两行挂载 | patch 面最小化 |

## 验证

- 组件：`npx vitest run custom/client/ide/__tests__/`（新 pane 用例：分区渲染/无遥测失败态/互链 testid；mock `../api/usage` 与 auth-fetch）
- 服务端：`npx vitest run custom/server/tokens/__tests__/`（fold 序列正确性/压缩对齐/空会话 fail-soft）；新增服务端模块跑 `npm run typecheck:harness`（新模块已登记进脚本清单）
- UI 走查：`npm run dev`（8649）浏览器验证 context 页签金路径 + 无遥测/无压缩/大会话三边缘态（默认热更新验证，不装机）
- 合并前 `npm test`；P4 patch 跑 `npm run inject` 确认全 series 干净应用（673 已 `git apply --check` 实测通过）

## 实施记录（2026-10-21）

- P1-P4 全部落地于 `feat/context-insights` worktree（overlay/.claude/worktrees/context-insights）
- 分支提交：P1+P2 / P3 / P4 三笔；测试：ide pane 10 用例、server fold/控制器 25 用例、governance 5 用例、守门更新（21→22 签 ×3 处）
- 实施中修复：fold run 边界收口时序 bug（当前消息先入桶再收口导致柱含下轮首条）；fleet BFS 环死循环（visited 集合）——均有测试锚定
