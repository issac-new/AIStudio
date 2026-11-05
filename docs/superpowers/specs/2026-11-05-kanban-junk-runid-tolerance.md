# 2026-11-05 kanban 毒 run 指针免疫与 dir 卡建卡校验（run27 派单器停滞根治）

## 变更

- 新增 `patches/754-agent-kanban-junk-runid-tolerance.patch`（vendor/hermes-agent，两文件四处）：
  1. `hermes_cli/kanban_db.py` `_reclaim_dangling_run`：`current_run_id` 非整型（如外部工具直写的 run slug）不再 `int()` 抛 ValueError——改按 `task_id` 关闭仍开着的 run 行并清指针，双句恢复不变量「current_run_id IS NULL ⇔ run 行终态」；整型路径行为不变。
  2. 同文件 `_current_run_id()`：毒值返回 `None`（读路径免疫，不再向所有调用方传染崩溃）。
  3. 同文件 `goal_run_status()`：`expected_run_id` 不可整型化即判 `superseded`（调用方自证所有权失败的真语义——它不持有任何 run 行）。
  4. `tools/kanban_tools.py` `_handle_create`：`workspace_kind=dir` 且缺 `workspace_path` 建卡即拒，消息内给出修法（补 path 或省略 kind 取 per-task worktree）。
- 新增 `simharness/tests/kanban-junk-runid.test.ts` ＋ `simharness/tests/fixtures/kanban-junk-runid.py`：对注入后 vendor 树（`PYTHONPATH=vendor/hermes-agent`）的行为断言——毒指针 reclaim 不崩且指针清零＋开行被关、`_current_run_id` 毒值 None、`goal_run_status` 毒值 superseded、dir 缺路径建卡结构化拒绝、dir 带路径照常建卡（不误伤正道）。
- spec 登记双载体同批：附录 A.1 索引（558→559）＋`docs/manuals/aistudio-design-document-index.md` 机械索引（567→568、2026-11 组 114→115，字母序插入）——后者由 `interactive-training-manual` 守门测试机械覆盖全部根 spec 检出（守门测试当场 fail 验证有效）。

## 决策记录

- 根因（run27 18:1x-18:4x 实测）：缺陷回流卡经外部直写出生即带 `current_run_id='20261105-v8-run27'`（slug）且 `workspace_kind=dir` 无 `workspace_path`——claim 路径 `_reclaim_dangling_run` 对 slug `int()` 抛错，派单器 tick 每 60s 崩（gateway.log 167 次 "tick failed on board xiao-cashier-mp"），5 张 DEF-FE-S1 缺陷卡永不被 spawn；值守补路径后又在 workspace 解析处 `spawn_failed`×2→`gave_up` 烧尽重试预算。
- 修在**读侧免疫**而非写入侧拦截：写入方是绕过 `create_task` 的外部直写（卡首事件 `promoted` 而非 `created` 实证），写入面不可枚举；DB 契约「current_run_id 是 task_runs 整型 id」由读侧守卫兜底＝对任意历史毒值与未来任意写入方一次性治愈。run27 当轮毒数据已值守手工清零（xiao 板 5 行＋fei-test-mp 板 2 行），本补丁防复发。
- 建卡校验放 agent 工具层而非 DB 层：工具层能给出「怎么改」的可行动错误消息（对齐同函数内 assignee 占位值拒绝的既有风格）；DB 层不掌握 worktree 缺省语义。校验只拦 `dir` 缺路径这一不可 spawn 形态，不改变 worktree 缺省路径行为。
- 同批证伪销案两条（run27 值守挂账更正）：
  1. 「matrix 失连零重试」证伪——16:14 失连后 secondary 重试链 30→60→120→240→300s 封顶实际在跑，16:56:54 `✓ matrix reconnected`；真残缺是**崩溃孤儿会话在平台重连后不恢复**（更大设计题，非本批范围，不立项不猜）。
  2. 「网关日志漂移」定性为双汇非缺陷——python file handler 恒写 `hermes/logs/gateway.log`，console 流走 launchd stdout 重定向（`SIM_ROOT/logs/gateway.log`），kickstart 后 console 只余 WARNING+ 属日志级差；值守巡检以 `hermes/logs/gateway.log` 为 python 日志正本。

## 验证

- worktree 内 `node scripts/inject.mjs` 后 `npx vitest run simharness/tests/kanban-junk-runid.test.ts`：5 断言全绿（实测输出见合并说明）。
- `python3 -m py_compile` 两改动文件通过。
- 补丁应用幂等：inject 后重复 inject 无 diff 漂移；`git -C vendor/hermes-agent diff --stat` 与补丁面一致（diff --git 清单核对，无未改文件混入）。
- 既有面回归：`npx vitest run simharness/tests`（本测试目录）不红；patch parity 守门（l2-kit-parity 不涉本补丁面）。

## 设计文档影响

DESIGN_SYNC: none——vendor 上游缺陷修补＋行为测试，不触及整合正本/数字总账；理由=修复恢复的是既有 DB 契约（current_run_id 整型不变量）与既有 spawn 前置条件，未引入新机制、新阈值或新账本。
