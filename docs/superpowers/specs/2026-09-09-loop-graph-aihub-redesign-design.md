# Loop Graph 驱动的「AI 协作中心」彻底重构设计

- **日期**：2026-09-09
- **状态**：已评审（用户确认 11 节设计）
- **分支**：`feat/loop-graph-aihub-redesign`
- **前置调研**：三路并行调研（Loop 引擎现状 / Cockpit 组织形式 / 业界 loop graph 方案），结论已融入本文

---

## 0. 一句话定位

把“固定五阶段循环引擎 + 三栏驾驶舱”重构为：**以可编排、可有限终止的 loop graph 为唯一执行与组织主干**的 AI 协作中心——图既是自动化定义（编排器画布），也是运行实况（执行图），也是审计证据（时间轴回放）。

## 0.1 用户已确认的三个方向决策

| 决策点 | 结论 |
|---|---|
| 重构范围 | 图中心全面重构 + 可视化编排器（分期交付） |
| 状态存储策略 | append-only 执行事件日志为唯一事实源；Matrix/PG 适配器降级为投影 |
| UI 骨架 | 信息架构从零重排（六区域导航，取代三栏驾驶舱） |

---

## 1. 总体架构（四层）

```
┌─ 前端 (Vue3) ──────────────────────────────────────────────┐
│ 编排器画布(Vue Flow) │ 运行中心(执行图+回放) │ 介入收件箱 │ 工作项 │ 观察者 │ Chat │
├─ 服务 (Koa) ──────────────────────────────────────────────┤
│ graph REST + Socket.IO /graph namespace（updates/custom 双流）│
│ 编译器: LoopInstance→GraphSpec │ 调度器(run spawner) │ 中断闭环 │
├─ 内核 (纯 TS, custom/server/graph/) ──────────────────────┤
│ 守卫回边图运行时(BSP) │ 四层终止 │ channel+reducer │ interrupt │
├─ 存储 ────────────────────────────────────────────────────┤
│ 执行事件日志(SQLite, append-only, 事实源) → checkpoint 快照 │
│ 投影: Matrix 通知 / PG 计费 / UI 实况                        │
└────────────────────────────────────────────────────────────┘
```

关键决策：**不是重写，是把现有 `custom/server/loop/graph/` 内核（已完成约 50%，有测试）补完并提升为顶层模块** `custom/server/graph/`，让它从“旁路实验”变成唯一执行主干；`LoopEngine.tick` 退役，五个阶段函数化为真实节点。

### 1.1 现有资产盘点（调研确认）

| 资产 | 现状 | 处置 |
|---|---|---|
| `loop/graph/graph-runtime.ts`（440 行 BSP 执行器） | 核心可用：super-step、条件边、interrupt、Send、maxSteps、retry | 提升为顶层内核，补 resume/fail-branch/join 屏障 |
| `loop/graph/types.ts`（channel+reducer+12 事件） | 完整 | 扩展：守卫回边类型、__remainingSteps、事件 kind |
| `loop/graph/graph-definition.ts`（GraphBuilder 链式 API） | 完整 | 保留 + 新增 JSON 序列化往返 |
| `loop/graph/checkpoint-manager.ts` | 约 30%（只发事件不存状态） | 重写为日志驱动的真 checkpoint |
| `loop/graph/node-registry.ts` | 骨架（4/5 是 stub） | 补全 5 种节点工厂 |
| `loop/graph/loop-to-graph.ts` | 只读投影（no-op 节点） | 升级为真编译器（节点调用真实阶段函数） |
| `loop/engine/*`（verifier/dispatcher/worktree/connectors 等 15 个模块） | 可用但有断链 | 节点化复用；修复四大断链 |
| 前端 `loop/graph/GraphRenderer.vue`（通用 DAG 渲染器） | 孤儿组件，未接线 | 升级为 Vue Flow 底座 |
| 前端 `cockpit/`（34 组件 + 1638 行 store） | 三栏驾驶舱 | 按新 IA 重组；adapter 层全部保留 |
| `loop/engine/matrix-bot.ts` | 仅测试装配 | 成为事件日志的 Matrix 投影订阅者 |

---

