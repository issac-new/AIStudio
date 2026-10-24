# webpack fixture 说明

- violating 主触发 1 个 fail 意图：生产 mode 用 eval 类 devtool（源码泄漏 CWE-540）。
- 断言登记：**1/1 主触发已断言**（`violating/expected-fail-ids`：`fw_webpack_devtool`）。
- 2026-07-20 实跑核验：fail id 在 violating 输出 ✗ 行命中；无沉睡 fail 门禁。
