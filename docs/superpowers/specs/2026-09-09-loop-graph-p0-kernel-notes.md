# Loop Graph P0 内核笔记（供 P1 计划引用）

- **日期**：2026-09-09
- **状态**：P0 已收口（Task 1-8 全部完成并审查通过）
- **分支**：`feat/loop-graph-aihub-redesign`
- **母文档**：`2026-09-09-loop-graph-aihub-redesign-design.md`（下称 spec）；本文只记 P0 落地事实与 P1 接线面，不重复 spec 的论证

---

## 0. 一句话结论

P0 交付了一个纯 TS、零新依赖的图执行内核：GraphSpec 可序列化 DSL + super-step BSP 运行时 + 四层终止 + append-only 事件日志（`node:sqlite` 内置驱动）+ 真 checkpoint/resume/fork + HITL interrupt 闭环 + Run 注册表（GraphService）。P1 要做的是"接线"：编译器、生产装配、调度器收敛、REST/Socket 真实化，内核本身不再需要结构性改动。

## 1. 模块地图（`custom/server/loop/graph/`，11 文件）

| 文件 | 职责一句话 |
|---|---|
| `types.ts` | 全部类型：GraphDef/NodeDef/EdgeDef、StateSchema（per-key reducer × 5）、NodeResult、GraphEvent 联合、LoopGuard/NodeErrorRoute/JoinMode |
| `predicate.ts` | PredicateExpr 声明式谓词求值（cmp/and/or/not/truthy/exists），纯 JSON 可入库，无任意代码求值 |
| `graph-spec.ts` | GraphSpec DSL 定义 + hydrate（Spec + NodeRegistry → GraphDef）+ 回边守卫编译期校验（无 guard 的环直接拒绝） |
| `graph-definition.ts` | GraphBuilder 链式 API（代码内建图的另一入口，与 Spec 路径共用校验） |
| `node-registry.ts` | 节点类型注册表（loop / function / human / retrieval / subgraph），hydrate 时按 `type + config` 装配函数 |
| `channel-store.ts` | 分通道状态存储，每个 state key 独立 reducer，并行写不互相覆盖 |
| `graph-runtime.ts` | super-step BSP 执行器：并行调度、join 屏障、守卫回边、fail-branch、interrupt、Send 并行、成本/时长熔断、事件落日志 |
| `event-log-store.ts` | EventLogStore：append-only 事件 + checkpoint 快照读写；InMemory / Sqlite 双实现 + `createEventLogStore(path)` 工厂 |
| `checkpoint-manager.ts` | EventLogStore 之上的检查点薄封装：真快照读写 + fork（复制指定 superStep 检查点到新 run，记 `run.forked`） |
| `graph-service.ts` | 进程内 Run 注册表 + start/resume/fork 闭环 + 事件订阅 + replayRun 回放数据层；不含 HTTP |
| `loop-to-graph.ts` | LoopInstance → GraphInstance 只读投影（P0 现状；P1 升级为真编译器，见 §5） |

## 2. GraphSpec 最小示例（五阶段循环）

对应 spec §6 编译目标形态：五节点链 + validation→handoff 守卫回边（repair）+ 出口条件。

```json
{
  "id": "loop-five-phase",
  "version": 1,
  "channels": {
    "goal":      { "reducer": "overwrite" },
    "artifacts": { "reducer": "append" },
    "lastError": { "reducer": "overwrite", "default": null }
  },
  "nodes": [
    { "id": "discovery",   "type": "loop-phase", "config": { "phase": "discovery" } },
    { "id": "handoff",     "type": "loop-phase", "config": { "phase": "handoff" } },
    { "id": "validation",  "type": "loop-phase", "config": { "phase": "validation" } },
    { "id": "persistence", "type": "loop-phase", "config": { "phase": "persistence" } },
    { "id": "stop-check",  "type": "condition",  "config": { "evaluator": "stopCondition" } }
  ],
  "edges": [
    { "from": "discovery",   "to": "handoff" },
    { "from": "handoff",     "to": "validation" },
    { "from": "validation",  "to": "persistence" },
    { "from": "validation",  "to": "handoff",
      "condition": { "op": "truthy", "path": "lastError" },
      "guard": { "maxIterations": 3, "breakCondition": { "op": "cmp", "path": "fatal", "cmp": "eq", "value": true } } },
    { "from": "persistence", "to": "stop-check" }
  ],
  "entryNode": "discovery",
  "endCondition": { "op": "cmp", "path": "stopCheck.verdict", "cmp": "eq", "value": "done" },
  "limits": { "maxSteps": 100, "maxCost": 5, "maxDurationMs": 3600000 }
}
```