## 2. 图模型与有限终止语义（内核）

### 2.1 GraphSpec（可 JSON 序列化，函数零内联）

```typescript
interface GraphSpec {
  id: string;
  version: number;                    // 定义版本（编辑演进）
  channels: Record<string, ChannelDef>; // {reducer: 'overwrite'|'append'|'merge'|'max'|'min', default?}
  nodes: NodeSpec[];
  edges: EdgeSpec[];
  entryNode: string;
  endCondition?: PredicateExpr;       // 声明式谓词，运行时求值
  limits: { maxSteps: number; maxCost?: number; maxDurationMs?: number };
}

interface NodeSpec {
  id: string;
  type: 'loop-phase' | 'agent' | 'tool' | 'human' | 'condition' | 'subgraph' | 'loop-container';
  config: Record<string, unknown>;    // 注册表类型 + config，运行时装配函数
  retry?: { maxAttempts: number; backoffMs: number };
  timeoutMs?: number;
}

interface EdgeSpec {
  from: string;
  to: string;
  condition?: PredicateExpr;          // 条件边
  guard?: LoopGuard;                  // 回边守卫（to 是 from 的祖先时必填）
}

interface LoopGuard {
  maxIterations: number;              // 循环安全网
  breakCondition?: PredicateExpr;     // 提前退出表达式
}
```

**编译期校验**：任何回边（`to` 是 `from` 在静态拓扑上的祖先）必须携带 `guard`，无 guard 的环直接拒绝。这是“DAG 形式、可有限终止”的形式化保证。

### 2.2 四层终止防御

| 层 | 机制 | 说明 |
|---|---|---|
| L1 | 条件边退出 | 正常路径：谓词满足走出口节点 / `end` |
| L2 | 回边 guard | `maxIterations` + `breakCondition`；每条回边自动注入迭代计数 channel（`__iter:<edgeId>`） |
| L3 | 图级预算 | `maxSteps`（默认 100）；剩余步数注入节点可读 state（`__remainingSteps`），预算临尽时节点可主动路由到总结/降级节点，而非只会抛错 |
| L4 | 成本/时长守卫 | `recordCost` 真实接线（修复现有 `stats.totalCost` 断链），超限熔断 |

### 2.3 状态模型

- 共享 state + per-key reducer（保留现有 5 个内置 reducer）。
- **loop-container 节点**额外获得作用域化循环变量 channel（`loop.<nodeId>.*` 前缀隔离），外层图状态不被污染——对齐 Dify 循环变量作用域语义。
- 节点返回 `NodeResult { update?, goto?, interrupt?, end?, send? }`（现有类型保留）。

### 2.4 运行时（super-step BSP，现有实现为基础）

保留 `graph-runtime.ts` 的 Pregel 式主循环，补齐四处残缺：

1. **join 屏障**：节点有多个入边时，默认等全部前驱在当前“代”完成后才激活（DAG 正确性前提）；可通过节点 config 关闭（任意前驱即触发）。
2. **fail-branch**：节点配置 `onError: { type: 'fail' } | { type: 'goto', target } | { type: 'retry-goto', target, maxAttempts }`。
3. **真 resume**：从 checkpoint 恢复 ChannelStore + nextNodes + pendingInterrupts，注入 `Command(resume=value)` 继续执行（见 §3/§4）。
4. **Send 真并行**：map 任务按 super-step 并行执行而非内联 await。

谓词表达式语言（PredicateExpr）采用受限 JSON DSL（`{op, path, value}` 组合，and/or/not 组合），不做任意代码求值——安全且可序列化。

---

## 3. 事件日志为唯一事实源

### 3.1 执行事件日志

- **存储**：append-only，SQLite（复用上游 server 既有 SQLite 基建），单表 `graph_events`：

