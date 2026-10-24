# Spark 框架 fixture（WP-P2-extension 2026-08-26）

双态 fixture：
- `violating/`：Job.scala 含 6 类反模式 → 触发 fw_spark_collect(fail) + 5 个 warn 门禁
- `compliant/`：Job.scala 全部规避 → PASS

`expected-fail-ids` 列出 violating 须命中的门禁 id（fail + warn 合计）。

conf 变量：`SPARK_SRC_GLOBS`（声明在 arch.conf）。