要点：回边（`to` 是 `from` 的静态祖先）必须带 `guard`，缺 guard hydrate 即拒；`next-tick` 重入不进图内，由调度器按 run 重入（spec §5）。

## 3. 四层终止对照表（P0 落地实况）

| 层 | 机制 | P0 实现位置 | 超限行为 |
|---|---|---|---|
| L1 | 条件边退出 / `endCondition` 谓词 | runtime `computeNextNodes` + 主循环出口判定 | 正常完成（`run.completed`） |
| L2 | 回边 guard：`maxIterations` + `breakCondition` | runtime 回边计数（`iterCounters["from->to"]`，随 checkpoint 持久化、fork 复制） | 超上限丢边并发 `edge.guard-exceeded`；break 命中发 `edge.break` |
| L3 | 图级 `maxSteps`（默认经 GraphDef.maxSteps）；节点可读 `__remainingSteps` / `__iteration` | runtime 主循环 + 节点 state 注入 | 预算临尽节点可主动路由降级；耗尽判失败 |
| L4 | 成本/时长守卫：`budget.maxCost` + `maxDurationMs` | runtime 先于一切完成路径判定（F5）；节点完成发 `cost.recorded` | 熔断：run 失败，错误为人类可读文案 |

## 4. 事件 kind 全表

写入事件日志的 kind（runtime 经 `EVENT_KIND_MAP` 映射 GraphEvent → 日志 kind；checkpoint-manager 直写 `run.forked`）：

| kind | 含义 |
|---|---|
| `run.started` / `run.completed` / `run.failed` | run 生命周期 |
| `run.forked` | fork 派生（checkpoint-manager 写，携带基底 runId/superStep） |
| `node.started` / `node.completed` / `node.failed` | 节点生命周期 |
| `node.starved` | join 屏障下前驱失败导致节点饿死（不会被调度） |
| `node.error-routed` | fail-branch 路由（fail / goto / retry-goto） |
| `interrupt.raised` / `interrupt.resumed` | HITL 挂起 / 续跑（resume 值入 payload） |
| `checkpoint.saved` | 检查点落盘（interrupt 与 step 边界） |
| `edge.guard-exceeded` / `edge.break` | L2 守卫触发（带 iteration 计数） |
| `graph.step-start` / `graph.step-complete` | super-step 边界（回放投影用） |
| `graph.forked` | fork 的 GraphEvent（service 订阅链） |
| `cost.recorded` | 节点成本入账（L4 / BudgetGuard 数据源） |

spec §3.1 中的 `run.continued`（continue-as-new）、`node.skipped`、`edge.taken` **P0 未接线**：continue-as-new 属 P1 长循环治理，另两者待装配期按需补。schema 上的 `idx_graph_events_node(run_id, node_id, iteration)` 索引同样待 P1。

## 5. 存储决策：node:sqlite 内置驱动（Task 8 裁决，替代 brief 原方案）

- **裁决**：EventLogStore 的 SQLite 驱动用 Node 内置 `node:sqlite`（`DatabaseSync`），**不加 better-sqlite3 依赖**（上游 server 本就没有；`overlay/package.json` 零改动）。
- **依据**：本项目 Node ≥ 22（engines 声明 ≥ 23），`DatabaseSync` 已实测可用，仅打印一条 ExperimentalWarning；其 `exec/prepare/run/get/all` 与匿名 `?` 绑定是 better-sqlite3 的兼容子集，store 代码零 SQL 改动。
- **工厂语义**：`createEventLogStore(path)` 给路径（含 `:memory:`）→ Sqlite 实现；创建失败（路径不可写 / 模块不可用）→ `console.warn` 一次后降级 InMemory（Task 3 审查遗留：降级不许静默）。无路径 → InMemory。
- **已知边界**：`node:sqlite` 仍是 experimental 标记，Node 大版本升级时留意 API 变动；Electron 打包若内嵌 Node 运行时版本不同，工厂降级路径兜底。

## 6. P1 接线点（按装配面）

1. **patch 134（`134-loop-server-routes.patch`）装配改造**：LoopEngine → GraphService 切换；`GRAPH_ENGINE=shadow/on` feature flag 双跑（新旧同输入对比事件序列，spec §6.2），双跑期间旧 tick 路径不删。
2. **`loop-to-graph.ts` 升级为真编译器**：LoopInstance → GraphSpec，节点调真实阶段函数（connectors / worktree+dispatcher / verifier / persistence 副作用），含 R3 质量门禁 gate 节点内建（persistence→scheduling 之间）与四大断链修复（spec §6.1）。
3. **调度器收敛**：`CentralizedScheduler`（30s 轮询）升级为 run spawner（调 GraphService.startRun）；`Scheduler`（per-loop setTimeout）退役——集中轮询崩溃恢复语义天然正确。
4. **`controllers/graph.ts` stub 端点真实化**：`POST /api/graph/graphs/:id/tick`（当前回 ok 让客户端走 loop tick）、`/fork`（当前复制 LoopInstance 造假 fork）改走 GraphService；resume 端点统一承接 HITL（spec §4），删除旧 approve stub。
5. **`/loop` socket 事件桥接**：GraphService.onEvent → Socket.IO 推送；既有 `loop.*` 事件由编译产物节点继续发出，旧前端无感过渡（spec §6.2）。

