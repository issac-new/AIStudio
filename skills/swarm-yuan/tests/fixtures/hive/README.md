# Hive 框架 fixture（WP-P2-extension 2026-08-26）

双态 fixture：
- `violating/`：etl.hql 含 8 类反模式 → 触发 fw_hive_acid(fail) + fw_hive_dynamic_partition(fail) + 6 个 warn
- `compliant/`：etl.hql 全部规避 → PASS

`expected-fail-ids` 列出 violating 须命中的门禁 id。

conf 变量：`HIVE_SRC_GLOBS`（声明在 arch.conf）。
