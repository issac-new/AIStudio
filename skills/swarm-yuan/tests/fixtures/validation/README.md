# validation fixture 说明

- violating 主触发 2 个 fail 意图：ConstraintValidator 含可变实例字段（UpperCaseValidator.java）/ String 字段用 @NotNull 而非 @NotBlank（UserDTO.java）。
- 断言登记：**2/2 主触发已断言**（`violating/expected-fail-ids`：`fw_validation_validator_threadsafe`、`fw_validation_notnull_notblank`）。
- 沉睡门禁：无（2 个 fail 门禁在 P1 实跑基线中均已触发，输出 ✗ 行为证）。
- 无法实例化项登记：无。
- compliant 侧 UpperCaseValidator.java 无状态、UserDTO.java 用 @NotBlank，期望全 pass。
