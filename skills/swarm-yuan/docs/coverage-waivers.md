# 证据缺口豁免登记（WP8）

> 规则：每个 active 门禁/框架必须有双态证据；缺口必须在本表登记理由与补证期限。
> 2026-10-21 WP8 落地后：门禁 M2 53 / M1 3；框架 M2 81 / M1 0。
> M2 口径：violating+clean，或 advisory 的 clean+warn 变体（`compliant-*`）。本表只登记仍缺双态的 3 项。

| 能力 id | 类别 | 缺口 | 理由 | 补证期限 |
|---------|------|------|------|----------|
| framework | gate | 无独立 `gate-fixtures` 目录 | 81 组 `tests/fixtures/<framework>/` 已覆盖框架调度器的正反例；独立 gate 夹具会重复 | 2026-12-31 |
| spec-first | gate | 无独立 `gate-fixtures` 目录 | L1-L4 四层由 `test-r101`/`test-r103`/`test-hook-contracts` 行为测试覆盖；夹具会重复 | 2026-12-31 |
| pr-quality | gate | 仅 clean compliant，无 warn/violating | 纯 `_ai_hint` 输出，rc 恒 0；构造 warn 需改门禁语义，暂以人工审查为准 | 2026-12-31 |

## 说明

- 2026-10-21 已补齐 20 个门禁的夹具（7 个无目录 + 13 个仅 compliant）；其中 advisory 门禁用 `compliant-warn-*` + `expected-ids` 表达触发态，不伪造非零退出。
- 框架 81/81 已补 `expected-pass-ids` 负向断言（源自 violating 的 `expected-fail-ids`）。
- 新增门禁没有双态证据不得合入；确需豁免者在此登记。
