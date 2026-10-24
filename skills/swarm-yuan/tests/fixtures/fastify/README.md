# fastify fixture 说明

- violating 主触发 3 个 fail 意图：路由无 schema / onSend 改写 payload 未回传 / 无统一错误处理钩子。
- 断言登记：**3/3 主触发已断言**（`violating/expected-fail-ids`：
  `fw_fastify_schema_validation`、`fw_fastify_onsend_return`、`fw_fastify_error_handler`）。
- 2026-07-20 沉睡唤醒（2 处，门禁脚本未动）：
  - `fw_fastify_error_handler`：原 fixture 注释自含字面量 `setErrorHandler` 致 grep 假 pass，
    改写注释后命中（同类「注释自匹配」陷阱与 vite inject.mjs 一致）。
  - `fw_fastify_onsend_return`：awk 15 行窗口须闭合才评估，原 fixture hook 距 EOF 不足 15 行；
    在 hook 后补足常规注册/启动代码（窗口内无 return/done）后命中。
- 已知限制（留 P1 评估，类比 spring-boot actuator 嵌套 YAML 先例）：onSend 窗口在 EOF 前不闭合时不评估，
  是否加 awk END 兜底属判定面扩张，须先断言后修。
