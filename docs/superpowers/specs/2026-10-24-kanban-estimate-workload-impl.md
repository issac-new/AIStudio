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

## 追加批（同日）：vitest 全量首跑暴露的两处测试基建缺陷

全量首跑（serve-main 换装后）146 文件级失败，根因不在业务码而在两处基建：

1. **`vitest.config.ts` 的 `@` 兜底别名仍回落 `../upstream`**——单仓整合起 inject 目标已切 `vendor/`（inject.mjs 的 vendor 优先级），测试却读整合前旧外部 upstream 树（内部 custom 符号链还指着已消亡的 ncwk 路径）。修法：兜底优先级镜像 inject.mjs——显式 `OVERLAY_UPSTREAM_ROOT` ＞ `vendor/` ＞ `../upstream`（远端 vendor 模式回退保留）。
2. **`run-trace-profile.test.ts` 的 python 装配缺 `sys.modules` 注册**——`module_from_spec` 裸 `exec_module` 下，3.14 的 dataclasses 类型解析经 `sys.modules[cls.__module__].__dict__` 查命名空间直接 NoneType 崩（3.15 恰不走此路径侥幸通过）；补标准注册行，双解释器均绿（3.14 实测过、3.15 语义不变）。
3. **两测试的路径期望未跟进 vendor 模式**——`base-runtimes.test.ts` 期望根仍按 `overlayRoot/../upstream` 解析（改为镜像 inject.mjs 优先级：env ＞ vendor ＞ ../upstream，24 测全过）；`matrix-login-session.test.ts` 物理相对导入 `../../../../../upstream/...` 指向整合前旧外部树（改为 4 级回 checkout 根进 `vendor/`，主树/worktree 通吃，注入态下 5 测全过）。

## 验证

- 拼合树（vendor v0.22.4 基线 + 本轮 runtime 覆盖层）`python3.14 -m pytest`：**22 passed**，覆盖三份测试全量——板级围栏 5、分解估算 9（含原 xfail 两用例转正常通过）、估算落库+负载重排 8（原 import 断链红测转全绿）。
- 语法检查：三模块 `ast.parse` 通过。
- 用例语义对拍：同层轻载先行 / 未评估保守 1 人日 / unassigned 垫底 / 等负载保持到达序 / 优先级层不被打穿，五断言全过（TestWorkloadReorder 四用例）。

## 验证（追加批）

- python 片段 3.14 直跑：`{"explicit": "explicit-prof"}` 正常输出。
- 修复前对照实验：同测试文件 PATH 前置 3.15 → 3 passed；默认 3.14 → 2 failed（AttributeError NoneType __dict__）——失败可完全归因装配缺陷，非插件行为回归。
- base-runtimes（注入态 worktree 单跑）：24 passed；matrix-login-session（注入态 worktree 单跑）：5 passed。
- 全量复跑结果见本轮交付汇报。
