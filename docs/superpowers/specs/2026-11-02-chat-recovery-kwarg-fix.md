# 2026-11-02 chat turn recovery kwarg 冲突修复（补丁 726）

## 变更

- `patches/726-agent-chat-recovery-kwarg-fix.patch`（新增）：`gateway/run_turn_runner.py` 的 `_rec_kwargs` 构造后补 `_rec_kwargs.pop("conversation_history", None)`——与既有 `title_user_message` 排除同款防御。725 引入的 recovery 路径把调用方 kwargs 透传给 `agent.run_conversation(nudge, conversation_history=..., **_rec_kwargs)`，kwargs 自带 `conversation_history` 时 Python 抛 `TypeError: got multiple values for keyword argument`，被外层 `except Exception` 吞成一行 WARNING（`chat turn recovery skipped`），恢复回合静默哑火。
- `patches/series`：726 登记（编号顺延 725）。
- `simharness/mux/mx-lib.sh`：`mx_apply_agent_patches` 白名单追加 726（缺位会被 provision 洗掉，722 曾实锤）；行尾注释同步。
- `simharness/tests/harness-gate-integrity.test.ts`：守门断言——白名单必须含 726 文件名，且补丁体必须含 `_rec_kwargs.pop("conversation_history", None)`。

## 决策记录

- run25 G2 熔断现场（2026-11-02 19:27-19:40）三层根因：A 层 cc-switch 上游供应商全面熔断（503「所有供应商已熔断」）；B 层本缺陷——secops 会话 turn 中断后 recovery 被 TypeError 挡掉，314s 无输出→lease lost→回合死；C 层 G2 硬闸 600s 窗无重试直接 FAIL（C 层另挂账，不在本 spec）。本修复只根治 B 层：recovery 是 run24 四现场「回合死即静止」的根治层（725），它自身在最需要它的熔断场景哑火属必修。
- 修法取最小防御排除（pop）而非重构 kwargs 白名单：与 725 既有排除风格一致，diff 面 4 行，回归风险最小。
- 部署面注意：gateway 在跑进程不热换（值守纪律），本修复经 mx_apply_agent_patches 在下一次 provision/mx-up 或 gateway 重启时生效；run25 本轮若再熔断仍可能复发（靠驱动断点续跑兜底）。

## 验证

- `patch -p1 --dry-run` 对 725 态基线 rc=0 可干净应用（补丁仅含 4 行 delta，无 725 全量混入）。
- `npx vitest run simharness/tests/harness-gate-integrity.test.ts`（本 spec 落地的守门断言，见提交时实测输出）。

## 设计文档影响

DESIGN_SYNC: none——纯 vendor 补丁层缺陷修复，不触及整合正本/数字总账的任何章节与数字；725 的设计语义（跨回合恢复）不变，本修复是其实现缺陷的校正。
