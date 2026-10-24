# druid fixture 说明

- violating 主触发 4 个 fail 意图：
  - fw_druid_statview_expose —— StatViewServlet 注册但未配 login-username/login-password（或为空）→ fail 监控面板无鉴权暴露 (CWE...。
  - fw_druid_wall_filter —— 数据源声明但 druid.filters 不含 wall 且无 WallFilter Bean → warn 缺 SQL 防火墙；none-base-st...。
  - fw_druid_datasource_pool —— 数据源声明但无 max-active → warn 默认8连接耗尽；max-active 有但 min-idle/initial-size 不一致 → w...。
  - fw_druid_slow_sql —— 配 slow-sql-millis 但未配 log-slow-sql（或反之）→ warn 慢 SQL 不记录 (CWE-778)。
- 断言登记：**4/4 主触发已断言**（2026-08-26 实跑登记，见 violating/expected-fail-ids）。
- 反模式：violating 侧复现上述 4 条 fail 门禁命中场景；compliant 侧以对应修复（配置/代码修正）消除命中。
- 门禁无沉睡：声明的 fail 门禁全部命中，无需唤醒修复。

## violating vs compliant 差异
- violating：4 条 fail 门禁命中（详见 violating/ 下文件与 expected-fail-ids）。
- compliant：消除上述 fail 命中（对照 compliant/ 下等价文件）。
- 验收：`bash swarm-yuan/tests/run-framework-fixture.sh druid` 双态绿（violating 检出 / compliant PASS）。
