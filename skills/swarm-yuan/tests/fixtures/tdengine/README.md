# TDengine 框架 fixture（WP-P2-extension 2026-08-26）

双态 fixture：
- `violating/`：schema.sql 含 10 类反模式 → 触发 3 个 fail + 7 个 warn
- `compliant/`：schema.sql 全部规避 → PASS

`expected-fail-ids` 列出 violating 须命中的门禁 id。

conf 变量：`TDENGINE_SRC_GLOBS`（声明在 arch.conf）。
