# koa fixture 说明

- violating 主触发 2 个 fail 意图：无统一错误处理兜底 / 无 koa-helmet。
- 断言登记：**2/2 主触发已断言**（`violating/expected-fail-ids`：
  `fw_koa_error_handler`、`fw_koa_helmet`）。
- 2026-07-20 实跑核验：两个 fail id 均在 violating 输出 ✗ 行命中；无沉睡 fail 门禁。
