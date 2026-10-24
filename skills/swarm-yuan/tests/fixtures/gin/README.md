# gin fixture 说明

- violating 主触发 4 个 fail 意图：goroutine 内直接用 c（非 c.Copy）/ gin.New 无 Recovery /
  AllowAllOrigins+AllowCredentials 双 true / URL query 取 token 鉴权。
- 断言登记：**4/4 主触发已断言**（`violating/expected-fail-ids`：
  `fw_gin_context_copy`、`fw_gin_recovery_middleware`、`fw_gin_cors`、`fw_gin_auth_middleware`）。
- 2026-07-20 沉睡唤醒（2 处，门禁脚本未动）：`fw_gin_cors` 与 `fw_gin_auth_middleware`
  门禁逻辑健全但 fixture 缺触发内容（原 2/4 命中），在 `violating/main.go` 补 cors 双 true 配置
  与 `c.Query("token")` 鉴权中间件后命中。
