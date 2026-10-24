# dameng fixture 说明

- violating 主触发 8 个 fail 意图：
  - fw_dameng_case_sensitive —— DDL 检出 `CREATE TABLE "小写"` 或列定义行 `"小写"` 引号标识符 → fail。
  - fw_dameng_reserved_word —— 列定义行首词裸用保留字（domain/context/percent/top/type/identity/model/dimension/verify/r...。
  - fw_dameng_mysql_syntax —— ENGINE=/反引号/UNSIGNED/ON DUPLICATE KEY/UPDATE\。
  - fw_dameng_rownum —— ROWNUM > / >= / BETWEEN → fail（恒空集）。
  - fw_dameng_group_concat —— GROUP_CONCAT( → fail（DM 无此函数）。
  - fw_dameng_unsupported_type —— BOOLEAN/ENUM 列类型 → fail（改 BIT / VARCHAR+CHECK）。
  - fw_dameng_identity_insert —— 对 IDENTITY 表显式 ID 首列 INSERT 且同文件无 SET IDENTITY_INSERT → fail。
  - fw_dameng_driver —— 同配置文件 jdbc:dm:// 与 com.mysql 驱动类共存 → fail。
- 断言登记：**8/8 主触发已断言**（2026-08-26 实跑登记，见 violating/expected-fail-ids）。
- 反模式：violating 侧复现上述 8 条 fail 门禁命中场景；compliant 侧以对应修复（配置/代码修正）消除命中。
- 门禁无沉睡：声明的 fail 门禁全部命中，无需唤醒修复。

## violating vs compliant 差异
- violating：8 条 fail 门禁命中（详见 violating/ 下文件与 expected-fail-ids）。
- compliant：消除上述 fail 命中（对照 compliant/ 下等价文件）。
- 验收：`bash swarm-yuan/tests/run-framework-fixture.sh dameng` 双态绿（violating 检出 / compliant PASS）。
