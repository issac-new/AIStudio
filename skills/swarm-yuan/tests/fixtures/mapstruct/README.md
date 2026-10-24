# mapstruct fixture 说明

- violating 主触发 2 个 fail 意图：@Mapper 未显式 unmappedTargetPolicy（OrderMapper.java）/ lombok+mapstruct 共存但无 lombok-mapstruct-binding（pom.xml）。
- 断言登记：**2/2 主触发已断言**（`violating/expected-fail-ids`：`fw_mapstruct_unmapped_target`、`fw_mapstruct_lombok_binding`）。
- 沉睡门禁：无（2 个 fail 门禁在 P1 实跑基线中均已触发，输出 ✗ 行为证）。
- 无法实例化项登记：无。
- compliant 侧 OrderMapper.java 显式 unmappedTargetPolicy=ERROR + pom.xml 含 lombok-mapstruct-binding，期望全 pass。
