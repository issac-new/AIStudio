# 2026-11-28 任务卡绑定修复：两道 L0 门补绑 25601f97

> 状态：已实施
> 相关正本：`2026-11-27-task-card-single-slot-return.md`（任务卡单槽位与归还）、仓规第 14 条

写给谁看：本仓 AI 会话与接手者；说明为什么主干曾处于「任何推送必被 intent-drift 拦」的坏态、怎么修的。

## 变更

`f47a79658`（「任务卡补记 2026-11-28 进位批」）修改了 `.qgate/registers/task-intent.json`（补记 revision，文件哈希变为 `25601f97…`），提交信息声称「两道门哈希同步」，实际只提交了登记文件——`scope-check.yaml` 与 `intent-drift.yaml` 的 `acknowledgedSha256` 仍为旧值 `e406ebba…`。此后主干的登记文件与门绑定不一致，任何推送都被 `L0.intent-drift` 以「哈希漂移」拦截（2026-11-28 00:07 两次推送实测）。

本批补上缺失的绑定：两处 `acknowledgedSha256` 由 `e406ebba…` 改为 `25601f97…`，与在位卡（run32-plan-sync-20261126，经 f47a79658 补记后）一致。登记文件本身不动。

## 决策记录

| # | 决策 | 选择 | 备选与否决理由 | 类型 |
|---|---|---|---|---|
| D1 | 绑定目标 | 25601f97（在位卡实际哈希） | 恢复 e406ebba（否决：登记文件已被 f47a79658 合法补记，回绑旧值等于推翻该补记） | Mechanical |

## 验证

- `sha256sum .qgate/registers/task-intent.json` ＝ `25601f97…`，与两处绑定一致。
- 推送 `origin main` 过 L0 门集（scope-check 按 run32 卡范围收窄；run32 同线程批次的变更集全部落在该卡范围内）。

## 设计文档影响

- DESIGN_SYNC: none —— 门绑定数值修复，不触及产品面、架构面与数字总账口径。
