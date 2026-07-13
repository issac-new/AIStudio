# 运行全过程可观测性落地分析

**日期**：2026-06-27
**分析依据**：量子位《别再只堆 Agent 了：清华团队把 Session 重新做成了多智能体系统的核心》（OpenRath，2026-06-16）
**适用项目**：SwarmStudio（`upstream/hermes-studio` + `overlay/`）

---

## 0. 结论先行（TL;DR）

文章的核心主张是：**把 Session 从"聊天历史"升格为多智能体系统的可观测层与控制层**——路由、复现、回滚、审计全在同一张带血缘的 Session Graph 上做。

本项目（SwarmStudio）**已经天然地走在同一条路上**，且在 UI 侧走得更远：Cockpit（驾驶舱）实质上就是文章所倡导的"控制平面"。差距不在架构方向，而在**证据链的完整性**：

| 文章主张 | 本项目现状 | 差距 |
|---------|-----------|------|
| Session 是证据载体（不只是聊天记录） | ✅ KanbanEvent + KanbanRun + message 三流归一为 CockpitEvent | ⚠️ 缺工具调用（tool_call）层证据 |
| Session Graph 是可观测层 | ✅ topology-adapter 已实现 task 血缘图 | ⚠️ 图的粒度是"任务"，不是"运行/工具步骤" |
| Sandbox 绑定 Session、可追溯执行位置 | ✅ WorkflowRunNodeSession 已记录 workspace | ⚠️ 副作用落点（diff/沙箱身份）未入图 |
| 持久、可路由的 Session 状态 | ✅ workflow_runs + node_sessions 持久化 | ⚠️ fork/merge/detach 血缘未建模 |
| "证据档案"而非"截图" | ⚠️ 偏向"任务管理 + 实时看板"，回溯能力弱 | ❌ 缺时间旅行/跨运行对比/导出卷宗 |

**落地路线建议**：不重写、不推翻，按"补证据链 → 升图粒度 → 强回溯"三步，把已有的 Cockpit 从"任务协作看板"升级为"运行时证据平面"。全部在 `overlay/` 内通过 patch + custom 组件实现，不触碰 upstream。

---

## 1. 文章核心论点提炼（与可观测性相关的部分）

文章可观测性相关论点可拆为五条，逐条对应系统设计决策：

1. **Agent 动了手，证据该存在哪**——一次工具调用的参数/结果、改仓库的 diff、沙箱身份、失败重试路径、批准/否决信号，散落在各自日志里无法"还原"，必须存在 Session 这张结构化证据载体上。

2. **Session 是路由的单位，Session Graph 是控制平面**——Agent 集群不是群聊，而是建立在持久 Session 状态之上的运行时控制平面。当前 Session 该交给哪个 Agent、看到什么上下文、在哪个沙箱跑，都在这张图上交汇。

3. **Session Graph 是动态图（define-by-run）**——由 fork/merge/detach 织出来的图，是 Agent 们跑起来一步步演化出来的，而非事先画死。它从"实现细节"升格为集群的**可观测层与控制层**：路由、复现、回滚、审计全在同一张图上做。

4. **Sandbox 与 Memory 是可插拔后端**——把"算在哪"从"算什么"剥离；工具跑在 Session 当前的 backend 上，返回的 Session 会记住自己的执行位置，不会悄悄漂移。

5. **目标是"证据档案"而非"截图"**——一个任务跑完的产物应是可回溯卷宗：issue 原文 → Session Graph → 调了哪些工具 → 副作用落在哪个 sandbox → 被否决的分支 → 最终采纳的补丁 → 测试结果 → Memory 写了什么。

---

## 2. 本项目现状摸底（可观测性资产盘点）

### 2.1 已有的"证据"数据底座（upstream，只读）

Cockpit 的可观测性建立在三层持久化数据之上，它们已具备文章所说的"证据载体"雏形：

