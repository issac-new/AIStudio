# Loop Graph 任务台账（2026-10-31 复核）

日期：2026-10-31
状态：inventory-only
来源：P0-P4 设计/计划/台账、多视图设计、当前 `custom/server/loop/` 与 `custom/client/loop/` / `ia2/` 代码实测。
定位：把「文档说做了什么」与「代码现在有什么」对齐，给后续产品裁决与修复轮提供单一任务清单。本文件不是产品设计正本，不替代 `2026-09-09-loop-graph-aihub-redesign-design.md`。

## 变更

### 一、里程碑现状

| 里程碑 | 设计/计划 | 代码现状 | 判定 |
|---|---|---|---|
| P0 图执行内核 | `2026-09-09-loop-graph-aihub-redesign-design.md`、`2026-09-09-loop-graph-p0-kernel-notes.md` | `GraphRuntime`（`custom/server/loop/graph/graph-runtime.ts`）、`GraphService`、事件日志、checkpoint/fork、GraphSpec DSL 均在；graph e2e 测试存在 | 完成且活跃 |
| P1 生产切换 | `2026-09-09-loop-graph-p1-production-switch.md` | 编译器/装配/patch 202 均在；默认仍是 legacy（`graph-assembly.ts` 的 `GRAPH_ENGINE` 缺省），simharness 才默认 shadow | 完成，但生产默认 off |
| P2 运行中心 + R1 Brief | `2026-09-10-loop-graph-p2-runcenter.md`、`2026-09-10-loop-graph-p2-ledger.md` | 服务端与 Brief 投递存活；运行中心视图（`RunCenterView`/`RunDetailView`）于 2026-10-20 删除，`cockpit-hygiene.test.ts` 断言不存在 | 数据层完成；UI 面退役 |
| P3 新 IA | `2026-09-10-loop-graph-p3-ia.md`、`2026-09-10-loop-graph-p3-r4-checklist.md` | 六区域 IA 已被后续双视图/六阶段路由取代；走查清单多处锚点文件已删除 | 已交付后被取代 |
| P4 可视化编排器 | `2026-09-11-loop-graph-p4-orchestrator.md`、`2026-09-11-p4-research-findings.md` | 编辑器 `SpecEditorView` 与 vue-flow 画布存活；运行叠加层 `RunGraphCanvas`/`NodeInspector` 已删除 | 编辑器完成；运行详情/T8/T9 回归 |
| 多视图重构 | `2026-09-16-loop-graph-multiview-design.md`、`2026-09-16-loop-graph-multiview.md` | 2026-09-17 实施（merge `6383fa398`），2026-09-18/19 拆除（`d14557675`、`03e053e8c`）；当前无 scenes 目录 | 已实施后被整体取代 |
| 后续产品重构 | `2026-09-14-loop-cockpit-single-page-design.md`、`2026-09-23-loop-to-workflow.md` | 单页驾驶舱/3D 大脑/运行中心 UI 已删除；2026-10-24 又在工作台挂回 `LoopCreateWizard` | 产品面反复重建，文档未同步 |

### 二、任务台账

优先级：P0=主链路断/数据事实源风险；P1=已承诺能力缺失或安全/质量语义失效；P2=清理、规模、远期候选。状态按当前代码事实，不按旧文档状态行。

