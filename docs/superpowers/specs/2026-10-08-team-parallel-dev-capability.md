# 团队并行开发能力：任务拆分 × 工作量评估 × 图驱动并行派发（设计正本）

- 日期：2026-10-08（run11 复盘立项，用户裁决："核心不是本次推演的需求场景，而是
  长期的任务拆分、工作量评估及并行开发能力或模式的建设，落地在 SwarmStudio 或
  hermes agent teams"）
- 状态：设计定稿，实施分三期（见 §5）
- 关联正本：`2026-10-05-mux-v8-fullflow-plan.md` §1.0.2 北极星（:81 待建件③即本文
  的对接层）；run11 复盘粒度病灶分析（2026-10-08 会话）

## 0. 主旨三句话

把"一个 3 人日大任务塞给一个 agent 串行干"变成"图引擎按依赖把 ≤1 人日的卡片
并行派给一组 agent"。手段是补三根接线：图节点→kanban 认领→AI 员工 spawn、
工作量评估落库参与派发决策、拆分器产出带人日与依赖边的子卡。验证判据是下一次
推演 devimpl 段有效并行度翻倍、单腿再无超包线任务。

## 1. 现状盘点（探索实锚，2026-10-08）

### 已有（可复用，不重造）

| 能力 | 位置 | 状态 |
|---|---|---|
| 图 DSL+校验+BSP 执行器（super-step/join/守卫回边/checkpoint/HITL） | `custom/server/loop/graph/graph-spec.ts:10-45,106-164`、`graph-runtime.ts` | 完整，GRAPH_ENGINE 默认 legacy（`graph-assembly.ts:37-44`） |
| 26 步→DAG 模板+需求→图编译器（关键词版） | `custom/server/graph/simulation-graph-template.ts:42-210` | 结构守门全绿；**6 种节点类型无执行器，hydrate 即 Unknown type 不可跑**；未挂路由 |
| kanban 任务内核：decompose（LLM 拆 2-6 子卡+parents）、estimate（S/M/L+tokens）、派发器（assignee→CLI spawn、per-profile/全局并发帽、心跳/熔断/崩溃检测）、task_links DAG+recompute_ready、claim CAS | hermes-agent `hermes_cli/kanban*.py`、`gateway/kanban_watchers*.py`（探索报告 §3） | 完整；**estimate 不落库不进派发；decompose 子卡无人日/互依赖边** |
| 图→kanban 落卡（单向） | `custom/server/loop/graph/kanban-persistence.ts:96-151`（patch 202 DI） | 完整 |
| 进程内并行子代理 | hermes-agent `tools/delegate_tool*.py`（max_concurrent_children 默认 10） | 与 kanban 派发器是两套孤岛 |
| kanban REST 面 | patch 035/013（decompose/estimate/patchTask 等） | 完整 |

### 缺失（本文建设项）

1. **对接层**（方案 ：81 待建件③原话）："图执行器↔agent 派发对接（图节点 fire→
   触发 kanban 认领→spawn AI 员工）"——整体不存在；模板 6 种节点类型
   （agent-task/agent-review/agent-test/human-gate/dispatch/report-gen）无 registry 实现。
2. **工作量闭环**：estimate 结果不回写卡片、不参与派发；卡片无人日字段；
   派发只有 priority+并发帽，无按负载加权。
3. **拆分质量**：decompose 无"每卡 ≤1 人日"约束、子卡间只有到 root 的 parents
   （无兄弟依赖边=无并行波次信息）。

## 2. 架构

```
GraphSpec（需求→图编译/编辑器画布）
   │ hydrate + registerGraph（现有）
   ▼
GraphRuntime super-step 调度（现有）
   │ fire 节点
   ▼
【新建】node-executors 六种节点执行器（overlay custom/server/graph/node-executors/）
   agent-task ──► kanban create_task（assignee/raci/estimate_days/parents=图入边）
   │                    │（现有派发器：assignee→hermes -p <profile> --cli chat -q "work kanban task <id>"）
   │                    ▼
   │              AI 员工 CLI worker（现有；卡状态=唯一真值）
   │                    │ complete_task → done
   │                    ▼
   └── 轮询卡状态（notify_subs/REST）→ Send 完成信号 → 图推进（join 屏障照旧）
   human-gate → 现有 human interrupt 节点适配（审批收件箱/看板反应审批复用）
   dispatch（fan-out）→ 结构节点：按 config.targets 批量建卡（即 fan-out 出边全建）
   report-gen → function 节点调报告生成器
```

