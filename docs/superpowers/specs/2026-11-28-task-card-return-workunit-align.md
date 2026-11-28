# 2026-11-28 任务卡归还：run32-plan-sync-20261126 槽位按字节恢复

> 状态：已实施
> 相关正本：`2026-11-27-task-card-single-slot-return.md`（任务卡单槽位与归还）、仓规第 14 条

写给谁看：本仓 AI 会话与接手者；记录 workunit-framework-align 批推送完成后槽位的归还字节与依据。

## 变更

`workunit-framework-align-20261127` 批（合并 cc4522e5a）已推送，按仓规第 14 条把槽位归还给在先的 `run32-plan-sync-20261126`：

- `.qgate/registers/task-intent.json` 恢复为 `f47a79658` 版本字节（含 2026-11-28 补记 revision，哈希 `25601f97…ede842`）；
- `scope-check.yaml` 与 `intent-drift.yaml` 的 `acknowledgedSha256` 重绑为同一哈希。

两值逐字一致，可由 `sha256sum .qgate/registers/task-intent.json` 对账。

## 决策记录

| # | 决策 | 选择 | 理由 | 类型 |
|---|---|---|---|---|
| D1 | 归还目标字节 | f47a79658 版（补记后的 run32 卡） | 该版是本批合并前主干上的在先有效登记；「卡不归还」由 run32 同线程批自己声明，归还目标以它为准 | Mechanical |
| D2 | 绑定值来源 | 从归还字节文件实时计算 | 绑定必须与登记文件逐字一致（2026-11-28 绑定修复轮教训：拼接哈希前缀必被门拦） | Mechanical |

## 验证

- `sha256sum .qgate/registers/task-intent.json` ＝ 两处 `acknowledgedSha256`。
- 归还批推送过 L0 门集（scope-check 按 run32 卡范围收窄）。

## 设计文档影响

- DESIGN_SYNC: none —— 登记与绑定归还，不触及产品面、架构面与数字总账口径。