```sql
CREATE TABLE graph_events (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     TEXT NOT NULL,
  graph_id   TEXT NOT NULL,
  ts         INTEGER NOT NULL,
  kind       TEXT NOT NULL,   -- run.started/run.completed/run.failed/run.continued
                              -- node.started/node.completed/node.failed/node.skipped
                              -- edge.taken/interrupt.raised/interrupt.resumed
                              -- checkpoint.saved/cost.recorded
  node_id    TEXT,
  iteration  INTEGER,         -- 回边迭代代数（同节点多次执行用 (node_id, iteration) 索引）
  super_step INTEGER,
  payload    TEXT NOT NULL    -- JSON: stateDelta / status / cost / error / interrupt payload
);
CREATE INDEX idx_graph_events_run ON graph_events(run_id, seq);
CREATE INDEX idx_graph_events_node ON graph_events(run_id, node_id, iteration);
```

- **checkpoint = 定期物化快照**（channel 状态 + nextNodes + 各回边计数器 + superStep），表 `graph_checkpoints`；日志仍是事实源，快照可随时删除重建。
- **GraphDef/GraphSpec 持久化**：GraphSpec 是纯 JSON 直接存表 `graph_specs`（含 version）；函数在运行时装配（node-registry 按 `type + config` 重建）。

### 3.2 一份日志支撑四种能力

1. **崩溃恢复**：重放 run 日志，跳过已 `node.completed` 的节点。
2. **执行历史与回放**：时间轴 = 日志按 ts/superStep 投影。
3. **任意点 fork**：选定 seq，重放到该点得 state，注入新 run 继续（time-travel）。
4. **HITL 恢复**：`interrupt.raised` 时 run 挂起（checkpoint 落盘），`interrupt.resumed` 携带值续跑——暂停数天无成本。

### 3.3 长循环治理（continue-as-new 桌面版）

每个 run 设日志条数上限（默认 10_000）；超限自动“续跑新 run”：发 `run.continued`（携带新 runId + 继承的 checkpoint），旧 run 正常闭环为 `continued` 状态。外部 UI 经 `graph_id` 关联整条 run 链。

### 3.4 投影而非双写

现有 `LocalStore/MatrixStore/SaaSStore` 三适配器的**一等存储地位取消**：

- **matrix-bot** 保留并接入事件总线：订阅日志事件 → 发 Matrix 通知（m.loop.notification），职责不变。
- **SaaSStore（PG）** 保留为计费投影：billing 模块消费日志聚合租户费用。
- **LocalStore** 退役（文件 STATE.json/STATE.md 由导出功能替代）。
- 旧 `m.loop.state` 房间事件停止写入，但迁移工具保留可读。

---

## 4. 人工介入（HITL）闭环

统一现有三套断链机制（Verifier HumanGate / graph interrupt / TeamApprovalManager）为一条路径：

```
human 节点 / interrupt()
  → 运行时发 interrupt.raised，run → awaiting-input，checkpoint 落盘
  → Socket.IO /graph 推送 + 介入收件箱落条
  → 桌面通知 + Matrix 通知（双通道）
  → 用户 REST POST /api/graph/runs/:runId/resume { value }
  → 从 checkpoint 恢复，Command(resume=value) 续跑
  → interrupt.resumed 入日志
```

**循环内 HITL**（竞品空白，Dify issue #32453 至今未支持）：human 节点可放在 loop-container 内，每轮迭代触发审批——本产品“人机协作驾驶舱”定位的核心差异化能力。

- interrupt 带超时策略（默认 72h，超时走 `onTimeout: escalate | auto-approve-with-log | fail`）。
- 现有 `POST /api/loop/contracts/:id/approve` stub 删除，由 resume 端点统一承接。

---

## 5. “循环”语义重定义

旧 Loop 的两个概念拆开：

- **图内循环** = 守卫回边（§2），单次 run 内。
- **图重入（recurrence）** = 调度器（cron / webhook / 手动）对同一 GraphSpec 发起新 run——五阶段 scheduling 阶段的本质。

**停止条件真实化**：每个 run 末尾由 stopCondition 评估节点（`condition` 类型，config 支持可编程谓词或 LLM judge 委托）判定是否继续重入；判定结果写入 channel 供调度器读取。替换现有占位启发式（`checkStopCondition` 只查契约状态，从不评估 `loop.stopCondition` 字段）。

调度器收敛为单一实现：现有 `CentralizedScheduler`（30s 轮询 `nextTickAt<=now`）升级为 run spawner；`Scheduler`（per-loop setTimeout）退役——集中轮询崩溃恢复语义天然正确（进程重启后从存储恢复到期 loop 继续触发），setTimeout 则丢。

