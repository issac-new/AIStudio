# 2026-10-24 看板估算落库与派发负载重排实现轮（kanban-estimate-workload）

## 背景

上一轮（2026-10-24-repo-integration-cleanup 决策 3/4）披露两个半成品特性：测试先行、实现未落地。本轮补齐实现并解挂账：`set_estimate`（估算落库 + `estimate_set` 审计事件）与 `_reorder_ready_by_workload`（派发 ready 层内负载重排）。锚点：specs/2026-10-08-team-parallel-dev-capability.md §3 二期、specs/2026-10-09-parallel-capability-foundation-spec.md §3。

## 变更

1. **`runtime/hermes_cli/kanban_db.py`**
   - `tasks` 表新增 `estimate_days REAL` / `estimate_meta TEXT` 列（SCHEMA_SQL + Task 数据类 + `from_row` 解析：days 转 float、meta 解 JSON dict）。
   - 新增 `set_estimate(conn, task_id, days, meta=None)`：None 清除；非数值/非正/NaN/inf 抛 `ValueError`；archived 抛 `RuntimeError`（对齐 `_set_task_override` 家族）；每次写入落 `estimate_set` 事件（payload = days + meta）；提交后 `notify_task_updated`。
2. **`runtime/hermes_cli/kanban_db_connect.py`**：`_LATER_TASK_COLUMNS` 追加两列——老库打开即 `ALTER TABLE` 自动迁移（`add_column_if_missing` 既有机制）。
3. **`runtime/hermes_cli/kanban_db_dispatch.py`**
   - `_lane_rows` SELECT 增带 `priority`（供层分组；其余消费方按名列访问不受影响）。
   - 新增 `_reorder_ready_by_workload(conn, rows) -> (rows, changed)`：在途负载 = assignee 全部 running 卡 `estimate_days` 之和（未评估保守计 1 人日）；unassigned 层内垫底；等负载保持 created_at 序（稳定排序）；层间 `priority DESC` 语义不变。接线至派发 ready 取行处（原唯一调用点）。
4. **`runtime/tests/hermes_cli/test_kanban_decompose_estimate.py`**：摘除两处 `xfail` 挂账标记（实现落地，测试转正常通过）。
5. `kanban_decompose.py` 零改动——`_persist_child_estimates` 既有钳制与调用签名即为本实现的契约方。

## 决策记录

1. **重排落点在派发取行处而非 SQL 内**：负载是 running 全表聚合，拼进 ready 的 SQL 会把两个关注点耦合；函数化便于测试与后续权重调整。
2. **`estimate_meta` 只存来源元数据、不含 days**：days 有专列；事件 payload 同时含 days+meta，审计链单一真源。
3. **清除（None）也发 `estimate_set` 事件**：审计链完整记录估算生命周期；测试未约束，选更完整的语义。
4. **部署同步走 manifest 通道**：改动文件均已在 `runtime-manifest.json` 登记清单内（kanban_db.py / kanban_db_dispatch.py / kanban_db_connect.py 既有条目），部署树经 `deploy-agent-runtime` 随 inject 出口同步。

## 验证

- 拼合树（vendor v0.22.4 基线 + 本轮 runtime 覆盖层）`python3.14 -m pytest`：**22 passed**，覆盖三份测试全量——板级围栏 5、分解估算 9（含原 xfail 两用例转正常通过）、估算落库+负载重排 8（原 import 断链红测转全绿）。
- 语法检查：三模块 `ast.parse` 通过。
- 用例语义对拍：同层轻载先行 / 未评估保守 1 人日 / unassigned 垫底 / 等负载保持到达序 / 优先级层不被打穿，五断言全过（TestWorkloadReorder 四用例）。
- vitest 全量与 serve-main 换装另见本轮收口报告（服务端 Python 层改动不触 JS 面）。
