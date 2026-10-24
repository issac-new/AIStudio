# jackson fixture 说明

- violating 主触发 2 个 fail 意图：敏感字段 password 无 @JsonIgnore/WRITE_ONLY（Account.java）/ @JsonTypeInfo 未声明兜底实现类（Shape.java）。
- 断言登记：**2/2 主触发已断言**（`violating/expected-fail-ids`：`fw_jackson_password`、`fw_jackson_polymorphic`）。
- 2026-07-20 P1 唤醒记录：`fw_jackson_polymorphic` 原 fixture 意图触发"缺 defaultImpl"分支，
  但 Shape.java 注释行含 `defaultImpl` 字面量，落入门禁 @JsonTypeInfo 起 8 行 grep 窗口把触发中和，
  门禁实际输出 pass（沉睡）。本批改写注释措辞（全文件不再出现该字面量）唤醒；门禁判定逻辑未动。
- 无法实例化项登记：无（本框架 2 个 fail 门禁均可由静态源码 fixture 实例化）。
- compliant 侧 Shape.java 含 @JsonSubTypes 白名单 + 兜底声明，Account.java 敏感字段 WRITE_ONLY，期望全 pass。
