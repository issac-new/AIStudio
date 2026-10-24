# opengauss fixture 说明

- violating 主触发 4 个 fail 意图：
  - fw_opengauss_hardcoded_password —— password="..."/URL user:pass@/&password=字面值 → fail。
  - fw_opengauss_sql_concat —— SQL 关键字字符串 + 拼接 / f-string 内嵌 SQL → fail。
  - fw_opengauss_ssl_disabled —— sslmode=disable / ssl=false → fail 禁明文传输。
  - fw_opengauss_pg_hba_trust —— pg_hba.conf host 行含 trust → fail 免密全开放。
- 断言登记：**4/4 主触发已断言**（2026-08-26 实跑登记，见 violating/expected-fail-ids）。
- 反模式：violating 侧复现上述 4 条 fail 门禁命中场景；compliant 侧以对应修复（配置/代码修正）消除命中。
- 门禁无沉睡：声明的 fail 门禁全部命中，无需唤醒修复。

## violating vs compliant 差异
- violating：4 条 fail 门禁命中（详见 violating/ 下文件与 expected-fail-ids）。
- compliant：消除上述 fail 命中（对照 compliant/ 下等价文件）。
- 验收：`bash swarm-yuan/tests/run-framework-fixture.sh opengauss` 双态绿（violating 检出 / compliant PASS）。