| 数据层 | 文件 | 承载的"证据" | 与文章概念的对应 |
|--------|------|-------------|----------------|
| **Kanban 事件流** | `routes/hermes/kanban-events.ts`（WS）、`KanbanEvent{kind,payload,run_id,created_at}` | 任务生命周期事件（created/status_changed/assigned/dispatched/completed/blocked/`*_failed`），按 `run_id` 关联运行 | Session 的"事件 chunk" |
| **运行记录** | `KanbanRun{status,outcome,summary,error,worker_pid,started_at,ended_at}` | 单次执行的结果/摘要/错误/耗时/worker 进程 | Session 的"run chunk" |
| **会话消息** | `KanbanTaskMessage{role,content,timestamp}` + `session-store.ts` | Agent/人的对话原文 | Session 的"message chunk" |
| **Workflow 运行图** | `workflow-run-store.ts`：`WorkflowRunRecord{snapshot_nodes, snapshot_edges, status}` + `WorkflowRunNodeSessionRecord{run_id,node_id,session_id,agent,agent_mode,status,sequence,started_at,finished_at,error}` | **一次工作流运行 = 多节点会话**，节点会话映射到 agent + session + 执行顺序 | 这就是文章的 **Session Graph（运行时版）** |
| **Workflow 定义图** | `workflow-store.ts`：`WorkflowRecord{nodes,edges}` | 工作流编排拓扑（节点/边） | Session Graph（静态版/蓝图） |

**关键发现**：`WorkflowRunNodeSessionRecord` 已经把"哪个 agent、在哪个节点、绑哪个 session、第几步、状态、耗时、错误"持久化了——这正是文章所说"这个结论到底是哪个 Agent、走哪条分支、调哪次工具、在哪个 workspace 产出"的数据基础。**只是目前没有被 Cockpit 充分消费**。

### 2.2 已有的可观测性 UI（overlay/custom/client/cockpit）

Cockpit 已实现的四类可观测视图，全部由纯函数 adapter 驱动（可测、可复用）：

| 视图 | adapter | 现状 | 对应文章概念 |
|------|---------|------|-------------|
| **时序事件流** `CockpitTimeline` | `event-adapter.ts` `mergeDetail()` | 把 event/run/message/comment/log **五源归一**为按时间排序的 `CockpitEvent`，支持 actor 过滤、内容搜索、双击看详情 | 证据链的"时间维度展开" |
| **协作拓扑图** `CockpitGraphNode` + `CockpitCollabMap` | `topology-adapter.ts` `buildTopology()` | BFS 向上（祖先）/向下（后代）构建 task 血缘图，含 depth/折叠/person/channel/A2A-A2H 关系 | Session Graph（任务级血缘） |
| **历史回溯** `CockpitHistoryModal` | `history-adapter.ts` | 跨任务的时间线聚合（`/api/hermes/kanban/timeline`），支持时间/类别/状态筛选 | 回溯能力 |
| **注意力条** `CockpitAttention` | `attention-adapter.ts` | 阻塞/待审任务提醒 | 控制平面的"需要你"信号 |

**adapter 模式的价值**：所有可观测数据都是"异构源 → 纯函数归一 → 统一类型 → computed 派生"。这与文章"工具长什么样和工具干什么待在一起"的设计哲学一致——**数据的归一层是可观测性的地基，本项目这块地基已经打好**。

### 2.3 已有的执行信号通道

| 通道 | 机制 | 现状 |
|------|------|------|
| **实时流** | `handle-bridge-run.ts` 通过 Socket.IO emit；`recordBridgeToolStarted/Completed` 记录工具调用到消息 `tool_calls` 字段 | ✅ 工具调用有记录，但**埋在 message.tool_calls 里，未提升为独立可观测维度** |
| **Workflow 运行状态** | `workflow-manager.ts` emit `'status'`，`WorkflowRuntimeStatus{nodeSessions, status}` | ✅ 节点级状态有，但前端 Cockpit **未接 WorkflowRun 视图** |
| **Kanban 事件 WS** | `kanban-events.ts` 子进程 `watchEvents` → WS 推送 | ✅ 任务事件实时推送 |