---

## 6. 五阶段兼容与编译器

`loop-to-graph.ts` 从只读投影升级为**真编译器**：

```
LoopInstance ──compile──> GraphSpec
  discovery   → node(loop-phase, {phase:'discovery'})   调 connectors×3
  handoff     → node(loop-phase, {phase:'handoff'})     调 worktree+dispatcher
  validation  → node(loop-phase, {phase:'validation'})  调 verifier（注入 judge/human deps）
  persistence → node(loop-phase, {phase:'persistence'}) 真实副作用（见下）
  (无)        → node(condition, {evaluator:'stopCondition'})
  repair      → 守卫回边 validation→handoff {guard:{maxIterations: maxAttempts}}
  next-tick   → 不重入图内循环，由调度器按 run 重入
```

### 6.1 四大断链修复（P1 一并完成）

| 断链 | 修复 |
|---|---|
| stopCondition 从不评估 | condition 节点 + LLM judge/谓词求值（§5） |
| persistence 零副作用 | persistence 节点真实执行：产物写 kanban 任务 / git commit / PR（连接器） |
| `stats.totalCost` 无写入 | runtime 每节点完成发 `cost.recorded`，BudgetGuard 订阅日志 |
| 人工审批断链 | §4 闭环；生产装配为 Verifier 注入 callJudge + requestHumanApproval（经 interrupt） |

### 6.2 兼容策略

- 旧 LoopInstance 数据自动迁移为 GraphSpec + 首个 run（迁移脚本 `scripts/graph-migrate.mjs`）。
- 既有 `loop.*` Socket.IO 事件由编译产物的节点继续发出，旧前端无感过渡。
- **feature flag 双跑**：`GRAPH_ENGINE=shadow`（新旧同输入、对比事件序列）→ `GRAPH_ENGINE=on`（新引擎接管）→ 移除旧 tick 路径。`LoopEngine.tick` 在 P1 切换完成前不删除。

---

## 7. 可视化编排器（P4 新增）

- **画布**：Vue Flow——**零新依赖**（RunTraceGraph 已在用 vue-flow）。
- **节点面板**：agent / tool / human / condition / subgraph / **loop 容器节点**（Dify 式容器框，内部子图；序列化为“子图 + 守卫回边”，规避 DAG 布局器破环问题）。
- **编辑守卫**：无 guard 环即时标错、无入口/无终止配置拦截、GraphSpec 版本化导入导出（JSON）。
- **执行叠加**：同一画布既是编辑器又是实况视图——节点状态着色（idle/running/done/failed/awaiting-input）、循环容器显示迭代进度徽标、活跃边动画、点击节点打开节点检查器。

---

## 8. 新信息架构（从零重排，P3）

登录后一级导航六个区域，取代三栏驾驶舱：

```
【总览】注意力收件箱 + 活跃运行总览 + 今日日程        （收编 Notify/Schedule 弹窗）
【编排】图模板库 + 编排器画布                          （P4 落地；P2 先只读展示）
【运行】运行列表 → 单次运行详情 = 执行图 + 时间轴回放 + 事件流 + 节点检查器
        （RunTrace 收编为回放模式；证据分层 L1/L2 保留）
【介入】interrupts / 审批队列，桌面 + Matrix 双通道      （原收件箱升级为一等区域）
【工作项】Kanban 看板（保留），任务与 run 双向关联：
        run 的 persistence 节点产出任务；任务可发起 run（彻底替代会话标题正则提取 taskId）
【沟通】Matrix 聊天升为一级区域（不再是 cockpit 内嵌子路由）
```

- **三图合一**：任务血缘图、Loop 五阶段图、RunTrace 证据图统一为一个图模型——执行图是源；任务血缘是跨 run/任务的关联视图；RunTrace 是 agent 会话事件在图上的投影。`runId/taskId` 进会话元数据（L2 hook），消灭正则缝合（`sessionTaskId.ts` 宽泛 fallback）。
- **观察者能力**（跨运行分析/成本/生命周期，含 TaskLifecycleView 孤儿组件）并入【总览】+【运行】聚合视图。
- **右栏节点检查器**：面板族 = A2UI 表单 / 终端（现有 PTY 面板）/ 文件（FilesPanel 同步模式）/ 审批 / 事件流，按选中节点类型渲染。