要点：**kanban 卡状态是唯一完成真值**（spawn 是建议、卡是事实——沿用推演
"真值锚"哲学）；图引擎只做调度与 join，不自己 spawn（复用派发器的并发帽/
熔断/心跳，两套孤岛由此收敛为一套）。

## 3. 分期实施

### 一期（本 feature 分支）：对接层 + 模板可跑（北极星首跑前置）
- `node-executors/agent-task.ts`：create_task（body 带
  `{estimate_days, raci, graph_node, branch_hint, acceptance}`）→ 轮询
  `GET /api/hermes/kanban/...` 卡状态（done/blocked 终态；blocked→onError 路径）
  → Send。幂等键=`graph_node:<runId>:<nodeId>`（复用 idempotency_key 列）。
- `node-executors/{dispatch,human-gate,report-gen,agent-review,agent-test}.ts`：
  dispatch=批量建卡屏障；human-gate=适配现有 human interrupt；review/test=
  agent-task 预设（specialist-presets 复用六闸守门员 prompt 资产）。
- 注册进 graph-assembly（GRAPH_ENGINE=shadow 链可 dry-run；on 链实跑）。
- 守门：node-executors 单测（结构守门风格）+ 26 步模板 hydrate→startRun 冒烟
  （shadow 模式、假 kanban adapter）。
- 验收锚：`simulation-graph-template` 26 节点在 shadow 引擎下全部节点可 fire
  （不真 spawn，验证接线与 join 语义）。

### 二期：工作量闭环（2026-10-08 已落地：--persist 落库/派发加权/HttpKanbanBridge 真桥；decompose 人日字段因镜像链挂三期前）
- kanban CLI `estimate --persist`：结果回写卡片 `estimate_days`（REAL 列+
  estimate_meta JSON，_LATER_TASK_COLUMNS 自动迁移），人日换算=complexity 映射
  （S=0.5/M=1/L=2；complexity 缺失按 est_tokens 分档兜底）。
- 派发器加权：ready 队列排序从 priority 单键 →
  `priority, assignee 在途人日和最小者胜`（负载均衡）；per-profile 并发帽保留。
- decompose 升级：输出每卡 `estimate_days≤1`（超限自动再拆一层）+ 兄弟依赖边
  （写入 task_links，recompute_ready 语义照旧）。
- kanban 任务简报/看板 UI 显示人日列（client patch 链）。

### 三期：图执行轮实跑（run12/13）
- GRAPH_ENGINE=on 起一图执行轮推演（26 步模板真 spawn，kanban 认领闭环）；
  事件日志=审计回放（一图三用）。与 simharness bash 驱动对照双轨跑一轮后收敛。

## 4. 与 simharness A 轨的关系

A 轨（run12 前置，simharness dd6956d/cb2e674 已落）是 bash 驱动内的同型改造
（PAYCORE 三拆/契约件锚/wait_alive_truth_multi），**即图执行轮落地前的过渡**；
三期收敛后 devimpl 等场景步由图节点承载，bash 驱动退化为环境准备+证据收集。

## 5. 风险与回滚

- 派发器过载：node fire 并发受引擎 maxSteps/super-step 与派发器并发帽双重约束；
  图层不另设并发（单一事实源=kanban.max_in_progress 系）。
- 卡状态轮询风暴：agent-task 轮询间隔 15s 起步+指数退避；notify_subs 事件推
  优先（轮询为兜底）。
- 回滚：node-executors 未注册前模板本就不可跑（无回归面）；GRAPH_ENGINE 三态
  开关即总闸（legacy 即回今日现状）。