### 2.4 三层联动（Cockpit 已有的"控制平面"骨架）

spec `2026-06-22-swarm-studio-cockpit-design.md` §6 定义的联动链：

```
注意力条待办项 ─┐
Kanban 任务 ────┼──→ selTask() → 左栏高亮 / 中栏面包屑 / 右栏文件树根=workspace / 右栏切工作项
协作图节点 ─→ 中栏时序流切换为该事项事件
时序事件节点 ─→ 右栏 A2UI 切换为该节点处理
历史事件 ─→ recall()：筛选三栏 + 归档只读态
```

这条联动链，本质就是文章所说"在同一张图上做路由、复现、审计"的雏形——**点节点→联三栏→可回溯**。Cockpit 的设计直觉与文章高度吻合。

---

## 3. 差距分析：从"任务协作看板"到"运行时证据平面"

把文章的"证据档案"清单拿来逐项对照，本项目缺的是**运行深度的证据**：

### 3.1 缺工具调用（tool_call）这一层证据

文章强调：一次工具调用的"参数 + 结果 + 副作用落点"是最有价值的证据链一环。

**现状**：`bridge-message.ts` 的 `recordBridgeToolStarted/Completed` 把 tool_call 记进了 `message.tool_calls[]`，但：
- `event-adapter.ts` 的 `mergeDetail()` **没有把 tool_calls 拆成独立的 CockpitEvent**——它们被折叠进了 message 的 `fullText`。
- 没有工具的**副作用落点**（改了哪个文件、diff 是什么、在哪个 sandbox 跑的）——文章把这列为证据档案的核心。

### 3.2 图的粒度是"任务"，不是"运行/步骤"

**现状**：`topology-adapter.ts` 的 `buildTopology()` 构建的是 **task 之间的 parent/child 血缘**（用 `task_links`），节点是 task。

**文章的图**：节点是 Session 的 chunk（一次工具调用、一个 Agent 的执行段），边是 fork/merge/detach。一次 run 内部的"Planner→Coder→Reviewer"流转不在图上。

**后果**：当集群规模上来，你问"这个结论到底来自哪次 run 的哪个节点的哪次工具调用"——task 级图答不了。

### 3.3 运行图（WorkflowRun）未被 Cockpit 消费

**现状**：`workflow-run-store.ts` 提供了 `listWorkflowRuns` / `listWorkflowRunNodeSessions`，但：
- 前端 cockpit store（`cockpit.ts`）**没有 import workflow run API**。
- `WorkflowRunNodeSessionRecord` 这张"运行时的 Session Graph"**完全没有在前端可视化**。

这是最大的浪费——文章说的"Session Graph 升格为可观测层"，本项目的数据底座已经备好了运行图，但 UI 还停在静态 workflow 定义图。

### 3.4 缺 fork/merge/detach 血缘建模

文章把 fork（分叉）、merge（合并）、detach（切断父链）当作 Session Graph 的核心操作，对应"被否决的那条分支"这种回溯场景。

**现状**：WorkflowRunNodeSession 有 `sequence`（执行顺序）但没有 `parent_session_id` / `forked_from` / `merged_into` 字段。任务级有 `task_links`，但运行级没有血缘。

### 3.5 缺"证据卷宗"导出与跨运行对比

文章的终态产物是"证据档案"：issue→Graph→工具→sandbox→否决分支→补丁→测试→Memory。

**现状**：Cockpit 偏"实时协作 + 任务管理"，历史回溯（`CockpitHistoryModal`）是**事件列表 + 筛选**，但不能：
- 把一次任务的完整运行轨迹导出为可追溯卷宗
- 跨运行对比（同一任务的两次 run 哪里不同）
- 回滚到某条分支重跑（文章的 rollback）

