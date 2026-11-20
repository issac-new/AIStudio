# 能力池 Task 8：任务能力需求字段 required_capabilities（内核＋REST＋消费面）

> 状态：已实施（2026-11-20，分支 feat/capability-task8）。
> 上游 spec：`2026-11-19-capability-pool-foundation.md` §3.3（本文件是其 Task 8 增量；不改旧 spec 正文，其未决事项 1 由此文件闭环）。
> 依赖：批一（`6759d1919`）已合入，series 尾 806；本批取 **807/808**。

## 变更

| 面 | 落点 | 内容 |
|---|---|---|
| 内核（agent lane，补丁 807） | `hermes_cli/kanban_db.py`、`kanban_db_connect.py`、`kanban.py`、`kanban_parser.py`、`kanban_output.py` | `tasks.required_capabilities`（TEXT JSON 数组，可空）＋迁移 `_TASK_EXTRA_COLUMNS`；`Task.required_capabilities` dataclass 与 `from_row` 解析；`create_task(..., required_capabilities=)` 参数＋INSERT＋created 事件 `requiredCapabilities`；CLI `--required-capability`（repeatable）；`show` 字段与 JSON dict（None→null，不折叠成 []） |
| studio lane（补丁 808） | `services/kanban/kanban-service.ts`、`controllers/kanban.ts`、`client/api/hermes/kanban.ts` | `KanbanTask.required_capabilities: string[] \| null`；REST create `requiredCapabilities`（optionalStringArray → `--required-capability` 旗标）；客户端 `KanbanCreateRequest.requiredCapabilities` |
| runtime 镜像 | `runtime/hermes_cli/` 同 5 文件 | 与补丁 807 同内容（runtime 版 `kanban_output.py` 基线旧，手工补字段元组＋`_task_to_dict` 两处） |
| 消费面 | `capabilitypool/collect.ts`、`kanban/dispatch-readiness.ts`、`kanban/column-dispatch.ts`、`zcode/mention-dispatch.ts`、`KanbanTaskDrawer.vue`、`CapabilityReadinessBadge.vue`、`KanbanInlineCreate.vue` | `collectDemands` declared 优先、skills 回退；`demandSource` 自动检测（任一库带列即 declared）；任务快照带 `required_capabilities`；派单两入口用 declared；抽屉 Skills 行＋能力需求行＋badge（props 改 `tags`）；创建表单能力需求输入 |

## 决策记录

| # | 决策 | 选择 | 理由 |
|---|---|---|---|
| D1 | 词法 | **独立 `_normalize_required_capabilities`**：SKILL_TAG_RE≤64、拒逗号串、**不拒 toolset 名** | `_normalize_task_skills` 拒 toolset 名会把 `coding` 拒绝（`coding` 是 toolset），而能力标签恰恰是 coding/review/browser 这类粗粒度名——toolset 拒绝是 worker 强载语义，与 dispatch 侧能力需求无关。实测暴露（create 报 'coding' is a toolset name）后修正。 |
| D2 | demandSource | 自动检测：任一板库 `tasks` 含 `required_capabilities` 列即 `declared`，全旧库 `skills-fallback` | 迁移后无需人工切口径；旧库行为不变 |
| D3 | declared 与 skills 关系 | declared 优先（有 declared 声明的任务按 declared，忽略其 skills）；仅 skills 的任务按 fallback | 避免同一任务两套需求口径混算 |
| D4 | 序列化 | None→null（未声明）与 []（显式空）两态保留，不做 skills 式 null→[] 折叠 | 供需面依赖"未声明"与"显式无需求"的区分 |
| D5 | decompose | 不继承（与 outcome_id 的"子树不跨结果"不同） | 能力需求是任务级语义，子任务各自声明 |
| D6 | 编辑通道 | create-only（与 skills 同边界；PATCH 不透传） | 对称于现有 skills 语义，避免引入新写面 |

## 验证

- 内核七项回环（`scripts/maintenance/t8-verify-kernel.py`，进程内 import，HERMES_HOME 隔离）：create/dataclass/column/event/CLI dict 全 `coding,review`；迁移幂等；legacy null；逗号串拒绝；parser 旗标。
- 消费面 3 例（`task8-consumer.test.ts`）：declared 优先于 skills、demandSource 自动 declared、旧库回退＋skills-fallback。
- 重放：clean+inject 后 manifest 0 failed；runtime 镜像 5 文件 `py_compile` 全过。
- 目标套件：capabilitypool/kanban/mention/UI 181 例（含 badge 4 例 prop 改 tags）。

## 设计文档影响

DESIGN_SYNC: touched
DESIGN_DOCS: docs/DESIGN.md

- §3.9 权威数据源表：`required_capabilities` 为任务能力需求唯一列（kanban SQLite），capabilitypool 只读投影；与 `skills`（worker 强载）语义分离。
- §2.3 能力供需段：demandSource=declared/skills-fallback 自动切换语义。

## 未做/未验证

- 全量 `npm test` 与浏览器走查在本批收尾执行（结果随提交说明）。
- decompose 继承、PATCH 编辑通道按 D5/D6 不做；外部专家池维持 v1 占位。