---

## 9. 旧资产处置

### 保留复用

- 15 个纯函数 adapter（run-trace-adapter 的 L1/L2 证据分层 + spawn/delegate/converge 边模型、event-adapter 五源归一、topology-adapter、fleet-adapter 等）。
- `useRunTrace`（改造为回放引擎的数据层）、`useKanbanTaskGraph`（任务×会话聚合——关联视图雏形）。
- 终端工具注册表 + PTY 面板、FilesPanel selectionSeq 同步模式、CockpitIcon、Pure Ink 主题、契约测试（`swarm-studio-contract.test.ts` 扩展覆盖图模型）。
- 五阶段引擎模块（connectors/verifier/dispatcher/worktree/budget-guard/stuck-detector 节点化复用）。
- GraphRenderer 作为 Vue Flow 升级的布局参考。

### 退役

- `LoopEngine.tick` 驱动（P1 双跑结束后删除）、硬编码 `LoopGraph.vue`、LocalStore/MatrixStore/SaaSStore 的一等存储地位。
- cockpit 模式切换双轨（`workspaceMode` × chatSubRoutes）——新 IA 路由优先，workspaceMode 消亡。
- 孤儿组件：`CockpitGraphNode.vue`、`CockpitChatPane.vue`、`CockpitFileTree.vue`/`CockpitFileNode.vue`、store 假终端 `terminalLines`、`setHistoryArchivedFilter` 空壳。
- `POST /api/loop/contracts/:id/approve` stub。

### 重组

- `store/cockpit.ts`（1638 行）按区域拆 slice：runs / inbox / tasks / orchestrator / observatory。
- `CockpitWorkspace.vue`（892 行）拆为节点检查器面板族。

---

## 10. 分期交付

| 期 | 内容 | 验收门禁 |
|---|---|---|
| **P0 内核** | `custom/server/graph/` 顶层模块：序列化 DSL、真 checkpoint/resume、守卫回边+四层终止、事件日志存储、interrupt 闭环、join 屏障、fail-branch、Send 真并行 | 内核单测全绿：回边循环有限终止、checkpoint 往返、中断恢复、日志重放、谓词求值 |
| **P1 切换** | 编译器 + 生产装配切换（patch 134 重接）+ 四大断链修复 + 适配器降级投影 + 旧数据迁移 + 调度器收敛 | 既有 loop 集成测试在编译产物上通过；双跑对比（新旧引擎同输入同事件序列）；`npm run build:full` 通过 |
| **P2 运行中心** | 运行列表/详情、执行图画布、时间轴回放、节点检查器、`/graph` Socket 流 | 端到端：创建 loop → 观察执行 → 介入审批 → 回放导出 |
| **P3 信息架构** | 新导航六区域、总览、介入收件箱、工作项关联、Matrix 升一级、观察者聚合、store 拆分、旧 cockpit 退役 | 契约测试扩展 + 全路由回归；旧 cockpit 路由下线 |
| **P4 编排器** | 画布编辑、节点面板、loop 容器、编辑守卫、模板库、导入导出 | 从空白画布拖出“循环内含审批”的图并成功运行 |

## 11. 风险与对策

- **最大风险是 P1 装配切换**：feature flag 双跑（§6.2），对比事件序列一致后才切默认；双跑期间旧路径不删。
- **overlay 纪律**：全部改动落在 `overlay/custom/` + 新增 patch，上游零污染；B 类 patch 预计新增（路由重排、`/graph` REST/Socket 挂载）走既有 series 体系。
- **范围控制**：P4 编排器只做画布编辑 + 模板，不做 marketplace / 协作编辑等远期项。
- **循环内成本失控**：L4 成本守卫 + `__remainingSteps` 优雅降级 + loop-container 迭代徽标，三重可见性。
- **SQLite 长循环膨胀**：§3.3 continue-as-new 上限 + checkpoint 快照定期压缩日志区间。