---

## 4. 落地设计：三步把 Cockpit 升级为运行时证据平面

遵循 `AGENTS.md`：**全部在 `overlay/` 内实现**，通过新 adapter + patch + custom 组件，不触碰 upstream。

### 第一步：补工具调用证据层（让证据链完整）

**目标**：把埋在 `message.tool_calls` 里的工具调用提升为时序流的一等公民。

#### 4.1.1 新增 `tool-event-adapter.ts`（纯函数）

**文件**：`overlay/custom/client/cockpit/adapters/tool-event-adapter.ts`（新增）

把 `KanbanTaskMessage.tool_calls[]` 拆解为独立的 `CockpitEvent`，source 新增 `'tool'`：

```ts
export interface ToolCallEvidence {
  id: string           // `evt-tool-${msgId}-${idx}`
  taskId: string
  actor: string        // 调用者 agent
  toolName: string     // 文章说的"给模型看的 name"
  args: string         // 截断的参数（文章说的"参数"）
  result: string       // 截断的结果（文章说的"结果"）
  sideEffect?: string  // 副作用落点（改了哪个文件 / sandbox 身份）—— 文章核心
  status: 'ok' | 'failed'
  ts: number
  source: 'tool'
}
```

关键：从 `bridge-message.ts` 已记录的 `tool_calls[].function.arguments` + `tool_call_id` 对应的 `tool` 角色消息 `content`（结果）提取。**需要 patch 078 级别的能力**——在 `getTask` 返回的 detail 里补全 tool_calls 与对应结果消息的配对。

#### 4.1.2 改造 `event-adapter.ts` 的 `mergeDetail()`

在现有 `[...events, ...runs, ...msgs, ...comments]` 基础上，追加 tool 源：

```ts
const toolEvents = (d.session?.messages ?? []).flatMap(m =>
  toolAdapter.fromMessage(taskId, m)  // 拆出每条消息的 tool_calls
)
return [...events, ...runs, ...msgs, ...comments, ...toolEvents].sort((a, b) => a.ts - b.ts)
```

#### 4.1.3 Timeline 组件呈现 tool 节点

`CockpitTimeline.vue` 的 `titleMap` 新增 `tool: '工具调用'`，并用不同 `data-source` 样式区分（已有 `:data-source` 属性机制）。双击查看完整 args/result/sideEffect。

**测试**：新增 `__tests__/tool-event-adapter.test.ts`（纯函数单测，沿用现有 adapter 测试范式）。

---

### 第二步：升图粒度——接入运行图（让 Session Graph 真正可观测）

**目标**：把已经持久化但未被消费的 `WorkflowRunNodeSessionRecord` 提升为 Cockpit 的可观测主图。

#### 4.2.1 新增 `run-graph-adapter.ts`（纯函数）

**文件**：`overlay/custom/client/cockpit/adapters/run-graph-adapter.ts`（新增）

把一次 `WorkflowRunRecord` + 其 `WorkflowRunNodeSessionRecord[]` 转成带血缘的拓扑：

```ts
export interface RunGraphNode {
  id: string           // node_session.id
  runId: string
  nodeId: string       // workflow 节点
  agent: string
  agentMode: string
  status: 'queued'|'running'|'completed'|'failed'|'blocked'|'canceled'
  sequence: number
  startedAt: number | null
  finishedAt: number | null
  durationMs: number | null
  error: string | null
  sessionId: string    // 关联到聊天页
  routeTarget: RouteLocationRaw  // → hermes.session?sessionId=&profile=
}
export interface RunGraphEdge { from: string; to: string; kind: 'sequence'|'fork'|'merge' }
```

血缘推导策略：
- **sequence 边**：`sequence` 相邻的 node-session 连边（最直接的运行时图）。
- **fork 边**（第二步可演进）：当 node-session 有 `forked_from`（需 patch 增字段，见第三步）时连边。
- 用 workflow 定义图的 `edges` 作为**蓝图层**叠加（哪些节点是编排上相连的）。

