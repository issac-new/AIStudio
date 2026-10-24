# fastapi fixture 说明

- violating 主触发 2 个 fail 意图：async 路由内 time.sleep 阻塞调用 / Pydantic v1 @validator + class Config。
- 断言登记：**2/2 主触发已断言**（`violating/expected-fail-ids`：
  `fw_fastapi_blocking_async`、`fw_fastapi_pydantic_v1`，
  2026-07-20 P1-B6 实跑登记）。
- 门禁无沉睡：声明的 2 个 fail 门禁全部命中，无需唤醒修复。