## 7. P1 开工前必办（各任务审查台账汇总）

a. **fork 续跑路径定语义**（Task 7 审查）：`startRun` 第三参消费 `forkBase` + 以 `{forkedFrom, superStep}` 自动应答基底 checkpoint 首条 pendingInterrupt——补测试固定语义或裁剪，P2 UI 联调前必须有定论。
b. **注册表进程内存 → 重建**（Task 7）：run 注册表重启即丢（checkpoint/事件仍在 eventLog）；P1 HTTP 装配加"从 eventLog 重建 registry"路径。
c. **GraphService 三处收紧**（Task 7 minor）：startRun fork 分支校验 graphId 匹配；resumeRun 校验 interruptId ∈ pendingInterrupts；getRun 返回浅拷贝防外部改注册表。
d. **types.ts 旧 `Checkpoint` 死代码清理**（Task 5 minor）：`types.ts:156` 的旧 interface 已被 `StoredCheckpoint`（event-log-store.ts）取代，删除。
e. **joinLedger fork 隔离测试补强**（Task 5 minor）：fork 后两个 run 的 joinLedger 互不污染的专项用例。
f. **predicate/reducers 四处收紧**（Task 1/2 minor）：reducers 判定改 `Object.hasOwn`；`getPath` 原型链收口；`PredicateError.name` 补齐；and/or/not 结构校验。
g. **`estimateTickCost` 既有 bug**（loop 引擎 `budget-guard.ts:34`）：用 `loop.pattern`（'daily-triage' 等模板名）索引按成本等级（low/medium/high/very-high）建键的 costMap，永不命中、恒返回 1；`LoopInstance` 上根本没有成本等级字段（在 `PatternTemplate.costEstimate` 上）。P1 预算守卫接线时一并修（成本等级需落到 LoopInstance 或查模板表）。

**终审补记（2026-09-09 whole-branch review 新增，原 a-g 之外）**：

h. **interrupt 超时策略**（spec §4 承诺的 72h 默认 + onTimeout: escalate/auto-approve-with-log/fail）P0 未实现且此前漏列——human 节点 timeoutMs 是执行超时，不覆盖 awaiting-input 挂起态；需服务层时钟语义，属 P1 装配面。
i. **`graph_specs` 持久化表**（spec §3.1 承诺 GraphSpec 纯 JSON 存表含 version）P0 只有进程内 registerGraph；P1 编译器落地前必须补存储落点。
j. **偏差声明**：spec §2.2 L2 承诺的 `__iter:<edgeId>` 每回边迭代计数 channel，实现为节点级 `__iteration` 注入（语义近似、形态不同），本行即偏差声明。
k. **两个已探针实证正确但缺 committed 回归测试的交互**（终审探针验证过行为正确）：join-with-loop（循环体内 join 每代恰激活 1 次）、guard 计数跨 resume（不重置不多给）；P1 把探针固化进 guards 测试。另有 maxDurationMs 熔断与 retry-goto 计数两条无测试路径。
l. **Builder 动态边逃逸环检测**：`addConditionalEdge` 无 guard 参数，Builder 路径条件回边不过 build() 校验（hydrate/Spec 路径无此洞）；P1 给 addConditionalEdge 加 guard 参数。
m. **notes §5 一句不准确**："Electron 内嵌 Node 版本不同 → 工厂降级兜底"不成立——`node:sqlite` 是顶层静态 import，模块缺失时 import 即抛、工厂不会执行；engines >=23 下可接受，P1 改动态 import 或修正表述。
n. **node.starved 只在自然排空路径发出**；endCondition/hasEnd 完成路径下饿死的 join 不可观测——P1 声明语义或补发。

## 8. 门禁基线（P0 收口时）

- `npm test`：83 文件，611 过 / 6 skipped（Task 8 新增 node:sqlite 2 例后 613 过）；`npm run build` client 构建通过。
- server 侧 tsc 以注入后上游工程为准；Task 3 遗留的 better-sqlite3 动态 require / 类型注解 2 条报错随 Task 8 消除。
