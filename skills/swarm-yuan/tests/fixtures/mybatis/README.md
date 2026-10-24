# mybatis fixture 说明

- violating 主触发 3 个 fail 意图：
  - fw_mybatis_dollar —— XML 中 `${}` 命中行必须落入 SQL_INJECTION_WHITELIST，否则 SQL 注入风险。
  - fw_mybatis_binding —— MYBATIS_SRC_GLOBS 非空时 Mapper 接口数(mcnt) = XML namespace 数(xcnt)；空 SRC_GLOBS 跳过。
  - fw_mybatis_select_dup_result —— `<select>` 同行同时声明 resultType 与 resultMap → fail。
- 断言登记：**3/3 主触发已断言**（2026-08-26 实跑登记，见 violating/expected-fail-ids）。
- 回归发现#18 正向用例（2026-08-27 第七轮回归）：violating/WrapperMapper.java（QueryWrapper + .apply/.last/.having 拼接）→ fw_mybatis_wrapper_injection(warn) 命中；同时保护 #18 修复分支——先筛含 Wrapper 文件再扫，非 MP 项目的 Function.apply 不再误报（RuoYi SensitiveJsonSerializer 实证驱动）。
- 门禁无沉睡：声明的 fail 门禁全部命中，无需唤醒修复。

## violating vs compliant 差异
- violating：3 条 fail 门禁命中（详见 violating/ 下文件与 expected-fail-ids）。
- compliant：消除上述 fail 命中（对照 compliant/ 下等价文件）。
- 验收：`bash swarm-yuan/tests/run-framework-fixture.sh mybatis` 双态绿（violating 检出 / compliant PASS）。
