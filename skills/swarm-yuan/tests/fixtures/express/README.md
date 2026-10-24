# express fixture 说明

- violating 主触发 2 个 fail 意图：无 helmet / 错误处理中间件非最后注册。
- 断言登记：**2/2 主触发已断言**（`violating/expected-fail-ids`：
  `fw_express_helmet`、`fw_express_error_handler_last`）。
- 2026-07-20 实跑核验：两个 fail id 均在 violating 输出 ✗ 行命中（FAIL 行级取证）；
  无沉睡 fail 门禁（头部声明 2 fail 全部可实例化）。