| ID | 任务 | 来源 | 当前代码事实 | 优先级 |
|---|---|---|---|---|
| LG-01 | 恢复 graph run 详情/回放/检查器入口（loop run、任务抽屉 RunLinks、编辑器试跑三条入口） | P2 Task 6/7、P4 验收 | 三条入口都跳 `ia2.runDetail`；该路由重定向 `/app/sim?run=`（`custom/client/ia2/routes.ts:479-486`），`SimCenterView` 只把 `run-sim-director-*` 当导演 run，其余图 run 无详情/回放面 | P0 |
| LG-02 | 运行中心 UI 去留裁决：恢复 peek/attach、业务阶段列、收件箱两态，或正式退役并改文档 | P2 计划、spec §7B.1 | `RunCenterView`/`RunDetailView` 已删；`store/runs.ts` 的 `archiveRun`/`pendingInboxRuns`/`fetchMetrics` 无生产消费者 | P1 |
| LG-03 | 审批面统一：拒绝原因、specified 指定人、always-allow | P2 #27/#28、P4 T9 | 服务端 `stampApproverIdentity` 有效；活跃 `useDecisionActions` 只发 boolean；带 comment/指定人的 `runcenter/ApprovalPanel.vue` 成孤儿 | P1 |
| LG-04 | 恢复运行导出 UI 入口 | P2 #30 | `GET /export` 与 `runRest.exportRun` 在，无视图调用 | P2 |
| LG-05 | GraphSpec 模板实例化与 meta 预览 | P4 T5、P3 T6 | 服务端 `body.template` 支持；`LoopCreateWizard` 不传 template、不展示 meta | P2 |
| LG-06 | 舰队审批专属 UI 重建或正式降级 | P4 A2 | `CockpitFleetGrid` 不存在；仅通知下拉/通用审批有 fleet 动作 | P2 |
| LG-07 | 运行/规格列表分页与静默截断 | P2 #21、P3 T6 | `SimOrchestrationView` 直接 `slice(0, 50)`，无总数/翻页 | P2 |
| LG-08 | 首拉失败错误横幅与空态互斥 | P3 T6 顺延 | 两者仍可同屏（`SimOrchestrationView.vue`） | P2 |
| LG-09 | 失活 metrics/mind/policy 面清理或挂回 | P3 T4/T8 | `aggregateMetrics`/`buildTodayPlan`/`getMind`/`buildTaskChain` 无生产消费者；`GraphEnginePolicyCard` 仅测试 | P2 |
| LG-10 | Triage 分诊、自动归档、收件箱两态 | P3 Task 5 | `InboxView` 只剩 Gatekeeper + 通用审批；TriageQueue/AlarmList/自动归档无 | P2 |
| LG-11 | 追溯矩阵（需求↔run↔任务↔验证轮次） | P3 Task 7 | 仅 `RunLinks` 任务→run 反查；`buildTaskChain` 无消费者 | P2 |
| LG-12 | loop run 与 workflow run 双面边界收敛 | `2026-09-23-loop-to-workflow.md` | 文档称 loop 创建入口退役，2026-10-24 又挂回 `LoopCreateWizard`；左栏 loop 行与 workflow 区并存 | P1 |
| LG-13 | judge 真实模型接线 | P2 #12 后续 | `createProductionVerifierDeps` 只注入 `requestHumanApproval`，不注入 `callJudge` | P1 |
| LG-14 | 实现 `loop`/`retrieval` 节点类型 | P0 notes §1 | 两个工厂仍 `throw ... not implemented (P1)` | P2 |
| LG-15 | subgraph 节点生产接线 | types 声明 | `subgraphRunner` 存在，但全仓无生产注入 | P2 |
| LG-16 | 停滞指纹注入 worktree git tip | spec §7B.3 | 装配只传 `makeLoopFingerprint(store)`，未传 `worktreeDir`，git tip 恒为 `no-wt` | P1 |
| LG-17 | `bridgeLoopEvent` 的 appendEvent 失败可观测/重试 | spec §3 | `void store.appendEvent(e).catch(() => {})` 静默吞错 | P1 |
| LG-18 | export limit 改为保留最新 N 条 | P4 §5.3 | `query(limit)` 是「最旧前 N」，超 10000 时截掉最新事件 | P1 |
| LG-19 | 统一 query limit/latest 语义 | P4 §5.3 | `latest` 已有，`limit` 仍 oldest-N | P2 |
| LG-20 | SaaSStore 持久化 `loop.template` | P4 §5.3 接受项 | INSERT 无 template 列，SaaS 重启丢模板溯源 | P2 |
| LG-21 | worktreePolicy/permissionLevel/sensitivePaths 执行面 | P4 T5、spec §7B.4/§7B.5 | meta 仅透传展示；`loop/types.ts` 明确「暂无执行面消费点」 | P1 |
| LG-22 | 节点级 restart | spec §7B.1 | 只有 run 级 fork/start，无节点级 restart | P1 |
| LG-23 | plan 三出口档位真正影响 agent 节点 | P4 架构决策 | plan 节点只写 `planDecision/planMode` 通道；agent 节点是占位，只登记 `agentRequest` 不派发 | P1 |
| LG-24 | 图引擎策略文件化/可下发 | P3 T8 | `GET /api/graph/engine` 只读；`GraphEnginePolicyCard` 无消费者 | P2 |
| LG-25 | matrix-bot 事件面收敛 + 失败通知 5 分钟合并 | P4 §5.2 | matrix-bot 无生产引用；director notify 即时发送，无合并窗口 | P2 |
| LG-26 | 自动归档文档回写 | P4 §5.2 | spec §7B.4 仍要求 Triage/自动归档，代码无实现 | P2 |
| LG-27 | 多视图遗留件清理或重新接线 | 多视图 T4/T5/T8 | `CockpitFilePanel`/`CockpitTerminalPane` 的 workspacePath 参数化无消费者；`aggregateByAssignee` 无消费者 | P2 |
| LG-28 | runcenter 孤儿组件/死适配器清理 | P2/P3/P4 残留 | `runcenter/ApprovalPanel.vue`、`useRunReplay.ts`、`buildRunGraph/projectEvents` 无生产消费者 | P2 |
| LG-29 | cockpit store 拆分 | P3 Task 8 | `shared/store/cockpit.ts` 仍 1669 行 | P2 |
| LG-30 | 文档/台账状态刷新 | 本台账 | 多视图设计仍「待实施」；P3 R4 锚点文件已删；P4 ledger 多条「已修」已回归；README 无 loop graph 声明 | P2 |
| LG-31 | 运行订阅域重审 | P2 #22 | boot 时只订阅 top-30 awaiting/running，超出不实时更新 | P2 |
| LG-32 | 审批节点双出口结构校验 | P4 调研候选 | `analyzeGraphSpec` 无审批出边计数 | P2 |
| LG-33 | Always allow 正则约束 + 命中预检 | P4 调研候选 | `always-allow.ts` 只有 nodeType→true 映射 | P2 |
| LG-34 | Triage Snooze / 并入已有 run | P4 调研候选 | 无 snooze/merge 代码 | P2 |
| LG-35 | gate 失败一键转 repair issue | P4 调研候选 | 有 repairQueue/回边，无 issue 自动拼装 | P2 |
| LG-36 | 节点级 rollback diff 边界隔离 | P4 调研候选 | 无节点 rollback | P2 |
| LG-37 | needs-input 陈旧态清扫 | P4 调研候选 | 只有本地归档 map API，无 UI/自动终态 | P2 |
| LG-38 | 大图虚拟化 | P4 计划「不做」 | 只有折行布局，无虚拟化 | P2 |
| LG-39 | Best-of-N diff 两两对比可视化 | P4 计划「不做」 | 只有人选/score 收敛 | P2 |
| LG-40 | 协作编辑/marketplace/运行时验证节点 | P4 范围外 | 未实现，保持范围声明 | 记录 |