#### 4.2.2 新增 `CockpitRunGraph.vue`（中栏，复用现有图渲染）

**文件**：`overlay/custom/client/cockpit/components/CockpitRunGraph.vue`（新增）

复用 `CockpitCollabMap.vue` / `CockpitGraphNode.vue` 的渲染模式（绝对定位 + 拖拽 + 统一选中态）。区别：
- 节点显示 agent + status + 耗时（而非 task 标题）
- 节点颜色遵循 Pure Ink：仅 failed 用 error 红、running 用 warning（已有变量），其余灰度
- 点击节点 → 联动：中栏时序流切换为该 node-session 的事件、右栏切到该 session 的聊天

#### 4.2.3 接线到 store

`cockpit.ts` 新增：选中的"运行"维度。当 task 有关联 workflow_run 时，中栏协作图下方/替换为 RunGraph。需要新增 `overlay/custom/client/cockpit/api/run-graph-extras.ts` 调用 `listWorkflowRuns` / `listWorkflowRunNodeSessions`（这两端点 upstream 已有，见 `controllers/hermes/workflows.ts`）。

**这一步直接兑现文章核心论点**："Session Graph 从实现细节升格为集群的可观测层"——把已持久化的运行图搬到 UI 上。

---

### 第三步：强回溯——证据卷宗 + 分叉血缘（让"还原"成为可能）

**目标**：从"实时看板"补齐文章的"可追溯卷宗 + 回滚"。

#### 4.3.1 运行级 fork/merge 血缘建模（patch）

文章证据档案里"被否决的那条分支"需要血缘。`WorkflowRunNodeSessionRecord` 缺 `parent_session_id`。

**新 patch**：`overlay/patches/1xx-workflow-run-node-session-lineage.patch`

在 `WORKFLOW_RUN_NODE_SESSIONS_SCHEMA` 增字段：
```sql
parent_session_id TEXT,        -- fork 自哪个 node-session（null=根）
fork_reason TEXT,              -- 'retry' | 'rejected' | 'branch' | 'rerun'
merged_into TEXT               -- 合并到哪个 node-session
```
+ 对应 index。`run-graph-adapter.ts` 据此连 fork/merge 边，**可视化"被否决的分支"**。

#### 4.3.2 证据卷宗导出

**文件**：`overlay/custom/client/cockpit/components/CockpitRunDossier.vue`（新增）

按钮"导出运行卷宗"——把一次 task 的完整证据按文章清单聚合为 JSONL/Markdown：
```
issue/task 原文 → WorkflowRun 图 → 各 node-session → 每个工具调用(args/result/sideEffect)
→ 失败/否决分支(fork_reason=rejected) → 最终采纳补丁 → 测试结果(run.outcome/summary)
```
对应文章原文的卷宗清单，逐项映射到本项目已有数据。导出可复用 `bridge_runtime.py` 已有的 JSONL 序列化思路（文章 02_session_lineage 导出 JSONL 的对偶）。

#### 4.3.3 跨运行对比（可选，P2）

`KanbanRun[]` 已含多次 run。新增"对比两次 run"视图：高亮 tool 调用差异、duration 差异、失败点差异。这是文章"复现"能力的延伸。

---

## 5. 与文章概念映射总表

