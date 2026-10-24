# HarmonyOS 框架 fixture（WP-P2-extension 2026-08-26）

双态 fixture：
- `violating/`：Index.ets + native.cpp + module.json5 含 9 类反模式 → 触发 3 个 fail + 6 个 warn
- `compliant/`：全部规避 → PASS

`expected-fail-ids` 列出 violating 须命中的门禁 id。

conf 变量：`HARMONYOS_SRC_GLOBS`（声明在 arch.conf）。
