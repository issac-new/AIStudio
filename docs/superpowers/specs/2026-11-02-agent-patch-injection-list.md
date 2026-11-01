# 722/723 补丁纳入注入白名单＋runtime 副本语义同步

日期：2026-11-02 ｜ 类型：fix（harness 注入链）｜ 关联：run24 复盘根治批

## 变更
1. `simharness/mux/mx-lib.sh` `mx_apply_agent_patches` 补丁清单追加 `722-agent-emptystream-ladder-classify.patch`、`723-agent-dispatcher-refusal-reasons.patch`（原仅登记 series，从未进注入清单——mx-up 不应用，run24 值守热打 SIM 快照后又被下次 provision 洗掉，722 实测从快照消失）。
2. `runtime/gateway/kanban_watchers_dispatcher.py` 追加 723 同源诊断段（`_spawn_refusal_reasons`/`_refusal_hint`/聚合日志）——守门 ⑬「agent 补丁目标文件在 runtime/ 有副本的，副本须含补丁新增行」要求部署副本不回退补丁语义。
3. `tests/harness-gate-integrity.test.ts` 追加两断言（722/723 必须在注入白名单），防白名单漏项复发。

## 决策记录
- 不改 723 行为，只补注入通道与副本同步：补丁语义已在 run24 复盘批定谳（板团队围栏拒子编制 assignee），本批只保证它真的被加载。
- runtime 副本按补丁新增行原样追加（非重写文件）：runtime 副本与 vendor pristine 存在历史差异，整文件覆盖会回退其它运行时改动。

## 验证
- `bash -n simharness/mux/mx-lib.sh` 过；`py_compile runtime/gateway/kanban_watchers_dispatcher.py` 过。
- `vitest --root simharness tests/harness-gate-integrity.test.ts` = 128/128（含新两断言与既有 ⑬ 副本语义检查）。
- 运行面生效验证见同日收口记录：mx-up 重放后 SIM 快照含 722/723 语义、网关重启加载。

## 设计文档影响
DESIGN_SYNC: none——纯注入通道修复，方案/模板面零改动（run24 复盘批已含纪律 90-95 与补丁说明）。
