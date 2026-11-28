# 2026-11-28 任务卡归还：run32-plan-sync-20261126 槽位按字节恢复（设计文档整合同步批）

> 状态：已实施
> 相关正本：`2026-11-27-task-card-single-slot-return.md`（任务卡单槽位与归还）、仓规第 14 条

写给谁看：本仓 AI 会话与接手者；记录设计文档整合同步批推送完成后槽位的归还字节与依据。

## 变更

`design-integration-sync-20261128` 批（合并 `a07c009fb`）已推送，按仓规第 14 条把槽位归还给在先的 `run32-plan-sync-20261126`：

- `.qgate/registers/task-intent.json` 恢复为 `2164d1b26` 版本字节（哈希 `25601f97…ede842`）；
- `scope-check.yaml` 与 `intent-drift.yaml` 的 `acknowledgedSha256` 重绑为同一哈希。

这是该槽位的第七次归还。本批登记时以 `2164d1b26` 上的 run32 卡为基线重新生成（变基使旧登记失效），推送后按字节归还，来源版本与登记基线相同。

## 决策记录

| # | 决策 | 选择 | 理由 | 类型 |
|---|---|---|---|---|
| D1 | 归还目标字节 | `2164d1b26` 版（run32 卡） | 与本批登记时的基线字节相同；workunit 批归还批（`52e4538d5`）已确立该版为在先有效登记 | Mechanical |
| D2 | 绑定值来源 | 从归还字节文件实时计算 | 绑定必须与登记文件逐字一致（2026-11-28 绑定修复轮教训） | Mechanical |

## 验证

- `git diff 2164d1b26 -- .qgate/registers/task-intent.json custom/qgate/gate-packs/l0/gates/scope-check.yaml custom/qgate/gate-packs/l0/gates/intent-drift.yaml`：无差异（提交前实测）。
- `shasum -a 256 .qgate/registers/task-intent.json` ＝ `25601f97…ede842` ＝ 两处 `acknowledgedSha256`（提交前实测）。
- 归还批推送过推送前门。

## 设计文档影响

- DESIGN_SYNC: none —— 登记与绑定归还，不触及产品面、架构面与数字总账口径。