### 三、文档与代码矛盾（需在各自修复轮回写）

| 矛盾 | 证据 |
|---|---|
| P4 ledger 称 #21/#23/#29/#30「已修」，对应视图/测试已随运行中心删除 | 删除提交 `250e058d9`；`custom/client/ia2/__tests__/cockpit-hygiene.test.ts` 断言不存在 |
| 多视图设计写「设计定稿待实施」，代码已实施后又拆除 | `2026-09-16-loop-graph-multiview-design.md:3`；merge `6383fa398`；拆除 `d14557675`/`03e053e8c` |
| P3 R4 走查锚点大量指向已删除文件 | `RunListTable.vue`、`RunCenterView.vue`、`InboxPanel.vue` 均不存在 |
| P4 §5.2 称自动归档文档已回写，spec 原文仍要求 Triage/自动归档 | `2026-09-09-loop-graph-aihub-redesign-design.md` §7B.4；`InboxView.vue` |
| 代码注释编号漂移：gate 折叠写成「P3 台账 #28」，实际 #19 | `custom/client/loop/runcenter/adapters.ts` |
| P0 notes 仍写 interrupt 72h 未落地，实际已实现 | `interrupt-timeout.ts` |

## 决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 本轮只出任务台账，不恢复运行中心 UI（LG-02 交产品裁决） | 运行中心 UI 于 2026-10-20 被产品删除；台账轮不能替产品做形态决定 |
| D2 | 优先级按「主链路断 > 已承诺能力 > 清理」排序，不按旧文档编号 | 旧编号体系跨 P2/P3/P4 已漂移，按代码事实重排更可执行 |
| D3 | 文档矛盾逐条列证据，不静默改旧 spec | 旧 spec 是历史决策记录；修正应在对应修复轮以新 spec 回写 |
| D4 | LG-01 建议优先修，但需先确认产品形态（恢复图详情还是把图 run 明确标为只读） | 三条入口的断链影响日常使用，但修复方式取决于运行中心去留 |

## 验证

- 本台账为只读盘点：2026-10-31 对 `custom/server/loop/`、`custom/client/loop/`、`custom/client/ia2/`、`docs/superpowers/plans/`、`docs/superpowers/specs/` grep/读码核验；未修改产品代码。
- 抽查锚点：`ia2/routes.ts:479-486` 重定向、`SpecEditorView.vue:230-232` 试跑跳转、`verifier-bridge.ts` 不注入 `callJudge`、`stagnation-fingerprint.ts` 可选 `worktreeDir`。
- 未验证：各条任务的运行时行为未逐项活体复现；优先级为静态代码判断。

## 设计文档影响

DESIGN_SYNC: none

理由：本文件是任务盘点台账，不改变产品设计、契约或数字总账；旧 spec 的矛盾不在此改写，按 D3 留给对应修复轮。附录 A 的索引登记由同批主 spec `2026-10-31-daily-research-absorption.md` 统一处理。
