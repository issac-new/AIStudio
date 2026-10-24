# 漏洞账本（三态）— <TARGET_SLUG>

> 档案 7 件套 ③/⑦。本目标漏洞状态的**唯一作战台账**。
> 三态定义（Theoretical / Candidate / Confirmed）以 pentest-methodology-fusion
> §4 Finding Confirmation Protocol 为单一事实源；Candidate→Confirmed 的唯一
> 晋级凭据是 fp-check 六门全 PASS（阶段 6 Gate Review 裁定 CONFIRMED + 裁定记录 YAML）。

## 状态流转规则

- Theoretical → Candidate：出现可执行验证线索（可复现请求 / PoC 草图）
- Candidate → Confirmed：fp-check 六门全 PASS，凭据=裁定记录 YAML
- 无进展 / 数据流断链无法填补：显式保持或降为 Theoretical（禁止静默挂在 Candidate）

## 账本

| finding_id | 标题 | 状态 | severity | 入账时间(UTC) | 状态变更时间(UTC) | 晋级凭据（裁定记录/证据指针） | 报告位置（正文/附录-验证中/附录-未验证/未入） |
|------------|------|------|----------|---------------|-------------------|-------------------------------|----------------------------------------------|
| F-0001     |      | Candidate |    |               |                   |                               | 附录-验证中                                   |

## 报告准入核对（收尾必查）

- [ ] 报告正文与 findings/ 目录仅含账本状态 = Confirmed 的条目
- [ ] Candidate 只出现在附录并标注「验证中」
- [ ] Theoretical 只出现在附录并标注「未验证」，或作为 verification_path 交接
- [ ] 账本状态与 kanban_complete metadata.findings 一致（finding_id 已回填）
