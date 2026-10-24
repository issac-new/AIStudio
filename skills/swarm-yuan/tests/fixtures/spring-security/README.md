# spring-security fixture 说明

- violating 主触发 5 个 fail 意图：
  - fw_ssec_adapter —— `extends WebSecurityConfigurerAdapter` 命中即 fail（6.x+ 已移除）(n/a)。
  - fw_ssec_password_encoder —— NoOp/Md5/MessageDigest/Standard/SHA/LdapSha PasswordEncoder 命中即 fail (CWE-327)。
  - fw_ssec_plaintext_password —— `.password("字面量")`（无 { 前缀）命中即 fail 明文存储 (CWE-256)。
  - fw_ssec_default_password_encoder —— `withDefaultPasswordEncoder` 命中即 fail（官方标注仅 demo）(CWE-327)。
  - fw_ssec_jwt_secret —— `signWith("字面量")`/`hmacShaKeyFor("字面量".getBytes` 或 yml `secret: 长字面量`（无 ${）命中...。
- 断言登记：**5/5 主触发已断言**（2026-08-26 实跑登记，见 violating/expected-fail-ids）。
- 反模式：violating 侧复现上述 5 条 fail 门禁命中场景；compliant 侧以对应修复（配置/代码修正）消除命中。
- 门禁无沉睡：声明的 fail 门禁全部命中，无需唤醒修复。

## violating vs compliant 差异
- violating：5 条 fail 门禁命中（详见 violating/ 下文件与 expected-fail-ids）。
- compliant：消除上述 fail 命中（对照 compliant/ 下等价文件）。
- 验收：`bash swarm-yuan/tests/run-framework-fixture.sh spring-security` 双态绿（violating 检出 / compliant PASS）。