| 文章概念（OpenRath） | 本项目落点 | 实现位置 | 现状/动作 |
|---------------------|-----------|---------|----------|
| Session = 证据载体 | KanbanEvent+Run+Message 三流 | `event-adapter.ts` | ✅ 已有，补 tool 流 |
| Tensor→Session 映射 | workflow_run + node_sessions | `workflow-run-store.ts` | ✅ 数据底座已备 |
| Module→Workflow/Agent | WorkflowRecord.nodes | `workflow-store.ts` | ✅ 静态图已有 |
| Device→Sandbox | node_session.workspace | `WorkflowRunNodeSessionRecord` | ✅ 已绑，⚠️ 副作用未入图 |
| Parameter→Memory | （无独立 memory 层） | — | ❌ 未来可演进 |
| Function→Tool | message.tool_calls | `bridge-message.ts` | ⚠️ 已记录，需提升为可观测维度（第一步） |
| 控制流→Selector | workflow-manager 编排 | `workflow-manager.ts` | ✅ 运行时路由已有 |
| **Session Graph = 可观测层** | topology + run-graph | `topology-adapter.ts` + **新 `run-graph-adapter.ts`** | ⚠️ task 级已有，run 级待接（第二步） |
| fork/merge/detach 血缘 | node_session lineage | **新 patch** | ❌ 待建模（第三步） |
| 证据档案/卷宗 | 历史 modal + **新 dossier** | `history-adapter.ts` + **新 `CockpitRunDossier.vue`** | ⚠️ 列表式回溯已有，卷宗导出待做 |
| 路由/复现/回滚/审计 | Cockpit 三层联动 | `cockpit.ts` §6 联动链 | ✅ 路由已有，回滚待做 |

---

## 6. 实施约束与遵循点

1. **不碰 upstream**：所有改动经 `overlay/patches/`（patch）或 `overlay/custom/`（新组件/adapter）。第一步仅 custom；第二、三步新增 patch（workflow schema 字段需 inject）。

2. **adapter 纯函数优先**：沿用现有范式——所有新可观测数据经纯函数 adapter 归一为统一类型，store 只做 computed 派生，组件只做渲染。**保证可测**（每个 adapter 配 `__tests__`）。

3. **复用现有通道**：实时性走 Socket.IO（`kanban-events` WS + workflow-manager 的 `status` emit），不做新轮询。RunGraph 的实时刷新接 `workflow-manager.onStatus`。

4. **Pure Ink 视觉纪律**：新增节点/视图严格用 `styles/variables.scss` 变量，仅 status 用 error/warning/success，不加新色值（spec §4.1 纪律）。

5. **测试基线**：每个新 adapter/组件配 vitest（参考 `event-adapter.test.ts` / `topology-adapter.test.ts` 现有范式），`npm run test` 通过。

6. **i18n**：新增用户可见文案走 `overlay/patches/0xx-i18n-*.patch`（参考 082/083/086 范式），zh/en 同步。

---

## 7. 分阶段建议（对齐项目既有 P1-P6 节奏）

| 阶段 | 范围 | 产出 | 对应文章能力 |
|------|------|------|-------------|
| **O1** | 第一步：tool-event-adapter + mergeDetail 改造 + timeline 呈现 | 工具调用进入时序流 | 证据链完整（"调了哪些工具"） |
| **O2** | 第二步：run-graph-adapter + CockpitRunGraph + store 接线 | 运行图可视化 | **Session Graph 升格为可观测层** |
| **O3** | 第三步前半：lineage patch + fork/merge 边 | 被否决分支可见 | "被否决的那条分支" |
| **O4** | 第三步后半：CockpitRunDossier 导出 + 跨运行对比 | 证据卷宗 | "证据档案而非截图" |

O1 纯 custom（零 patch 风险，可先行）；O2 主干 custom + 少量 patch；O3/O4 需 schema patch，建议在 O1/O2 验证后推进。

---

## 8. 一句话总结

文章把 Session 升格为可观测层；本项目 Cockpit **已是控制平面的雏形**，但停在"任务级"——把它从 task 血缘图**下沉到 run/工具级**，补齐工具证据与 fork/merge 血缘，就能从"协作看板"变为文章所倡导的"运行时证据平面"。数据底座（`WorkflowRunNodeSessionRecord`）已就位，缺的是 adapter 与视图——而这正是本项目最擅长的、已有范式的延伸。
